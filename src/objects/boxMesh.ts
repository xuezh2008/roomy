import * as THREE from "three";
import type { RoomObject } from "./catalog";

// Build / update / dispose THREE.Mesh from a RoomObject.
// Mesh is derived state — the store is authoritative. Never read mesh.position
// to update RoomObject.position; commit through the store and re-render.

export function createBoxMesh(obj: RoomObject): THREE.Mesh {
  const geo = new THREE.BoxGeometry(obj.dims.w, obj.dims.h, obj.dims.d);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setStyle(obj.color),
    roughness: 0.85,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
  mesh.rotation.y = obj.rotationY;
  mesh.castShadow = true;
  mesh.userData.objectId = obj.id;
  mesh.userData.objectName = obj.name; // for hover / debugging
  if (obj.visible === false) mesh.visible = false;
  return mesh;
}

// Update an existing mesh from a possibly-changed RoomObject.
// Geometry is rebuilt only when dimensions change (rare); position/rotation/
// color are cheap property writes.
export function updateBoxMesh(mesh: THREE.Mesh, obj: RoomObject): void {
  const geo = mesh.geometry as THREE.BoxGeometry;
  const p = geo.parameters;
  if (p.width !== obj.dims.w || p.height !== obj.dims.h || p.depth !== obj.dims.d) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(obj.dims.w, obj.dims.h, obj.dims.d);
  }
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.color.setStyle(obj.color);
  mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
  mesh.rotation.y = obj.rotationY;
  mesh.visible = obj.visible !== false;
  mesh.userData.objectName = obj.name;
}

// Free GPU resources held by a mesh. Critical: without this, add/delete
// cycles leak shader programs + buffer memory until tab is reloaded.
export function disposeBoxMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) {
    for (const m of mat) m.dispose();
  } else {
    mat.dispose();
  }
}
