import "./styles/theme.css";
import "./styles/sidebar.css";
import * as THREE from "three";

import { attachResize } from "./lifecycle/resize";
import { attachContextLoss } from "./lifecycle/contextLoss";
import { attachVisibility } from "./lifecycle/visibility";
import { attachMobileMode } from "./ui/mobile";
import { attachSidebar } from "./ui/sidebar";
import { attachKeyboard } from "./ui/keyboard";
import { attachOrbit } from "./ui/orbit";
import { attachTransformGizmo } from "./ui/transformGizmo";
import { attachRaycaster } from "./ui/raycaster";
import { buildScene } from "./scene";
import { createStore } from "./state/store";
import { attachObjectsBridge } from "./objects/bridge";
import { attachSelectionVisual } from "./objects/selection";
import { DEFAULT_ROOM, type RoomyState } from "./objects/catalog";
import { loadState, saveState } from "./persistence/localStore";

// Phase 3b wiring: OrbitControls + TransformControls (XZ translate) +
// click-to-select raycaster + selection visuals + delete/rotate/Esc keys.

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

// --- Camera (iso-ish framing; OrbitControls owns it from here) ---
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(4, 3, 5);
camera.lookAt(0, 0.5, 0);

// --- Store (hydrated from localStorage if present) ---
const persisted = loadState();
const store = createStore<RoomyState>({
  room: persisted?.room ?? DEFAULT_ROOM,
  objects: persisted?.objects ?? [],
  selectedId: null, // selection is transient UI state, never persisted
});
// Auto-save on every state change (debounced 250 ms inside saveState).
const unsubscribePersist = store.subscribe((state) =>
  saveState({ room: state.room, objects: state.objects }),
);

// --- Camera controls ---
const orbit = attachOrbit(camera, renderer.domElement);

// --- Object pipeline (store → meshes) ---
const objectsBridge = attachObjectsBridge(scene, store);

// --- Transform gizmo (commits position back to store) ---
const gizmo = attachTransformGizmo({
  camera,
  canvas: renderer.domElement,
  scene,
  orbit: orbit.controls,
  store,
});

// --- Selection visual; tells the gizmo which mesh is its target ---
const selectionVisual = attachSelectionVisual({
  scene,
  store,
  bridge: objectsBridge,
  onSelectionChange: (mesh) => gizmo.setTarget(mesh),
});

// --- Click-to-select on the canvas ---
const detachRaycaster = attachRaycaster({
  canvas: renderer.domElement,
  camera,
  objectsGroup: objectsBridge.group,
  store,
  isGizmoRecentlyDragged: () => gizmo.isRecentlyDragged() || gizmo.isDragging(),
});

// --- Sidebar + keyboard ---
const sidebar = attachSidebar(app, store);
const detachKeyboard = attachKeyboard({
  onAddObject: () => sidebar.focusNameInput(),
  onRotate: () => {
    const id = store.get().selectedId;
    if (!id) return;
    store.set((s) => ({
      ...s,
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, rotationY: o.rotationY + Math.PI / 2 } : o,
      ),
    }));
  },
  onDelete: () => {
    const id = store.get().selectedId;
    if (!id) return;
    store.set((s) => ({
      ...s,
      selectedId: null,
      objects: s.objects.filter((o) => o.id !== id),
    }));
  },
  onDeselect: () => {
    if (store.get().selectedId !== null) {
      store.set((s) => ({ ...s, selectedId: null }));
    }
  },
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

// --- RAF loop ---
let rafHandle = 0;

function frame() {
  rafHandle = 0;
  if (!visibility.isVisible()) return;
  orbit.update(); // required for damping
  selectionVisual.update(); // keep BoxHelper tracking selected mesh transforms
  renderer.render(scene, camera);
  schedule();
}

function schedule() {
  if (rafHandle) return;
  rafHandle = requestAnimationFrame(frame);
}

schedule();

// --- HMR teardown (reverse attach order) ---
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    detachResize();
    detachContextLoss();
    visibility.detach();
    mobile.detach();
    detachKeyboard();
    sidebar.detach();
    detachRaycaster();
    selectionVisual.detach();
    gizmo.detach();
    objectsBridge.detach();
    orbit.detach();
    unsubscribePersist();
    renderer.domElement.remove();
    renderer.dispose();
  });
}

if (import.meta.env.DEV) {
  (window as unknown as { __roomy: unknown }).__roomy = {
    scene,
    camera,
    renderer,
    store,
    sidebar,
    objectsBridge,
    orbit,
    gizmo,
    selectionVisual,
  };
}
