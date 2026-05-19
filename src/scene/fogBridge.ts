import * as THREE from "three";
import type { Store } from "../state/store";
import type { RoomyState } from "../objects/catalog";

// Reactive fog. scene.background is synced to fog.color regardless of enabled
// state — DESIGN.md §4 calls for no visible seam between fog and the cleared
// background. Toggling fog on later won't reveal a mismatch.

export function attachFogBridge(
  scene: THREE.Scene,
  store: Store<RoomyState>,
): () => void {
  let fog: THREE.Fog | null = null;

  const sync = (state: RoomyState) => {
    const f = state.fog;
    // Background follows fog color either way (so toggling has no seam)
    if (scene.background instanceof THREE.Color) {
      scene.background.setStyle(f.color);
    } else {
      scene.background = new THREE.Color().setStyle(f.color);
    }

    if (!f.enabled) {
      scene.fog = null;
      fog = null;
      return;
    }
    if (!fog) {
      fog = new THREE.Fog(f.color, f.near, f.far);
      scene.fog = fog;
    } else {
      fog.color.setStyle(f.color);
      fog.near = f.near;
      fog.far = f.far;
    }
  };

  sync(store.get());
  return store.subscribe(sync);
}
