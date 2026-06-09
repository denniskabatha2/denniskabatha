import { Router } from "express";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

const router = Router();

interface TerminalSession {
  id: string;
  command: string;
  cwd: string;
  running: boolean;
  startedAt: string;
  pid?: number;
  process?: ReturnType<typeof spawn>;
  stdout: string;
  stderr: string;
  exitCode?: number;
}

const sessions = new Map<string, TerminalSession>();

router.post("/execute", async (req, res) => {
  const { command, cwd = process.cwd(), timeout = 30000, sessionId } = req.body as {
    command: string; cwd?: string; timeout?: number; sessionId?: string;
  };
  if (!command) { res.status(400).json({ error: "command required" }); return; }

  const id = sessionId || randomUUID();
  const startedAt = new Date().toISOString();
  const start = Date.now();

  const session: TerminalSession = {
    id,
    command,
    cwd,
    running: true,
    startedAt,
    stdout: "",
    stderr: "",
  };
  sessions.set(id, session);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("bash", ["-c", command], {
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
        stdio: ["pipe", "pipe", "pipe"],
      });

      session.pid = child.pid;
      session.process = child;

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);

      child.stdout?.on("data", (data: Buffer) => { session.stdout += data.toString(); });
      child.stderr?.on("data", (data: Buffer) => { session.stderr += data.toString(); });

      child.on("close", (code) => {
        clearTimeout(timer);
        session.exitCode = code ?? 1;
        session.running = false;
        const duration = Date.now() - start;

        res.json({
          stdout: session.stdout,
          stderr: session.stderr,
          exitCode: session.exitCode,
          duration,
          timedOut,
          sessionId: id,
        });
        resolve();
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        session.running = false;
        reject(err);
      });
    });
  } catch (err) {
    req.log.error({ err }, "execute error");
    sessions.delete(id);
    res.status(500).json({ error: "Execution failed" });
  }
});

router.get("/execute/sessions", (_req, res) => {
  const result = Array.from(sessions.values()).map(s => ({
    id: s.id,
    command: s.command,
    cwd: s.cwd,
    running: s.running,
    startedAt: s.startedAt,
    pid: s.pid ?? null,
  }));
  res.json(result);
});

router.post("/execute/sessions/:terminalId/kill", (req, res) => {
  const { terminalId } = req.params;
  const session = sessions.get(terminalId);
  if (!session) {
    res.status(404).json({ success: false, message: "Session not found" });
    return;
  }
  try {
    session.process?.kill("SIGKILL");
    session.running = false;
    res.json({ success: true, message: "Session killed" });
  } catch {
    res.status(500).json({ success: false, message: "Failed to kill session" });
  }
});

export { sessions };
export default router;
