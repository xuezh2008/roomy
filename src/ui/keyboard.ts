// Global keyboard shortcuts. Hands input through to focused text fields
// (don't hijack typing). More keys added in Phase 3b (R, Del, Esc) and
// Phase 7 (Cmd+Enter for render).

export type KeyHandler = () => void;

export interface KeyboardBindings {
  onAddObject?: KeyHandler; // N: focus name input on the New Object form
}

const TEXT_INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TEXT_INPUT_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

export function attachKeyboard(bindings: KeyboardBindings): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // reserved for future shortcuts
    if (isTypingTarget(e.target)) return; // don't hijack form typing

    switch (e.key.toLowerCase()) {
      case "n":
        if (bindings.onAddObject) {
          e.preventDefault();
          bindings.onAddObject();
        }
        break;
      // Phase 3b adds: r (rotate), Delete, Escape, Backspace
      // Phase 7 adds: Cmd+Enter (render)
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
