import { callGemini } from "./gemini";
import { callOpenAI } from "./openai";
import type { RenderRequest } from "./types";

export async function renderWithAI(req: RenderRequest): Promise<Blob> {
  switch (req.provider) {
    case "gemini":
      return callGemini(req);
    case "openai":
      return callOpenAI(req);
  }
}

export * from "./types";
