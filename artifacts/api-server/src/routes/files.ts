import { Router } from "express";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const router = Router();

const DEFAULT_IGNORE = [
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".DS_Store", "*.pyc", ".env", ".env.local", "*.log",
];

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: TreeNode[];
}

async function buildTree(dirPath: string, depth: number, maxDepth: number, ignorePatterns: string[]): Promise<TreeNode[]> {
  if (depth > maxDepth) return [];
  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true }) as fsSync.Dirent[];
  } catch {
    return [];
  }

  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (ignorePatterns.some(p => {
      if (p.startsWith("*.")) return entry.name.endsWith(p.slice(1));
      return entry.name === p;
    })) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = depth < maxDepth ? await buildTree(fullPath, depth + 1, maxDepth, ignorePatterns) : [];
      nodes.push({ name: entry.name, path: fullPath, type: "directory", children });
    } else {
      let size: number | undefined;
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch { /* ignore */ }
      nodes.push({ name: entry.name, path: fullPath, type: "file", size });
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

router.post("/files/tree", async (req, res) => {
  const { path: dirPath, depth = 4, ignorePatterns = [] } = req.body as {
    path: string; depth?: number; ignorePatterns?: string[];
  };
  if (!dirPath) { res.status(400).json({ error: "path required" }); return; }

  const allIgnore = [...DEFAULT_IGNORE, ...ignorePatterns];
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) { res.status(400).json({ error: "Not a directory" }); return; }
    const children = await buildTree(dirPath, 1, depth, allIgnore);
    const node: TreeNode = {
      name: path.basename(dirPath),
      path: dirPath,
      type: "directory",
      children,
    };
    res.json(node);
  } catch (err) {
    req.log.error({ err }, "getFileTree error");
    res.status(500).json({ error: "Failed to read directory" });
  }
});

router.post("/files/read", async (req, res) => {
  const { path: filePath, startLine, endLine } = req.body as {
    path: string; startLine?: number; endLine?: number;
  };
  if (!filePath) { res.status(400).json({ error: "path required" }); return; }

  try {
    const stat = await fs.stat(filePath);
    const rawContent = await fs.readFile(filePath, "utf-8");
    const lines = rawContent.split("\n");
    const totalLines = lines.length;

    const sl = startLine ?? 1;
    const el = endLine ?? totalLines;
    const slicedLines = lines.slice(sl - 1, el);
    const content = slicedLines.join("\n");

    res.json({
      path: filePath,
      content,
      totalLines,
      startLine: sl,
      endLine: el,
      truncated: el < totalLines,
      size: stat.size,
    });
  } catch (err) {
    req.log.error({ err }, "readFile error");
    res.status(500).json({ error: "Failed to read file" });
  }
});

router.post("/files/write", async (req, res) => {
  const { path: filePath, content, createDirs = true, backup = false } = req.body as {
    path: string; content: string; createDirs?: boolean; backup?: boolean;
  };
  if (!filePath || content === undefined) { res.status(400).json({ error: "path and content required" }); return; }

  try {
    if (createDirs) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }
    if (backup) {
      try {
        const existing = await fs.readFile(filePath, "utf-8");
        await fs.writeFile(`${filePath}.bak`, existing, "utf-8");
      } catch { /* file didn't exist */ }
    }
    await fs.writeFile(filePath, content, "utf-8");
    res.json({ success: true, message: "File written", path: filePath });
  } catch (err) {
    req.log.error({ err }, "writeFile error");
    res.status(500).json({ error: "Failed to write file" });
  }
});

router.post("/files/delete", async (req, res) => {
  const { path: filePath, recursive = false } = req.body as { path: string; recursive?: boolean };
  if (!filePath) { res.status(400).json({ error: "path required" }); return; }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive, force: true });
    } else {
      await fs.unlink(filePath);
    }
    res.json({ success: true, message: "Deleted", path: filePath });
  } catch (err) {
    req.log.error({ err }, "deleteFile error");
    res.status(500).json({ error: "Failed to delete" });
  }
});

router.post("/files/mkdir", async (req, res) => {
  const { path: dirPath, recursive = true } = req.body as { path: string; recursive?: boolean };
  if (!dirPath) { res.status(400).json({ error: "path required" }); return; }

  try {
    await fs.mkdir(dirPath, { recursive });
    res.json({ success: true, message: "Directory created", path: dirPath });
  } catch (err) {
    req.log.error({ err }, "mkdir error");
    res.status(500).json({ error: "Failed to create directory" });
  }
});

router.post("/files/patch", async (req, res) => {
  const { path: filePath, patches } = req.body as {
    path: string;
    patches: Array<{ search: string; replace: string; replaceAll?: boolean }>;
  };
  if (!filePath || !patches) { res.status(400).json({ error: "path and patches required" }); return; }

  try {
    let content = await fs.readFile(filePath, "utf-8");
    let patchCount = 0;
    for (const patch of patches) {
      if (patch.replaceAll) {
        const before = content;
        content = content.split(patch.search).join(patch.replace);
        if (content !== before) patchCount++;
      } else {
        const idx = content.indexOf(patch.search);
        if (idx !== -1) {
          content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.search.length);
          patchCount++;
        }
      }
    }
    await fs.writeFile(filePath, content, "utf-8");
    res.json({ success: true, message: `Applied ${patchCount} patches`, path: filePath });
  } catch (err) {
    req.log.error({ err }, "patchFile error");
    res.status(500).json({ error: "Failed to patch file" });
  }
});

router.post("/files/search", async (req, res) => {
  const { rootPath, query, filePattern, maxResults = 50, caseSensitive = false } = req.body as {
    rootPath: string; query: string; filePattern?: string; maxResults?: number; caseSensitive?: boolean;
  };
  if (!rootPath || !query) { res.status(400).json({ error: "rootPath and query required" }); return; }

  const results: Array<{ file: string; line: number; content: string; context: string }> = [];

  async function searchDir(dir: string): Promise<void> {
    if (results.length >= maxResults) return;
    let entries: fsSync.Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }) as fsSync.Dirent[]; } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);
      if (DEFAULT_IGNORE.includes(entry.name)) continue;

      if (entry.isDirectory()) {
        await searchDir(fullPath);
      } else {
        if (filePattern && !entry.name.match(filePattern.replace("*", ".*"))) continue;
        try {
          const text = await fs.readFile(fullPath, "utf-8");
          const lines = text.split("\n");
          const searchQuery = caseSensitive ? query : query.toLowerCase();
          lines.forEach((lineContent, idx) => {
            if (results.length >= maxResults) return;
            const searchLine = caseSensitive ? lineContent : lineContent.toLowerCase();
            if (searchLine.includes(searchQuery)) {
              const contextLines = lines.slice(Math.max(0, idx - 1), Math.min(lines.length, idx + 2));
              results.push({
                file: fullPath,
                line: idx + 1,
                content: lineContent,
                context: contextLines.join("\n"),
              });
            }
          });
        } catch { /* skip binary files */ }
      }
    }
  }

  try {
    await searchDir(rootPath);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "searchInFiles error");
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
