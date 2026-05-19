// API key + provider preference, persisted to localStorage (separately from
// the scene state). Keys never leave this browser; this is the explicit
// trade-off for the no-backend GitHub Pages deploy.

import type { Provider } from "../ai/types";

const KEY = "roomy:settings";

export interface AISettings {
  geminiKey: string;
  openaiKey: string;
  preferredProvider: Provider;
}

const DEFAULTS: AISettings = {
  geminiKey: "",
  openaiKey: "",
  preferredProvider: "gemini",
};

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AISettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[roomy] could not persist settings:", e);
  }
}

export function hasKey(s: AISettings, p: Provider): boolean {
  return p === "gemini" ? s.geminiKey.length > 0 : s.openaiKey.length > 0;
}
