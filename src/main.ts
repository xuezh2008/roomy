import "./styles/theme.css";
import * as THREE from "three";

import { cssColor } from "./lifecycle/cssVar";
import { attachResize } from "./lifecycle/resize";
import { attachContextLoss } from "./lifecycle/contextLoss";
import { attachVisibility } from "./lifecycle/visibility";
import { attachMobileMode } from "./ui/mobile";
import { buildScene } from "./scene";

// Phase 2 wiring: scene + room shell + lights with shadows live in scene.ts.
// main.ts owns renderer, camera, the placeholder cube, lifecycle, and RAF.

const app = document.getElementById("app");
if (!app) throw new Error("#app element missing from index.html");

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene (room shell + lights) ---
const { scene } = buildScene();

// --- Camera (iso-ish framing) ---
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(4, 3, 5);
camera.lookAt(0, 0.5, 0);

// --- Placeholder cube (Phase 3 replaces with user-added objects) ---
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({
    color: cssColor("--swatch-1"),
    roughness: 0.85,
    metalness: 0,
  }),
);
cube.position.set(0, 0.5, 0); // sit on floor (y = h/2)
cube.castShadow = true;
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
