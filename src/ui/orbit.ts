import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// OrbitControls wrapper with damping + floor-clip. Defaults match
// DESIGN.md §8 (damping factor 0.05, maxPolarAngle just under PI/2 so
// the camera can't sneak below the floor).

export interface OrbitHandle {
  controls: OrbitControls;
  update: () => void;
  detach: () => void;
}

export function attachOrbit(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): OrbitHandle {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 1.5;
  controls.maxDistance = 25;
  controls.target.set(0, 0.5, 0);
  controls.update();

  return {
    controls,
    update: () => controls.update(),
    detach: () => controls.dispose(),
  };
}
