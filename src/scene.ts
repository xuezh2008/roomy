import * as THREE from "three";
import { cssColor } from "./lifecycle/cssVar";

// Scene/lights/room construction.
// Reads palette + scene defaults from theme.css via cssVar helpers so the
// design system stays the single source of truth for color.
//
// SceneState exposes `rebuildRoom(newRoom)` so the room can change at runtime
// when the user edits W/D/H in the sidebar. The closure captures the current
// roomGroup so each rebuild disposes the prior geometry cleanly.

export interface RoomDimensions {
  width: number; // X axis, meters
  depth: number; // Z axis, meters
  height: number; // Y axis, meters
}

export interface SceneState {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  /** Replace the room geometry + re-tune the sun shadow frustum. */
  rebuildRoom: (room: RoomDimensions) => void;
  /** Current room group (the last one rebuilt). */
  getRoomGroup: () => THREE.Group;
}

export const DEFAULT_ROOM: RoomDimensions = {
  width: 5,
  depth: 4,
  height: 2.6,
};

const WALL_THICKNESS = 0.05; // 5 cm
const SHADOW_MARGIN = 2; // meters added to room footprint for the sun's ortho frustum

export function buildScene(initialRoom: RoomDimensions = DEFAULT_ROOM): SceneState {
  const scene = new THREE.Scene();
  scene.background = cssColor("--scene-bg");

  // --- Lights (built once; frustum tunes per room) ---
  const ambient = new THREE.HemisphereLight(0xf3e8d2, 0x9e8a68, 1.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4dd, 3.14);
  sun.position.set(4, 6, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // --- Room (rebuilt on dim change) ---
  let currentRoomGroup = createRoomGroup(initialRoom);
  scene.add(currentRoomGroup);
  applySunFrustum(sun, initialRoom);

  return {
    scene,
    sun,
    ambient,
    getRoomGroup: () => currentRoomGroup,
    rebuildRoom(newRoom) {
      scene.remove(currentRoomGroup);
      disposeRoomGroup(currentRoomGroup);
      currentRoomGroup = createRoomGroup(newRoom);
      scene.add(currentRoomGroup);
      applySunFrustum(sun, newRoom);
    },
  };
}

function applySunFrustum(sun: THREE.DirectionalLight, room: RoomDimensions): void {
  sun.shadow.camera.left = -room.width / 2 - SHADOW_MARGIN;
  sun.shadow.camera.right = room.width / 2 + SHADOW_MARGIN;
  sun.shadow.camera.top = room.depth / 2 + SHADOW_MARGIN;
  sun.shadow.camera.bottom = -room.depth / 2 - SHADOW_MARGIN;
  sun.shadow.camera.updateProjectionMatrix();
}

function createRoomGroup(room: RoomDimensions): THREE.Group {
  const inkColor = cssColor("--ink");
  const floorColor = cssColor("--scene-floor");

  const roomGroup = new THREE.Group();
  roomGroup.name = "room";

  // Floor: cream-tan plane just below the grid (which lives at y=0).
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({
      color: floorColor,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  // Floor perimeter outline (ink stroke) — defines the room footprint clearly.
  const floorBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(room.width, room.depth)),
    new THREE.LineBasicMaterial({
      color: inkColor,
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
    }),
  );
  floorBorder.rotation.x = -Math.PI / 2;
  floorBorder.position.y = 0.001;
  roomGroup.add(floorBorder);

  // Drafting-paper grid: 10 cm minor + 1 m major. Grid size matches room
  // footprint (square — picks the larger axis so it always covers the floor).
  const gridSize = Math.max(room.width, room.depth);
  const majorDivisions = Math.max(1, Math.round(gridSize)); // 1 m squares
  const majorGrid = new THREE.GridHelper(
    gridSize,
    majorDivisions,
    inkColor,
    inkColor,
  );
  const majorMat = majorGrid.material as THREE.LineBasicMaterial;
  majorMat.opacity = 0.35;
  majorMat.transparent = true;
  majorMat.toneMapped = false;
  roomGroup.add(majorGrid);

  const minorDivisions = majorDivisions * 10; // 10 cm squares
  const minorGrid = new THREE.GridHelper(
    gridSize,
    minorDivisions,
    inkColor,
    inkColor,
  );
  const minorMat = minorGrid.material as THREE.LineBasicMaterial;
  minorMat.opacity = 0.12;
  minorMat.transparent = true;
  minorMat.toneMapped = false;
  minorGrid.position.y = -0.001;
  roomGroup.add(minorGrid);

  // Walls: edges-only outline. Each wall is its own LineSegments with its own
  // material so rebuildRoom can dispose them cleanly without touching shared
  // resources elsewhere in the scene.
  const w = room.width;
  const d = room.depth;
  const h = room.height;
  const t = WALL_THICKNESS;

  const wallSpecs: Array<[number, number, number, number, number, number]> = [
    [w, h, t, 0, h / 2, d / 2], // north (+Z)
    [w, h, t, 0, h / 2, -d / 2], // south (-Z)
    [t, h, d, w / 2, h / 2, 0], // east (+X)
    [t, h, d, -w / 2, h / 2, 0], // west (-X)
  ];

  for (const [sx, sy, sz, px, py, pz] of wallSpecs) {
    const wall = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: inkColor,
      opacity: 0.55,
      transparent: true,
      toneMapped: false,
    });
    wall.add(new THREE.LineSegments(edges, edgeMat));
    wall.position.set(px, py, pz);
    roomGroup.add(wall);
    boxGeo.dispose(); // EdgesGeometry already extracted what it needs
  }

  return roomGroup;
}

// Recursively dispose every geometry + material under the room group.
// Handles Mesh, LineSegments, GridHelper, and any other drawable that has
// .geometry + .material properties.
function disposeRoomGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const drawable = obj as unknown as {
      geometry?: { dispose: () => void };
      material?: THREE.Material | THREE.Material[];
    };
    drawable.geometry?.dispose?.();
    const mat = drawable.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m?.dispose?.();
    } else {
      mat?.dispose?.();
    }
  });
}
