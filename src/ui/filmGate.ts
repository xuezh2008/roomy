// Film-gate overlay: visualizes the 16:9 region that the snapshot actually
// captures, relative to the current canvas aspect.
//
// The snapshot camera clones the main camera and forces aspect = 16:9
// while keeping vertical FOV. That means top/bottom of the snapshot always
// align with top/bottom of the canvas; only horizontal extent differs.
//
//   - canvas wider than 16:9  → snapshot horizontal is narrower; gate shows
//     letterbox bars on the sides indicating those areas get cropped.
//   - canvas narrower than 16:9 → snapshot horizontal is wider; gate flips
//     to accent-red overscan mode + label telling the user how much extra
//     the snapshot will see (content not visible in the viewport).
//   - canvas exactly 16:9      → gate is a thin frame matching the canvas.

const FILM_ASPECT = 16 / 9;

export interface FilmGateHandle {
  el: HTMLElement;
  toggleBtn: HTMLButtonElement;
  setVisible: (v: boolean) => void;
  isVisible: () => boolean;
  detach: () => void;
}

export function attachFilmGate({
  host,
  initialVisible,
  onToggle,
}: {
  host: HTMLElement;
  initialVisible: boolean;
  onToggle: (visible: boolean) => void;
}): FilmGateHandle {
  // Toggle button (always visible in canvas top-right; persists drawer state).
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "film-gate-toggle";
  toggle.setAttribute("aria-label", "Toggle film gate (snapshot preview)");
  toggle.innerHTML = `<span class="film-gate-icon">▣</span><span>film gate</span>`;
  host.appendChild(toggle);

  // Overlay (positioned absolutely inside canvas-shell).
  const gate = document.createElement("div");
  gate.className = "film-gate";
  gate.hidden = !initialVisible;
  gate.innerHTML = `
    <div class="film-gate-bar film-gate-bar-left"></div>
    <div class="film-gate-bar film-gate-bar-right"></div>
    <div class="film-gate-frame"></div>
    <div class="film-gate-label">16:9</div>
  `;
  host.appendChild(gate);

  const left = gate.querySelector<HTMLDivElement>(".film-gate-bar-left")!;
  const right = gate.querySelector<HTMLDivElement>(".film-gate-bar-right")!;
  const frame = gate.querySelector<HTMLDivElement>(".film-gate-frame")!;
  const label = gate.querySelector<HTMLDivElement>(".film-gate-label")!;

  let visible = initialVisible;

  const update = () => {
    if (!visible) return;
    const rect = host.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W < 2 || H < 2) return;

    const captureW = H * FILM_ASPECT;

    if (captureW <= W) {
      // Letterbox: snapshot crops the canvas horizontally.
      const x = (W - captureW) / 2;
      left.style.cssText = `left: 0; top: 0; width: ${x}px; height: 100%;`;
      right.style.cssText = `right: 0; top: 0; width: ${x}px; height: 100%;`;
      frame.style.cssText = `left: ${x}px; top: 0; width: ${captureW}px; height: 100%;`;
      label.textContent = "16:9 · capture";
      gate.classList.remove("overscan");
    } else {
      // Snapshot horizontally extends beyond the canvas.
      left.style.cssText = "width: 0;";
      right.style.cssText = "width: 0;";
      frame.style.cssText = "left: 0; top: 0; width: 100%; height: 100%;";
      const overshoot = (captureW - W) / 2;
      label.textContent = `16:9 · snapshot extends ${Math.round(overshoot)} px beyond each side`;
      gate.classList.add("overscan");
    }
  };

  const renderToggleState = () => {
    toggle.classList.toggle("active", visible);
    gate.hidden = !visible;
    if (visible) update();
  };
  renderToggleState();

  toggle.addEventListener("click", () => {
    visible = !visible;
    renderToggleState();
    onToggle(visible);
  });

  const observer = new ResizeObserver(update);
  observer.observe(host);

  return {
    el: gate,
    toggleBtn: toggle,
    setVisible(v) {
      visible = v;
      renderToggleState();
    },
    isVisible: () => visible,
    detach() {
      observer.disconnect();
      gate.remove();
      toggle.remove();
    },
  };
}
