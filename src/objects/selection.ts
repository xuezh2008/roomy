import * as THREE from "three";
import type { Store } from "../state/store";
import type { RoomyState } from "./catalog";
import type { ObjectsBridge } from "./bridge";
import { cssColor } from "../lifecycle/cssVar";

// Selection visual: BoxHelper outline + emissive boost on the selected mesh.
// Listens to store.selectedId. Drafting red on cream reads as "pencil here".

const EMISSIVE_INTENSITY = 0.08;

export interface SelectionHandle {
  update: () => void; // call from RAF so BoxHelper tracks transform changes
  detach: () => void;
}

export interface SelectionHooks {
  onSelectionChange?: (mesh: THREE.Mesh | null) => void;
}

export function attachSelectionVisual({
  scene,
  store,
  bridge,
  onSelectionChange,
}: {
  scene: THREE.Scene;
  store: Store<RoomyState>;
  bridge: ObjectsBridge;
} & SelectionHooks): SelectionHandle {
  const accent = cssColor("--accent");
  let helper: THREE.BoxHelper | null = null;
  let attachedMesh: THREE.Mesh | null = null;

  const detachFromCurrent = () => {
    if (helper) {
      scene.remove(helper);
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
      helper = null;
    }
    if (attachedMesh) {
      const mat = attachedMesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0;
      attachedMesh = null;
    }
  };

  const sync = (state: RoomyState) => {
    const id = state.selectedId;
    const nextMesh = id ? bridge.meshById.get(id) ?? null : null;
    if (nextMesh === attachedMesh) return; // no change

    detachFromCurrent();

    if (nextMesh) {
      const mat = nextMesh.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(accent);
      mat.emissiveIntensity = EMISSIVE_INTENSITY;

      helper = new THREE.BoxHelper(nextMesh, accent);
      const lineMat = helper.material as THREE.LineBasicMaterial;
      lineMat.toneMapped = false; // unlit indicator
      lineMat.linewidth = 2; // honored only on platforms that support it; cheap to set
      scene.add(helper);

      attachedMesh = nextMesh;
    }

    onSelectionChange?.(nextMesh);
  };

  // Initial paint + subscribe.
  sync(store.get());
  const unsub = store.subscribe(sync);

  // Also re-sync when bridge meshes change (e.g., delete reorders meshById).
  // We accomplish this by re-running sync inside the store subscriber, which
  // already fires whenever store changes. The bridge updates BEFORE selection
  // visual because both subscribe to the same store and listeners are called
  // in insertion order — bridge first (attached earlier in main.ts).

  return {
    update() {
      helper?.update();
    },
    detach() {
      unsub();
      detachFromCurrent();
    },
  };
}
