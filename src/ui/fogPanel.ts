import type { Store } from "../state/store";
import type { RoomyState } from "../objects/catalog";

// FOG section: enable toggle + near/far range sliders + color input.
// Color uses native <input type="color"> — pragmatic over building a custom
// picker for a feature most users won't touch. Phase 7 may revisit.

export interface FogPanelHandle {
  el: HTMLElement;
  detach: () => void;
}

export function attachFogPanel({
  host,
  store,
}: {
  host: HTMLElement;
  store: Store<RoomyState>;
}): FogPanelHandle {
  const section = document.createElement("section");
  section.className = "sidebar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = "FOG";
  const suffix = document.createElement("span");
  suffix.className = "section-suffix";
  heading.append(titleSpan, suffix);

  // Enable toggle (styled button)
  const toggleRow = document.createElement("div");
  toggleRow.className = "fog-toggle-row";
  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "enable";
  toggleLabel.className = "fog-label";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "toggle";
  toggle.setAttribute("aria-label", "Enable fog");
  toggleRow.append(toggleLabel, toggle);

  // Near
  const nearRow = sliderRow("near", "0", "20", "0.1");
  const farRow = sliderRow("far", "0", "30", "0.1");

  // Color
  const colorRow = document.createElement("div");
  colorRow.className = "fog-color-row";
  const colorLabel = document.createElement("span");
  colorLabel.textContent = "color";
  colorLabel.className = "fog-label";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "fog-color";
  const colorHex = document.createElement("span");
  colorHex.className = "fog-color-hex";
  colorRow.append(colorLabel, colorInput, colorHex);

  section.append(heading, toggleRow, nearRow.row, farRow.row, colorRow);
  host.appendChild(section);

  // --- Sync from store ---
  const render = (state: RoomyState) => {
    const f = state.fog;
    suffix.textContent = f.enabled ? "on" : "off";
    toggle.classList.toggle("on", f.enabled);
    toggle.textContent = f.enabled ? "● on" : "○ off";

    if (document.activeElement !== nearRow.input) {
      nearRow.input.value = String(f.near);
      nearRow.readout.textContent = f.near.toFixed(1);
    }
    if (document.activeElement !== farRow.input) {
      farRow.input.value = String(f.far);
      farRow.readout.textContent = f.far.toFixed(1);
    }
    if (document.activeElement !== colorInput) {
      colorInput.value = f.color;
    }
    colorHex.textContent = f.color;

    // Disable near/far/color inputs visually when fog is off (still editable
    // so users can dial values before turning it on)
    section.classList.toggle("fog-off", !f.enabled);
  };

  render(store.get());
  const unsub = store.subscribe(render);

  // --- Listeners ---
  toggle.addEventListener("click", () => {
    store.set((s) => ({ ...s, fog: { ...s.fog, enabled: !s.fog.enabled } }));
  });
  nearRow.input.addEventListener("input", () => {
    store.set((s) => ({
      ...s,
      fog: { ...s.fog, near: parseFloat(nearRow.input.value) },
    }));
  });
  farRow.input.addEventListener("input", () => {
    store.set((s) => ({
      ...s,
      fog: { ...s.fog, far: parseFloat(farRow.input.value) },
    }));
  });
  colorInput.addEventListener("input", () => {
    store.set((s) => ({ ...s, fog: { ...s.fog, color: colorInput.value } }));
  });

  return {
    el: section,
    detach() {
      unsub();
      section.remove();
    },
  };
}

function sliderRow(label: string, min: string, max: string, step: string) {
  const row = document.createElement("div");
  row.className = "fog-slider-row";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  lbl.className = "fog-label";
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.className = "fog-slider";
  input.setAttribute("aria-label", `Fog ${label}`);
  const readout = document.createElement("span");
  readout.className = "fog-readout";
  row.append(lbl, input, readout);
  return { row, input, readout };
}
