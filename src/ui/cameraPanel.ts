import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

// CAMERA section: 4 preset buttons, FOV slider with editable readout, X/Y/Z
// position chips, "reset camera" text link. Preset clicks tween the camera
// over 400 ms (snap under prefers-reduced-motion).

const TWEEN_MS = 400;

export interface CameraPreset {
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const PRESETS: CameraPreset[] = [
  {
    name: "Top",
    position: new THREE.Vector3(0, 8, 0.001), // +Z epsilon avoids gimbal lock
    target: new THREE.Vector3(0, 0, 0),
    fov: 50,
  },
  {
    name: "Front",
    position: new THREE.Vector3(0, 1.3, 5.5),
    target: new THREE.Vector3(0, 1.3, 0),
    fov: 50,
  },
  {
    name: "Iso",
    position: new THREE.Vector3(4, 3, 5),
    target: new THREE.Vector3(0, 0.5, 0),
    fov: 50,
  },
  {
    name: "Eye-lvl",
    position: new THREE.Vector3(1.6, 1.6, 2.6),
    target: new THREE.Vector3(0, 1.0, 0),
    fov: 50,
  },
];

interface Tween {
  startTime: number;
  duration: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
}

export interface CameraPanelHandle {
  el: HTMLElement;
  update: () => void; // call each frame
  detach: () => void;
}

export function attachCameraPanel({
  host,
  camera,
  orbit,
}: {
  host: HTMLElement;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
}): CameraPanelHandle {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let tween: Tween | null = null;

  // --- DOM ---
  const section = document.createElement("section");
  section.className = "sidebar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = "CAMERA";
  const suffixSpan = document.createElement("span");
  suffixSpan.className = "section-suffix";
  suffixSpan.textContent = "iso · 50°";
  heading.append(titleSpan, suffixSpan);

  // Preset rail
  const rail = document.createElement("div");
  rail.className = "preset-rail";
  const presetButtons: HTMLButtonElement[] = [];
  for (const preset of PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = preset.name;
    btn.dataset.preset = preset.name;
    btn.addEventListener("click", () => applyPreset(preset));
    rail.appendChild(btn);
    presetButtons.push(btn);
  }

  // FOV row
  const fovRow = document.createElement("div");
  fovRow.className = "fov-row";
  const fovLabel = document.createElement("span");
  fovLabel.className = "fov-label";
  fovLabel.textContent = "FOV";
  const fovSlider = document.createElement("input");
  fovSlider.type = "range";
  fovSlider.min = "30";
  fovSlider.max = "90";
  fovSlider.step = "1";
  fovSlider.value = String(Math.round(camera.fov));
  fovSlider.className = "fov-slider";
  fovSlider.setAttribute("aria-label", "Field of view");
  const fovReadout = document.createElement("input");
  fovReadout.type = "number";
  fovReadout.min = "30";
  fovReadout.max = "90";
  fovReadout.step = "1";
  fovReadout.value = String(Math.round(camera.fov));
  fovReadout.className = "fov-readout";
  fovReadout.setAttribute("aria-label", "Field of view value");
  fovRow.append(fovLabel, fovSlider, fovReadout);

  const setFov = (n: number) => {
    const clamped = Math.max(30, Math.min(90, n));
    camera.fov = clamped;
    camera.updateProjectionMatrix();
    fovSlider.value = String(clamped);
    fovReadout.value = String(clamped);
    suffixSpan.textContent = `${activePresetName ? activePresetName.toLowerCase() : "custom"} · ${clamped}°`;
  };
  fovSlider.addEventListener("input", () => setFov(parseFloat(fovSlider.value)));
  fovReadout.addEventListener("change", () =>
    setFov(parseFloat(fovReadout.value)),
  );

  // Position readout: 3 axis-colored monospace chips.
  const coords = document.createElement("div");
  coords.className = "coord-readout";
  const coordX = makeCoord("X", "x");
  const coordY = makeCoord("Y", "y");
  const coordZ = makeCoord("Z", "z");
  coords.append(coordX.el, coordY.el, coordZ.el);

  // Reset link
  const resetLink = document.createElement("button");
  resetLink.type = "button";
  resetLink.className = "sidebar-link";
  resetLink.textContent = "reset camera";
  resetLink.addEventListener("click", () => applyPreset(PRESETS[2])); // Iso

  section.append(heading, rail, fovRow, coords, resetLink);
  host.appendChild(section);

  let activePresetName: string | null = null;

  // --- Tween + apply logic ---
  function applyPreset(preset: CameraPreset) {
    activePresetName = preset.name;
    for (const btn of presetButtons) {
      btn.classList.toggle("active", btn.dataset.preset === preset.name);
    }
    suffixSpan.textContent = `${preset.name.toLowerCase()} · ${Math.round(preset.fov)}°`;

    if (reduceMotion.matches) {
      camera.position.copy(preset.position);
      orbit.target.copy(preset.target);
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();
      orbit.update();
      tween = null;
      return;
    }

    tween = {
      startTime: performance.now(),
      duration: TWEEN_MS,
      fromPos: camera.position.clone(),
      toPos: preset.position.clone(),
      fromTarget: orbit.target.clone(),
      toTarget: preset.target.clone(),
      fromFov: camera.fov,
      toFov: preset.fov,
    };
  }

  // User-driven orbit clears the active preset highlight.
  const onOrbitChange = () => {
    if (tween) return; // ignore changes we're causing ourselves
    if (activePresetName !== null) {
      activePresetName = null;
      for (const btn of presetButtons) btn.classList.remove("active");
      suffixSpan.textContent = `custom · ${Math.round(camera.fov)}°`;
    }
  };
  orbit.addEventListener("change", onOrbitChange);

  // --- Frame update ---
  function update() {
    if (tween) {
      const now = performance.now();
      const t = Math.min(1, (now - tween.startTime) / tween.duration);
      const k = 1 - Math.pow(1 - t, 3); // ease-out cubic
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
      orbit.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      camera.fov = tween.fromFov + (tween.toFov - tween.fromFov) * k;
      camera.updateProjectionMatrix();
      if (t >= 1) tween = null;
      orbit.update();
    }

    // Position readout
    coordX.value.textContent = fmt(camera.position.x);
    coordY.value.textContent = fmt(camera.position.y);
    coordZ.value.textContent = fmt(camera.position.z);

    // Keep FOV inputs in sync without firing input events
    if (document.activeElement !== fovSlider) {
      fovSlider.value = String(Math.round(camera.fov));
    }
    if (document.activeElement !== fovReadout) {
      fovReadout.value = String(Math.round(camera.fov));
    }
  }

  return {
    el: section,
    update,
    detach() {
      orbit.removeEventListener("change", onOrbitChange);
      section.remove();
    },
  };
}

function fmt(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(2)}`;
}

function makeCoord(label: string, axis: "x" | "y" | "z") {
  const el = document.createElement("span");
  el.className = `coord coord--${axis}`;
  const lbl = document.createElement("span");
  lbl.className = "coord-label";
  lbl.textContent = label;
  const value = document.createElement("span");
  value.className = "coord-value";
  value.textContent = "+0.00";
  el.append(lbl, value);
  return { el, value };
}
