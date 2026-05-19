import * as THREE from "three";
import type { Store } from "../state/store";
import type { RoomyState } from "./catalog";
import type { ObjectsBridge } from "./bridge";
import { cssColor } from "../lifecycle/cssVar";

// Selection visual: BoxHelper outline + emissive boost. Works on both
// placeholder box meshes and loaded glTF groups — traverses Group children
// to apply emissive consistently across multi-mesh models.

const EMISSIVE_INTENSITY = 0.08;
const ZERO = new THREE.Color(0x000000);

export interface SelectionHandle {
  update: () => void;
  detach: () => void;
}

export interface SelectionHooks {
  onSelectionChange?: (object: THREE.Object3D | null) => void;
}

function setEmissive(
  object: THREE.Object3D,
  color: THREE.Color,
  intensity: number,
): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material;
    if (Array.isArray(mat)) {
      for (const m of mat) applyEmissive(m, color, intensity);
    } else {
      applyEmissive(mat, color, intensity);
    }
  });
}

function applyEmissive(
  mat: THREE.Material,
  color: THREE.Color,
  intensity: number,
): void {
  if (!("emissive" in mat) || !("emissiveIntensity" in mat)) return;
  const m = mat as THREE.MeshStandardMaterial;
  m.emissive.copy(color);
  m.emissiveIntensity = intensity;
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
  let attached: THREE.Object3D | null = null;

  const detachFromCurrent = () => {
    if (helper) {
      scene.remove(helper);
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
      helper = null;
    }
    if (attached) {
      setEmissive(attached, ZERO, 0);
      attached = null;
    }
  };

  const sync = (state: RoomyState) => {
    const id = state.selectedId;
    const next = id ? bridge.meshById.get(id) ?? null : null;
    if (next === attached) return;

    detachFromCurrent();

    if (next) {
      setEmissive(next, accent, EMISSIVE_INTENSITY);

      helper = new THREE.BoxHelper(next, accent);
      const lineMat = helper.material as THREE.LineBasicMaterial;
      lineMat.toneMapped = false;
      lineMat.linewidth = 2;
      scene.add(helper);

      attached = next;
    }

    onSelectionChange?.(next);
  };

  sync(store.get());
  const unsub = store.subscribe(sync);

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
