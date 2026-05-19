// Viewport-mode detection. Sets data-mode='mobile' | 'desktop' on <html>.
// Engages mobile mode when EITHER:
//   - viewport width <= 1023px, OR
//   - primary pointer is coarse (touch)
// Comma in a media query is OR; matches DESIGN.md §11 activation rules.

const MOBILE_MEDIA = "(max-width: 1023px), (pointer: coarse)";

export type ViewportMode = "mobile" | "desktop";

export interface MobileHandle {
  mode: () => ViewportMode;
  isMobile: () => boolean;
  detach: () => void;
}

export function attachMobileMode(
  onChange?: (mode: ViewportMode) => void,
): MobileHandle {
  const mql = window.matchMedia(MOBILE_MEDIA);
  let current: ViewportMode = mql.matches ? "mobile" : "desktop";

  const apply = (mode: ViewportMode) => {
    document.documentElement.dataset.mode = mode;
  };

  apply(current);

  const handler = (event: MediaQueryListEvent) => {
    const next: ViewportMode = event.matches ? "mobile" : "desktop";
    if (next === current) return;
    current = next;
    apply(current);
    onChange?.(current);
  };

  mql.addEventListener("change", handler);

  return {
    mode: () => current,
    isMobile: () => current === "mobile",
    detach: () => mql.removeEventListener("change", handler),
  };
}
