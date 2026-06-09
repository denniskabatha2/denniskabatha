import { Router } from "express";
import { db, chatSessionsTable, chatMessagesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";

const router = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

const CODE_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a file. Use startLine/endLine for large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to the file" },
          startLine: { type: "number", description: "Start line (1-indexed)" },
          endLine: { type: "number", description: "End line (1-indexed)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with the given content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to the file" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "patch_file",
      description: "Apply targeted search-and-replace patches to a file. Prefer this over write_file for small changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          patches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                search: { type: "string", description: "Exact string to find" },
                replace: { type: "string", description: "Replacement string" },
                replaceAll: { type: "boolean" },
              },
              required: ["search", "replace"],
            },
          },
        },
        required: ["path", "patches"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and folders in a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path" },
          depth: { type: "number", description: "Max depth (default 2)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_directory",
      description: "Create a new directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Search for text or code patterns across files in a directory.",
      parameters: {
        type: "object",
        properties: {
          rootPath: { type: "string" },
          query: { type: "string" },
          filePattern: { type: "string", description: "e.g. *.py, *.ts" },
        },
        required: ["rootPath", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command and return stdout/stderr. Use for running tests, installing packages, compiling, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string", description: "Working directory" },
          timeout: { type: "number", description: "Timeout in milliseconds (default 30000)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_project",
      description: "Analyze a project directory and get a summary of languages, file count, and key files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_relevant_files",
      description: "Find the files most relevant to a task by scoring them against the task description. Use this before reading files for a task.",
      parameters: {
        type: "object",
        properties: {
          rootPath: { type: "string" },
          task: { type: "string" },
          maxFiles: { type: "number" },
        },
        required: ["rootPath", "task"],
      },
    },
  },
];

const DEFAULT_SYSTEM_PROMPT = `You are an elite agentic software engineer with full access to the user's filesystem and terminal. You work autonomously to complete coding tasks end-to-end.

Guidelines:
- ALWAYS use tools to explore before writing code. Start by listing the directory structure and reading relevant files.
- Use find_relevant_files to identify which files need changes before reading them — this avoids overwhelming yourself with the entire codebase.
- For large files, use startLine/endLine in read_file to read relevant sections only.
- Use patch_file for small, targeted changes. Use write_file only when creating new files or rewriting completely.
- Always run_command to test your changes (run tests, lint, or start the app).
- When you encounter errors, read the error output carefully, locate the root cause, and fix it — then verify the fix.
- Think step by step. Announce what you're about to do, do it, then confirm.
- Be precise and complete — never leave TODO placeholders unless explicitly asked.`;

router.get("/chat/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(chatSessionsTable).orderBy(desc(chatSessionsTable.updatedAt));
    const withCounts = await Promise.all(
      sessions.map(async (s) => {
        const [{ value }] = await db
          .select({ value: count() })
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.sessionId, s.id));
        return {
          id: s.id,
          name: s.name,
          model: s.model,
          workspacePath: s.workspacePath,
          systemPrompt: s.systemPrompt,
          messageCount: Number(value),
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        };
      })
    );
    res.json(withCounts);
  } catch (err) {
    req.log.error({ err }, "listSessions error");
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.post("/chat/sessions", async (req, res) => {
  const { name, model, workspacePath, systemPrompt } = req.body as {
    name: string; model: string; workspacePath?: string; systemPrompt?: string;
  };
  if (!name || !model) { res.status(400).json({ error: "name and model required" }); return; }
  try {
    const [session] = await db.insert(chatSessionsTable).values({ name, model, workspacePath, systemPrompt }).returning();
    res.status(201).json({
      id: session.id,
      name: session.name,
      model: session.model,
      workspacePath: session.workspacePath,
      systemPrompt: session.systemPrompt,
      messageCount: 0,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "createSession error");
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/chat/sessions/:sessionId", async (req, res) => {
  const id = parseInt(req.params.sessionId);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid sessionId" }); return; }
  try {
    const [session] = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, id));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    const messages = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.sessionId, id));
    res.json({
      ...session,
      workspacePath: session.workspacePath,
      systemPrompt: session.systemPrompt,
      messageCount: messages.length,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messages: messages.map(m => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "getSession error");
    res.status(500).json({ error: "Failed to get session" });
  }
});

router.delete("/chat/sessions/:sessionId", async (req, res) => {
  const id = parseInt(req.params.sessionId);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid sessionId" }); return; }
  try {
    await db.delete(chatSessionsTable).where(eq(chatSessionsTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteSession error");
    res.status(500).json({ error: "Failed to delete session" });
  }
});

router.get("/chat/sessions/:sessionId/messages", async (req, res) => {
  const id = parseInt(req.params.sessionId);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid sessionId" }); return; }
  try {
    const messages = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.sessionId, id));
    res.json(messages.map(m => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      createdAt: m.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "getMessages error");
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// SSE streaming chat — not in codegen, handled raw
router.post("/chat/stream", async (req, res) => {
  const { sessionId, message, model: overrideModel } = req.body as {
    sessionId: number; message: string; model?: string;
  };
  if (!sessionId || !message) { res.status(400).json({ error: "sessionId and message required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const [session] = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));
    if (!session) { sendEvent({ error: "Session not found", done: true }); res.end(); return; }

    const model = overrideModel || session.model;
    const historyRows = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.sessionId, sessionId));

    // Save user message
    await db.insert(chatMessagesTable).values({ sessionId, role: "user", content: message });

    const systemPrompt = session.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const history = historyRows.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: message },
    ];

    let fullContent = "";
    let continueLoop = true;
    let iteration = 0;
    const MAX_ITERATIONS = 10;

    while (continueLoop && iteration < MAX_ITERATIONS) {
      iteration++;
      const ollamaBody: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        tools: CODE_TOOL_DEFINITIONS,
        options: { temperature: 0.1 },
      };

      let ollamaRes: Response;
      try {
        ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ollamaBody),
          signal: AbortSignal.timeout(300_000),
        });
      } catch (err) {
        sendEvent({ error: `Cannot reach Ollama: ${(err as Error).message}`, done: true });
        res.end();
        return;
      }

      if (!ollamaRes.ok) {
        sendEvent({ error: `Ollama error: ${ollamaRes.status}`, done: true });
        res.end();
        return;
      }

      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      let chunkText = "";
      let toolCallsAccum: Array<{ id?: string; function?: { name: string; arguments: string } }> = [];
      let isDone = false;

      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value);
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(trimmed); } catch { continue; }

          const msgPayload = parsed["message"] as Record<string, unknown> | undefined;
          if (msgPayload) {
            const tokenContent = (msgPayload["content"] as string) || "";
            if (tokenContent) {
              chunkText += tokenContent;
              fullContent += tokenContent;
              sendEvent({ token: tokenContent });
            }
            const toolCalls = msgPayload["tool_calls"] as Array<{ function?: { name: string; arguments: Record<string, unknown> } }> | undefined;
            if (toolCalls && toolCalls.length > 0) {
              for (const tc of toolCalls) {
                if (tc.function) {
                  toolCallsAccum.push({
                    function: {
                      name: tc.function.name,
                      arguments: typeof tc.function.arguments === "string"
                        ? tc.function.arguments
                        : JSON.stringify(tc.function.arguments),
                    },
                  });
                }
              }
            }
          }

          if (parsed["done"] === true) { isDone = true; break; }
        }
      }

      if (toolCallsAccum.length > 0) {
        // Save assistant message with tool calls
        await db.insert(chatMessagesTable).values({
          sessionId,
          role: "assistant",
          content: chunkText || "",
          toolCalls: JSON.stringify(toolCallsAccum),
        });
        messages.push({ role: "assistant" as const, content: chunkText || JSON.stringify(toolCallsAccum) });

        // Execute tool calls
        for (const tc of toolCallsAccum) {
          if (!tc.function) continue;
          const fnName = tc.function.name;
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

          sendEvent({ toolCall: { name: fnName, arguments: args } });

          let toolResult = "";
          try {
            toolResult = await executeTool(fnName, args, session.workspacePath || undefined);
          } catch (err) {
            toolResult = `Error: ${(err as Error).message}`;
          }

          sendEvent({ toolResult: { name: fnName, result: toolResult.slice(0, 2000) } });

          // Save tool result as assistant message
          await db.insert(chatMessagesTable).values({
            sessionId,
            role: "tool",
            content: toolResult,
          });
          messages.push({ role: "user" as const, content: `Tool result for ${fnName}:\n${toolResult}` });
        }
        toolCallsAccum = [];
        chunkText = "";
      } else {
        // No tool calls — final response
        if (fullContent || chunkText) {
          await db.insert(chatMessagesTable).values({ sessionId, role: "assistant", content: fullContent || chunkText });
        }
        // Update session updatedAt
        await db.update(chatSessionsTable).set({ updatedAt: new Date() }).where(eq(chatSessionsTable.id, sessionId));
        continueLoop = false;
      }
    }

    sendEvent({ done: true });
    res.end();
  } catch (err) {
    req.log.error({ err }, "chat/stream error");
    sendEvent({ error: "Internal error", done: true });
    res.end();
  }
});

async function executeTool(name: string, args: Record<string, unknown>, workspacePath?: string): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs/promises");
  const path = await import("path");

  const resolvePath = (p: unknown) => {
    const str = String(p);
    if (path.isAbsolute(str)) return str;
    return path.join(workspacePath || process.cwd(), str);
  };

  switch (name) {
    case "read_file": {
      const filePath = resolvePath(args.path);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const sl = (args.startLine as number) || 1;
      const el = (args.endLine as number) || lines.length;
      return `File: ${filePath} (lines ${sl}-${el} of ${lines.length})\n\n${lines.slice(sl - 1, el).join("\n")}`;
    }
    case "write_file": {
      const filePath = resolvePath(args.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, String(args.content), "utf-8");
      return `Written ${filePath} (${String(args.content).length} bytes)`;
    }
    case "patch_file": {
      const filePath = resolvePath(args.path);
      let content = await fs.readFile(filePath, "utf-8");
      let patchCount = 0;
      for (const p of (args.patches as Array<{ search: string; replace: string; replaceAll?: boolean }>) || []) {
        if (p.replaceAll) {
          content = content.split(p.search).join(p.replace);
        } else {
          const idx = content.indexOf(p.search);
          if (idx !== -1) {
            content = content.slice(0, idx) + p.replace + content.slice(idx + p.search.length);
            patchCount++;
          }
        }
      }
      await fs.writeFile(filePath, content, "utf-8");
      return `Patched ${filePath} (${patchCount} changes applied)`;
    }
    case "list_directory": {
      const dirPath = resolvePath(args.path);
      const depth = (args.depth as number) || 2;
      const buildTree = async (dir: string, d: number, prefix = ""): Promise<string> => {
        if (d === 0) return "";
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let out = "";
        for (const e of entries) {
          if (["node_modules", ".git", "dist", "build", "__pycache__"].includes(e.name)) continue;
          out += `${prefix}${e.isDirectory() ? "📁" : "📄"} ${e.name}\n`;
          if (e.isDirectory() && d > 1) {
            out += await buildTree(path.join(dir, e.name), d - 1, prefix + "  ");
          }
        }
        return out;
      };
      return `Directory: ${dirPath}\n${await buildTree(dirPath, depth)}`;
    }
    case "create_directory": {
      const dirPath = resolvePath(args.path);
      await fs.mkdir(dirPath, { recursive: true });
      return `Created directory: ${dirPath}`;
    }
    case "search_code": {
      const rootPath = resolvePath(args.rootPath);
      const query = String(args.query);
      const results: string[] = [];
      const searchDir = async (dir: string) => {
        if (results.length >= 20) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (["node_modules", ".git", "dist"].includes(e.name)) continue;
          const fp = path.join(dir, e.name);
          if (e.isDirectory()) { await searchDir(fp); }
          else {
            try {
              const text = await fs.readFile(fp, "utf-8");
              const lines = text.split("\n");
              lines.forEach((l, i) => {
                if (results.length < 20 && l.toLowerCase().includes(query.toLowerCase())) {
                  results.push(`${fp}:${i + 1}: ${l.trim()}`);
                }
              });
            } catch { /* skip */ }
          }
        }
      };
      await searchDir(rootPath);
      return results.length ? results.join("\n") : "No matches found";
    }
    case "run_command": {
      const cwd = args.cwd ? resolvePath(args.cwd) : (workspacePath || process.cwd());
      const timeout = (args.timeout as number) || 30000;
      try {
        const stdout = execSync(String(args.command), { cwd, timeout, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        return `STDOUT:\n${stdout}`;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return `ERROR:\nSTDOUT: ${e.stdout || ""}\nSTDERR: ${e.stderr || e.message || ""}`;
      }
    }
    case "analyze_project": {
      const projectPath = resolvePath(args.path);
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      const names = entries.map(e => `${e.isDirectory() ? "[DIR]" : "[FILE]"} ${e.name}`).join("\n");
      return `Project root (${projectPath}):\n${names}`;
    }
    case "find_relevant_files": {
      const rootPath = resolvePath(args.rootPath);
      const task = String(args.task);
      const taskWords = task.toLowerCase().split(/\W+/).filter(w => w.length > 2);
      const results: Array<{ path: string; score: number }> = [];
      const scan = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (["node_modules", ".git", "dist", "build"].includes(e.name)) continue;
          const fp = path.join(dir, e.name);
          if (e.isDirectory()) { await scan(fp); }
          else {
            let score = 0;
            const rel = path.relative(rootPath, fp).toLowerCase();
            for (const w of taskWords) { if (rel.includes(w)) score += 10; }
            if (score > 0) results.push({ path: fp, score });
          }
        }
      };
      await scan(rootPath);
      const top = results.sort((a, b) => b.score - a.score).slice(0, (args.maxFiles as number) || 10);
      return top.length ? top.map(r => `${r.path} (score: ${r.score})`).join("\n") : "No relevant files found";
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

export default router;
