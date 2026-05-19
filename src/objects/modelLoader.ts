import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

// glTF loader with per-URL caching and bounding-box normalization.
// Models get scaled uniformly to fit the catalog dims (largest axis fills;
// smaller axes have gaps). sRGB color space is applied to color maps so
// textures don't render washed out under the linear workflow.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

interface ObjectDims {
  w: number;
  h: number;
  d: number;
}

async function loadGltf(url: string): Promise<GLTF> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url);
    cache.set(url, pending);
    // If load fails, drop the cache entry so a retry can happen.
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

// Returns an independent THREE.Group (cloned scene). Subsequent calls for
// the same URL share geometry/material data but get fresh transforms.
export async function loadModel(url: string): Promise<THREE.Group> {
  const gltf = await loadGltf(url);
  return gltf.scene.clone(true) as THREE.Group;
}

// Center the model on its bbox center and uniform-scale to fit dims.
// Caller is responsible for setting the final world position + rotation.
export function normalizeToBounds(group: THREE.Group, dims: ObjectDims): void {
  const bbox = new THREE.Box3().setFromObject(group);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  // Re-center children so the group's origin is the model's bbox center.
  for (const child of group.children) {
    child.position.sub(center);
  }

  // Pick the largest scale ratio so the model fits inside the dims; smaller
  // axes have gaps. Anisotropic scale distorts; we accept gaps instead.
  if (size.x > 0 && size.y > 0 && size.z > 0) {
    const scale = Math.min(
      dims.w / size.x,
      dims.h / size.y,
      dims.d / size.z,
    );
    group.scale.setScalar(scale);
  }
}

// Tag color textures as sRGB (per glTF spec / DESIGN.md §11 Phase 6 alignment
// note). normal/roughness/metalness maps stay linear. Also clone materials per
// instance so per-object state (selection emissive, etc.) doesn't leak to
// other instances of the same model.
export function applyMaterialFixes(group: THREE.Group): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    // Per-instance materials. clone() shallow-copies textures (refs shared,
    // good — textures are read-only resources). State props (emissive,
    // opacity) become independent.
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone());
    } else if (obj.material) {
      obj.material = obj.material.clone();
    }

    const mat = obj.material;
    if (!mat || Array.isArray(mat)) return;
    if ("map" in mat && (mat as THREE.MeshStandardMaterial).map) {
      (mat as THREE.MeshStandardMaterial).map!.colorSpace =
        THREE.SRGBColorSpace;
    }
    if (
      "emissiveMap" in mat &&
      (mat as THREE.MeshStandardMaterial).emissiveMap
    ) {
      (mat as THREE.MeshStandardMaterial).emissiveMap!.colorSpace =
        THREE.SRGBColorSpace;
    }
  });
}

// Recursive dispose for loaded model hierarchies. Safe to call on any
// Object3D; only meshes contribute geometry/material to free.
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    const mat = obj.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else {
      mat.dispose();
    }
  });
}
