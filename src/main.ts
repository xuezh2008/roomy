import "./styles/theme.css";
import * as THREE from "three";

import { cssColor } from "./lifecycle/cssVar";
import { attachResize } from "./lifecycle/resize";
import { attachContextLoss } from "./lifecycle/contextLoss";
import { attachVisibility } from "./lifecycle/visibility";
import { attachMobileMode } from "./ui/mobile";

// Phase 1 wiring: empty scene + drafting-paper grid + placeholder cube.
// Phase 2 will add the room shell, sun (DirectionalLight), shadows, and fog.

const app = document.getElementById("app");
if (!app) throw new Error("#app element missing from index.html");

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// --- Scene ---
const scene = new THREE.Scene();
scene.background = cssColor("--scene-bg");

// --- Camera (iso-ish framing for an empty scene) ---
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(4, 3, 5);
camera.lookAt(0, 0.5, 0);

// --- Lights (Phase 1 minimum: HemisphereLight only)
// Phase 2 adds DirectionalLight with shadows.
const hemi = new THREE.HemisphereLight(0xf3e8d2, 0x9e8a68, 0.85);
scene.add(hemi);

// --- Grid floor (drafting paper: 10cm minor, 1m major) ---
// 10x10m extent; same extent on both grids, different division density.
const inkColor = cssColor("--ink");

const majorGrid = new THREE.GridHelper(10, 10, inkColor, inkColor);
const majorMat = majorGrid.material as THREE.LineBasicMaterial;
majorMat.opacity = 0.35;
majorMat.transparent = true;
scene.add(majorGrid);

const minorGrid = new THREE.GridHelper(10, 100, inkColor, inkColor);
const minorMat = minorGrid.material as THREE.LineBasicMaterial;
minorMat.opacity = 0.12;
minorMat.transparent = true;
minorGrid.position.y = -0.001; // avoid z-fighting with the major grid
scene.add(minorGrid);

// --- Placeholder cube (1m cube on the floor, first swatch) ---
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({
    color: cssColor("--swatch-1"),
    roughness: 0.85,
    metalness: 0,
  }),
);
cube.position.set(0, 0.5, 0); // sit on floor (y = h/2)
scene.add(cube);

// --- Lifecycle attachments ---
const detachResize = attachResize(renderer.domElement, renderer, camera);
const detachContextLoss = attachContextLoss(renderer.domElement);
const visibility = attachVisibility((visible) => {
  if (visible) schedule();
});
const mobile = attachMobileMode((mode) => {
  console.info("[roomy] viewport mode:", mode);
});
console.info("[roomy] boot — viewport mode:", mobile.mode());

// --- RAF loop, gated by visibility ---
let rafHandle = 0;

function frame() {
  rafHandle = 0;
  if (!visibility.isVisible()) return;
  renderer.render(scene, camera);
  schedule();
}

function schedule() {
  if (rafHandle) return;
  rafHandle = requestAnimationFrame(frame);
}

schedule();

// --- HMR teardown ---
// Vite reloads the whole module on edit; without dispose we'd leak canvases,
// double-attached observers, and stranded RAF handles each save.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    detachResize();
    detachContextLoss();
    visibility.detach();
    mobile.detach();
    renderer.domElement.remove();
    renderer.dispose();
  });
}

// Expose for console debugging in dev (no harm in prod — tree-shaken if unused).
if (import.meta.env.DEV) {
  (window as unknown as { __roomy: unknown }).__roomy = {
    scene,
    camera,
    renderer,
    cube,
  };
}
