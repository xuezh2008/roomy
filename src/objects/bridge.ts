import * as THREE from "three";
import type { Store } from "../state/store";
import type { RoomObject, RoomyState } from "./catalog";
import { createBoxMesh, updateBoxMesh, disposeBoxMesh } from "./boxMesh";
import {
  applyMaterialFixes,
  disposeObject3D,
  loadModel,
  normalizeToBounds,
} from "./modelLoader";

// Reactive bridge: store.objects[] -> three.js Group of meshes (or loaded
// glTF groups). Diffs on every store change; adds new, removes deleted,
// updates changed. For objects with modelUrl, starts an async load and
// swaps the placeholder box for the loaded model on completion.

export interface ObjectsBridge {
  group: THREE.Group;
  meshById: ReadonlyMap<string, THREE.Object3D>;
  detach: () => void;
}

interface NodeEntry {
  node: THREE.Object3D; // either a Mesh (placeholder/box) or Group (loaded model)
  isModel: boolean;
  loadedFor?: string; // the modelUrl this node was loaded for, if any
}

export function attachObjectsBridge(
  scene: THREE.Scene,
  store: Store<RoomyState>,
): ObjectsBridge {
  const group = new THREE.Group();
  group.name = "objects";
  scene.add(group);

  const entries = new Map<string, NodeEntry>();
  const meshById = new Map<string, THREE.Object3D>();
  const pendingLoads = new Set<string>(); // object IDs currently loading

  const removeEntry = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    group.remove(entry.node);
    if (entry.isModel) {
      disposeObject3D(entry.node);
    } else {
      disposeBoxMesh(entry.node as THREE.Mesh);
    }
    entries.delete(id);
    meshById.delete(id);
  };

  const replaceWithModel = (id: string, modelUrl: string, obj: RoomObject) => {
    if (pendingLoads.has(id)) return;
    pendingLoads.add(id);

    loadModel(modelUrl)
      .then((modelGroup) => {
        pendingLoads.delete(id);

        // Make sure the object still exists with the same modelUrl. If it
        // changed (delete / model swap), discard this loaded copy.
        const current = store
          .get()
          .objects.find((o) => o.id === id);
        if (!current || current.modelUrl !== modelUrl) {
          disposeObject3D(modelGroup);
          return;
        }

        normalizeToBounds(modelGroup, current.dims);
        applyMaterialFixes(modelGroup);
        modelGroup.position.set(
          current.position[0],
          current.position[1],
          current.position[2],
        );
        modelGroup.rotation.y = current.rotationY;
        modelGroup.userData.objectId = current.id;
        modelGroup.userData.objectName = current.name;

        // Swap in: remove the old node (placeholder box), add the model.
        const old = entries.get(id);
        if (old) {
          group.remove(old.node);
          if (old.isModel) disposeObject3D(old.node);
          else disposeBoxMesh(old.node as THREE.Mesh);
        }
        group.add(modelGroup);
        entries.set(id, {
          node: modelGroup,
          isModel: true,
          loadedFor: modelUrl,
        });
        meshById.set(id, modelGroup);
      })
      .catch((err) => {
        pendingLoads.delete(id);
        console.warn(`[roomy] failed to load model ${modelUrl}:`, err);
        // Keep placeholder box; user can retry with a different file.
      });
    // (obj is unused here but accepted so callers signal intent.)
    void obj;
  };

  const sync = (state: RoomyState) => {
    const byId = new Map<string, RoomObject>();
    for (const obj of state.objects) byId.set(obj.id, obj);

    // Remove deleted
    for (const id of [...entries.keys()]) {
      if (!byId.has(id)) removeEntry(id);
    }

    // Add new / update existing
    for (const obj of state.objects) {
      const existing = entries.get(obj.id);

      if (!existing) {
        // New object: create placeholder box, optionally start async model load.
        const mesh = createBoxMesh(obj);
        group.add(mesh);
        entries.set(obj.id, { node: mesh, isModel: false });
        meshById.set(obj.id, mesh);
        if (obj.modelUrl) replaceWithModel(obj.id, obj.modelUrl, obj);
        continue;
      }

      // Model URL changed since last sync? Could mean:
      //  - Newly assigned modelUrl on a previously-box object → load it
      //  - Different model URL → reload
      //  - modelUrl removed → swap back to placeholder box
      if (existing.isModel && obj.modelUrl !== existing.loadedFor) {
        // Different model or unset: tear down the loaded one, drop a box back
        group.remove(existing.node);
        disposeObject3D(existing.node);
        const mesh = createBoxMesh(obj);
        group.add(mesh);
        entries.set(obj.id, { node: mesh, isModel: false });
        meshById.set(obj.id, mesh);
        if (obj.modelUrl) replaceWithModel(obj.id, obj.modelUrl, obj);
        continue;
      }
      if (!existing.isModel && obj.modelUrl) {
        // Box currently, but object now has a modelUrl → kick off load.
        updateBoxMesh(existing.node as THREE.Mesh, obj);
        replaceWithModel(obj.id, obj.modelUrl, obj);
        continue;
      }

      // Same kind of node, just update transform / color.
      if (!existing.isModel) {
        updateBoxMesh(existing.node as THREE.Mesh, obj);
      } else {
        // Loaded model: update transform only (dims would require re-normalize;
        // skip for v1 — users can delete + re-add if they want to resize a
        // loaded model)
        existing.node.position.set(
          obj.position[0],
          obj.position[1],
          obj.position[2],
        );
        existing.node.rotation.y = obj.rotationY;
        existing.node.visible = obj.visible !== false;
      }
    }
  };

  sync(store.get());
  const unsubscribe = store.subscribe(sync);

  return {
    group,
    meshById,
    detach() {
      unsubscribe();
      for (const id of [...entries.keys()]) removeEntry(id);
      scene.remove(group);
    },
  };
}
