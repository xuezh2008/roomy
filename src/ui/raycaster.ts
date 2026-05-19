import * as THREE from "three";
import type { Store } from "../state/store";
import type { RoomyState } from "../objects/catalog";

// Click-to-select on the canvas. Distinguishes click from drag by tracking
// pointer down/up distance + time (camera orbits don't count as clicks).
// Ignores clicks that immediately follow a gizmo drag via isGizmoRecentlyDragged.

const CLICK_DIST_PX = 5;
const CLICK_TIME_MS = 400;

export function attachRaycaster({
  canvas,
  camera,
  objectsGroup,
  store,
  isGizmoRecentlyDragged,
}: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  objectsGroup: THREE.Group;
  store: Store<RoomyState>;
  isGizmoRecentlyDragged?: () => boolean;
}): () => void {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let downOnCanvas = false;

  const onPointerDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
    downTime = Date.now();
    downOnCanvas = e.target === canvas;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!downOnCanvas) return;
    if (isGizmoRecentlyDragged?.()) return;

    const dx = Math.abs(e.clientX - downX);
    const dy = Math.abs(e.clientY - downY);
    const dt = Date.now() - downTime;
    if (dx >= CLICK_DIST_PX || dy >= CLICK_DIST_PX) return; // drag, not click
    if (dt >= CLICK_TIME_MS) return; // long-press, not click (Phase 3b mobile reserves long-press)

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(objectsGroup.children, false);

    if (hits.length > 0) {
      const mesh = hits[0].object;
      const id = mesh.userData.objectId as string | undefined;
      if (id) {
        store.set((s) => (s.selectedId === id ? s : { ...s, selectedId: id }));
        return;
      }
    }
    // Clicked empty floor / outside any object → deselect.
    store.set((s) => (s.selectedId === null ? s : { ...s, selectedId: null }));
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
  };
}
