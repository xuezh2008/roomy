// Tab-visibility gating for the RAF loop.
// Browsers already throttle RAF in hidden tabs, but the throttle behavior
// varies (full pause vs 1 Hz) and audio contexts can keep things spinning.
// An explicit gate guarantees zero render work when the user can't see it.

export interface VisibilityHandle {
  isVisible: () => boolean;
  detach: () => void;
}

export function attachVisibility(
  onChange?: (visible: boolean) => void,
): VisibilityHandle {
  let visible = !document.hidden;

  const handler = () => {
    const next = !document.hidden;
    if (next === visible) return;
    visible = next;
    onChange?.(visible);
  };

  document.addEventListener("visibilitychange", handler);

  return {
    isVisible: () => visible,
    detach: () => document.removeEventListener("visibilitychange", handler),
  };
}
