import "./styles/theme.css";
import "./styles/sidebar.css";
import * as THREE from "three";

import { attachResize } from "./lifecycle/resize";
import { attachContextLoss } from "./lifecycle/contextLoss";
import { attachVisibility } from "./lifecycle/visibility";
import { attachMobileMode } from "./ui/mobile";
import { attachSidebar } from "./ui/sidebar";
import { attachKeyboard } from "./ui/keyboard";
import { buildScene } from "./scene";
import { createStore } from "./state/store";
import { attachObjectsBridge } from "./objects/bridge";
import { DEFAULT_ROOM, type RoomyState } from "./objects/catalog";

// Phase 3a wiring: store-driven object catalog, sidebar with form, reactive
// bridge that materializes RoomObject[] into scene meshes.

const app = document.getElementById("app");
if (!app) throw new Error("#app element missing from index.html");
const canvasShell = app.querySelector<HTMLDivElement>(".canvas-shell");
if (!canvasShell) throw new Error(".canvas-shell missing from index.html");

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasShell.appendChild(renderer.domElement);

// --- Scene (room shell + lights) ---
const { scene } = buildScene();

// --- Camera (iso-ish framing) ---
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(4, 3, 5);
camera.lookAt(0, 0.5, 0);

// --- State + UI + reactive scene sync ---
const store = createStore<RoomyState>({
  room: DEFAULT_ROOM,
  objects: [],
  selectedId: null,
});
const sidebar = attachSidebar(app, store);
const objectsBridge = attachObjectsBridge(scene, store);
const detachKeyboard = attachKeyboard({
  onAddObject: () => sidebar.focusNameInput(),
});

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
    detachKeyboard();
    sidebar.detach();
    objectsBridge.detach();
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
    store,
    sidebar,
    objectsBridge,
  };
}
