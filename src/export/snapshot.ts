import * as THREE from "three";
import type { Snapshot } from "../ai/types";
import type { RoomObject, RoomyState } from "../objects/catalog";

// Offscreen 1920x1080 snapshot of the current scene + metadata payload.
// Uses a one-shot WebGLRenderer with preserveDrawingBuffer so we can pull
// the PNG out via toBlob. The temporary renderer is disposed immediately to
// free GPU resources.

const SNAPSHOT_W = 1920;
const SNAPSHOT_H = 1080;

export interface SnapshotArgs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitTarget: THREE.Vector3;
  state: RoomyState;
}

export async function captureSnapshot(args: SnapshotArgs): Promise<Snapshot> {
  const { scene, camera, orbitTarget, state } = args;

  // Snapshot camera mirrors the main camera but at the 1920x1080 aspect.
  const snapCam = camera.clone() as THREE.PerspectiveCamera;
  snapCam.aspect = SNAPSHOT_W / SNAPSHOT_H;
  snapCam.updateProjectionMatrix();

  // Dedicated canvas/renderer for the snapshot. preserveDrawingBuffer lets
  // toBlob read the pixels back after render.
  const canvas = document.createElement("canvas");
  canvas.width = SNAPSHOT_W;
  canvas.height = SNAPSHOT_H;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SNAPSHOT_W, SNAPSHOT_H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  try {
    renderer.render(scene, snapCam);
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
        "image/png",
      );
    });
    return {
      image,
      room: state.room,
      camera: {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [orbitTarget.x, orbitTarget.y, orbitTarget.z],
        fov: camera.fov,
      },
      lighting: {
        sunPosition: [4, 6, 3],
        ambientIntensity: 1.7,
        ...(state.fog.enabled && {
          fogColor: state.fog.color,
          fogNear: state.fog.near,
          fogFar: state.fog.far,
        }),
      },
      objects: state.objects.map(objectToSnapshotBox),
    };
  } finally {
    renderer.dispose();
  }
}

function objectToSnapshotBox(o: RoomObject) {
  const x = o.position[0];
  const y = o.position[1];
  const z = o.position[2];
  const hw = o.dims.w / 2;
  const hh = o.dims.h / 2;
  const hd = o.dims.d / 2;
  return {
    name: o.name,
    box: {
      min: [x - hw, y - hh, z - hd] as [number, number, number],
      max: [x + hw, y + hh, z + hd] as [number, number, number],
    },
    modelName: o.modelUrl
      ? o.modelUrl.startsWith("blob:")
        ? "(user-loaded)"
        : o.modelUrl
      : undefined,
  };
}
