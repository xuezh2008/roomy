import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Store } from "../state/store";
import type { RoomyState } from "../objects/catalog";

// TransformControls (XZ translate only) + OrbitControls conflict resolver.
// dragging-changed event disables orbit during gizmo drag so the camera
// doesn't run away while the user is positioning an object.

export interface TransformGizmoHandle {
  setTarget: (mesh: THREE.Object3D | null) => void;
  isDragging: () => boolean;
  isRecentlyDragged: () => boolean;
  detach: () => void;
}

export function attachTransformGizmo({
  camera,
  canvas,
  scene,
  orbit,
  store,
}: {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  orbit: OrbitControls;
  store: Store<RoomyState>;
}): TransformGizmoHandle {
  const controls = new TransformControls(camera, canvas);
  controls.setMode("translate");
  controls.setSpace("world");
  controls.showY = false; // lock vertical translation; XZ only on floor plane

  const helper = controls.getHelper();
  scene.add(helper);

  let dragging = false;
  let recentlyDragged = false;
  let resetRecentTimer: ReturnType<typeof setTimeout> | undefined;

  controls.addEventListener("dragging-changed", (event) => {
    const value = (event as unknown as { value: boolean }).value;
    dragging = value;
    orbit.enabled = !value;
    if (!value) {
      // Hold the recently-dragged flag for a beat so the raycaster's
      // pointerup handler doesn't deselect right after a drag.
      recentlyDragged = true;
      if (resetRecentTimer) clearTimeout(resetRecentTimer);
      resetRecentTimer = setTimeout(() => {
        recentlyDragged = false;
      }, 100);
    }
  });

  controls.addEventListener("objectChange", () => {
    const target = controls.object;
    if (!target) return;
    const objId = target.userData.objectId as string | undefined;
    if (!objId) return;
    // Commit the new world-position back to the store. Store is authoritative;
    // the mesh's transform will be overwritten on next sync iteration.
    const next: [number, number, number] = [
      target.position.x,
      target.position.y,
      target.position.z,
    ];
    store.set((s) => ({
      ...s,
      objects: s.objects.map((o) =>
        o.id === objId ? { ...o, position: next } : o,
      ),
    }));
  });

  return {
    setTarget(mesh) {
      if (mesh) {
        controls.attach(mesh);
      } else {
        controls.detach();
      }
    },
    isDragging: () => dragging,
    isRecentlyDragged: () => recentlyDragged,
    detach() {
      if (resetRecentTimer) clearTimeout(resetRecentTimer);
      controls.detach();
      scene.remove(helper);
      controls.dispose();
    },
  };
}
