import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "@workspace/db";
import { workspacesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);
const router = Router();

const IGNORE = ["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".DS_Store"];

const EXT_LANG_MAP: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".cpp": "C++", ".cc": "C++", ".cxx": "C++",
  ".c": "C", ".h": "C",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".cs": "C#",
  ".html": "HTML", ".htm": "HTML",
  ".css": "CSS", ".scss": "CSS", ".sass": "CSS",
  ".json": "JSON",
  ".yaml": "YAML", ".yml": "YAML",
  ".md": "Markdown",
  ".sh": "Shell", ".bash": "Shell",
};

const KEY_FILES = [
  "package.json", "requirements.txt", "Cargo.toml", "go.mod",
  "pom.xml", "build.gradle", "pyproject.toml", "setup.py",
  "README.md", "Makefile", "Dockerfile", ".env.example",
  "tsconfig.json", "vite.config.ts", "next.config.js",
];

async function scanDir(dir: string, stats: Map<string, number>, fileSizeMap: Map<string, number>): Promise<void> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (IGNORE.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath, stats, fileSizeMap);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const lang = EXT_LANG_MAP[ext];
      if (lang) stats.set(lang, (stats.get(lang) || 0) + 1);
      try {
        const s = await fs.stat(fullPath);
        fileSizeMap.set(fullPath, s.size);
      } catch { /* skip */ }
    }
  }
}

router.post("/project/analyze", async (req, res) => {
  const { path: projectPath } = req.body as { path: string; includeStats?: boolean };
  if (!projectPath) { res.status(400).json({ error: "path required" }); return; }

  try {
    const stats = new Map<string, number>();
    const fileSizeMap = new Map<string, number>();
    await scanDir(projectPath, stats, fileSizeMap);

    const totalSize = Array.from(fileSizeMap.values()).reduce((a, b) => a + b, 0);
    const totalFiles = fileSizeMap.size;
    const totalLangFiles = Array.from(stats.values()).reduce((a, b) => a + b, 0);

    const languages = Array.from(stats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([language, fileCount]) => ({
        language,
        fileCount,
        percentage: totalLangFiles > 0 ? Math.round((fileCount / totalLangFiles) * 100) : 0,
      }));

    const foundKeyFiles: string[] = [];
    for (const kf of KEY_FILES) {
      const kfPath = path.join(projectPath, kf);
      if (fileSizeMap.has(kfPath)) foundKeyFiles.push(kfPath);
    }

    let gitBranch: string | null = null;
    let hasGit = false;
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: projectPath });
      gitBranch = stdout.trim();
      hasGit = true;
    } catch { /* no git */ }

    res.json({
      path: projectPath,
      name: path.basename(projectPath),
      fileCount: totalFiles,
      totalSize,
      languages,
      keyFiles: foundKeyFiles,
      gitBranch,
      hasGit,
    });
  } catch (err) {
    req.log.error({ err }, "analyzeProject error");
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/project/relevant", async (req, res) => {
  const { rootPath, task, maxFiles = 10 } = req.body as {
    rootPath: string; task: string; maxFiles?: number;
  };
  if (!rootPath || !task) { res.status(400).json({ error: "rootPath and task required" }); return; }

  const taskWords = task.toLowerCase().split(/\W+/).filter(w => w.length > 2);

  const scored: Array<{ path: string; score: number; reason: string; size: number }> = [];
  const fileSizeMap = new Map<string, number>();
  const stats = new Map<string, number>();
  await scanDir(rootPath, stats, fileSizeMap);

  for (const [filePath, size] of fileSizeMap) {
    if (size > 500_000) continue;
    const relativePath = path.relative(rootPath, filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    if (KEY_FILES.map(f => f.toLowerCase()).includes(fileName)) {
      score += 20;
      reasons.push("key project file");
    }

    for (const word of taskWords) {
      if (relativePath.includes(word)) { score += 10; reasons.push(`path matches "${word}"`); }
      if (fileName.includes(word)) { score += 15; reasons.push(`filename matches "${word}"`); }
    }

    const codingExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".cpp", ".c", ".rb", ".php"];
    if (codingExts.includes(ext)) score += 5;

    if (score > 0) {
      scored.push({ path: filePath, score, reason: reasons.slice(0, 2).join(", "), size });
    }
  }

  const result = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles);

  res.json(result);
});

router.get("/project/workspaces", async (req, res) => {
  try {
    const rows = await db.select().from(workspacesTable);
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      path: r.path,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "listWorkspaces error");
    res.status(500).json({ error: "Failed to list workspaces" });
  }
});

router.post("/project/workspaces", async (req, res) => {
  const { name, path: workspacePath } = req.body as { name: string; path: string };
  if (!name || !workspacePath) { res.status(400).json({ error: "name and path required" }); return; }
  try {
    const [row] = await db.insert(workspacesTable).values({ name, path: workspacePath }).returning();
    res.status(201).json({ id: row.id, name: row.name, path: row.path, createdAt: row.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "addWorkspace error");
    res.status(500).json({ error: "Failed to add workspace" });
  }
});

router.delete("/project/workspaces/:workspaceId", async (req, res) => {
  const id = parseInt(req.params.workspaceId);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(workspacesTable).where(eq(workspacesTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "removeWorkspace error");
    res.status(500).json({ error: "Failed to remove workspace" });
  }
});

export default router;
