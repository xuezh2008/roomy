// Global keyboard shortcuts. Hands input through to focused text fields
// (don't hijack typing). Phase 7 will add Cmd+Enter for AI render.

export type KeyHandler = () => void;

export interface KeyboardBindings {
  onAddObject?: KeyHandler; // N: focus name input on the New Object form
  onRotate?: KeyHandler; // R: rotate selected by 90° around Y
  onDelete?: KeyHandler; // Delete / Backspace: remove selected
  onDeselect?: KeyHandler; // Escape: clear selection
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

    // Escape is special — it should ALWAYS fire (even from inside form inputs),
    // because users hit Esc to dismiss / cancel.
    if (e.key === "Escape") {
      if (bindings.onDeselect) {
        e.preventDefault();
        bindings.onDeselect();
      }
      return;
    }

    if (isTypingTarget(e.target)) return; // other keys don't hijack typing

    switch (e.key.toLowerCase()) {
      case "n":
        if (bindings.onAddObject) {
          e.preventDefault();
          // Defer focus so the in-flight 'n' keystroke doesn't land in the
          // input we're about to focus. preventDefault on window keydown does
          // NOT stop a subsequent keypress on a newly-focused input mid-cycle.
          setTimeout(bindings.onAddObject, 0);
        }
        break;
      case "r":
        if (bindings.onRotate) {
          e.preventDefault();
          bindings.onRotate();
        }
        break;
      case "delete":
      case "backspace":
        if (bindings.onDelete) {
          e.preventDefault();
          bindings.onDelete();
        }
        break;
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
