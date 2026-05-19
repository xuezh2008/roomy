import * as THREE from "three";
import type { Store } from "../state/store";
import type { RoomObject, RoomyState } from "./catalog";
import { createBoxMesh, updateBoxMesh, disposeBoxMesh } from "./boxMesh";

// Reactive bridge: store.objects[] -> three.js Group of meshes.
// Diffs on every store change; only adds new, removes deleted, updates
// changed. Keeps the scene graph derived from the store at all times.

export interface ObjectsBridge {
  group: THREE.Group;
  meshById: ReadonlyMap<string, THREE.Mesh>;
  detach: () => void;
}

export function attachObjectsBridge(
  scene: THREE.Scene,
  store: Store<RoomyState>,
): ObjectsBridge {
  const group = new THREE.Group();
  group.name = "objects";
  scene.add(group);

  const meshById = new Map<string, THREE.Mesh>();

  const sync = (state: RoomyState) => {
    const byId = new Map<string, RoomObject>();
    for (const obj of state.objects) byId.set(obj.id, obj);

    // Remove meshes whose object disappeared.
    for (const [id, mesh] of meshById) {
      if (!byId.has(id)) {
        group.remove(mesh);
        disposeBoxMesh(mesh);
        meshById.delete(id);
      }
    }

    // Add new + update existing. Iterate in object order so insertion order
    // matches store order (useful for stable sort later).
    for (const obj of state.objects) {
      const existing = meshById.get(obj.id);
      if (existing) {
        updateBoxMesh(existing, obj);
      } else {
        const mesh = createBoxMesh(obj);
        group.add(mesh);
        meshById.set(obj.id, mesh);
      }
    }
  };

  // Initial sync against current state.
  sync(store.get());
  // Then subscribe to future changes.
  const unsubscribe = store.subscribe((state) => sync(state));

  return {
    group,
    meshById,
    detach() {
      unsubscribe();
      for (const mesh of meshById.values()) {
        group.remove(mesh);
        disposeBoxMesh(mesh);
      }
      meshById.clear();
      scene.remove(group);
    },
  };
}
