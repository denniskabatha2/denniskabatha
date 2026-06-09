import { Router } from "express";

const router = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

router.get("/models", async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      res.status(502).json({ error: "Ollama returned non-OK status" });
      return;
    }
    const data = await response.json() as { models: Array<{ name: string; size: number; modified_at: string; digest: string }> };
    res.json(data.models || []);
  } catch (err: unknown) {
    req.log.warn({ err }, "Failed to list Ollama models");
    res.status(502).json({ error: "Cannot reach Ollama" });
  }
});

router.get("/models/status", async (req, res) => {
  const url = OLLAMA_URL;
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      res.json({ reachable: false, url, modelCount: 0, error: `HTTP ${response.status}` });
      return;
    }
    const data = await response.json() as { models: unknown[] };
    res.json({ reachable: true, url, modelCount: (data.models || []).length, error: null });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "Unknown error";
    res.json({ reachable: false, url, modelCount: 0, error });
  }
});

export default router;
