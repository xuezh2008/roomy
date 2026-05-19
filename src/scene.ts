import * as THREE from "three";
import { cssColor } from "./lifecycle/cssVar";

// Scene/lights/room construction. Pure setup, no state.
// Reads palette + scene defaults from theme.css via cssVar helpers so the
// design system stays the single source of truth for color.

export interface RoomDimensions {
  width: number; // X axis, meters
  depth: number; // Z axis, meters
  height: number; // Y axis, meters
}

export interface SceneState {
  scene: THREE.Scene;
  roomGroup: THREE.Group;
  floor: THREE.Mesh;
  walls: THREE.Group[];
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
}

export const DEFAULT_ROOM: RoomDimensions = {
  width: 5,
  depth: 4,
  height: 2.6,
};

const WALL_THICKNESS = 0.05; // 5 cm

export function buildScene(room: RoomDimensions = DEFAULT_ROOM): SceneState {
  const scene = new THREE.Scene();
  scene.background = cssColor("--scene-bg");

  // Cache colors once; re-reading getComputedStyle per material is wasteful.
  const inkColor = cssColor("--ink");
  const floorColor = cssColor("--scene-floor");
  const wallColor = cssColor("--scene-wall");

  // --- Lights ---
  // DESIGN.md §4 calls for hemi intensity 0.55 + sun intensity 1.0 in
  // pre-r155 legacy units. Physical units multiply old values by ~PI.
  const ambient = new THREE.HemisphereLight(0xf3e8d2, 0x9e8a68, 1.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4dd, 3.14);
  sun.position.set(4, 6, 3); // front-upper-right; matches iso preset
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Shadow camera (orthographic) frustum: room footprint + 2 m margin so
  // shadows of objects near walls don't clip. Defaults (±5) blow out + alias.
  const margin = 2;
  sun.shadow.camera.left = -room.width / 2 - margin;
  sun.shadow.camera.right = room.width / 2 + margin;
  sun.shadow.camera.top = room.depth / 2 + margin;
  sun.shadow.camera.bottom = -room.depth / 2 - margin;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0005; // counters self-shadow acne on co-planar surfaces
  scene.add(sun);
  scene.add(sun.target); // light tracks target; both must be in scene

  // --- Room geometry ---
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
  floor.rotation.x = -Math.PI / 2; // PlaneGeometry is XY; rotate to lie flat
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  // Floor perimeter outline (ink stroke) — defines the room footprint
  // clearly, like a drafting border. Floats just above the floor mesh so
  // it survives shadow rendering without z-fighting.
  const floorBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.PlaneGeometry(room.width, room.depth),
    ),
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

  // Drafting-paper grid: 10 cm minor + 1 m major. Lives on top of the floor.
  // toneMapped: false because the unlit linework would otherwise crush to
  // black under ACES Filmic.
  const majorGrid = new THREE.GridHelper(10, 10, inkColor, inkColor);
  const majorMat = majorGrid.material as THREE.LineBasicMaterial;
  majorMat.opacity = 0.35;
  majorMat.transparent = true;
  majorMat.toneMapped = false;
  roomGroup.add(majorGrid);

  const minorGrid = new THREE.GridHelper(10, 100, inkColor, inkColor);
  const minorMat = minorGrid.material as THREE.LineBasicMaterial;
  minorMat.opacity = 0.12;
  minorMat.transparent = true;
  minorMat.toneMapped = false;
  minorGrid.position.y = -0.001;
  roomGroup.add(minorGrid);

  // Walls: edges-only. DESIGN.md §4 calls for walls that "vanish except for
  // their edges" — a true drafting-paper read. Solid wall fills (even in cream)
  // occlude the room interior from any outside camera angle. The line outlines
  // alone define the room boundary; the camera sees straight through to the
  // floor + objects.
  // Reference: `wallColor` is unused here but kept in DESIGN.md for v2's
  // "inside-the-room" camera mode (when we'll want solid walls again).
  void wallColor;
  const edgeMat = new THREE.LineBasicMaterial({
    color: inkColor,
    opacity: 0.55,
    transparent: true,
    toneMapped: false,
  });

  const makeWall = (
    sx: number,
    sy: number,
    sz: number,
    px: number,
    py: number,
    pz: number,
  ): THREE.Group => {
    const wall = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    const edges = new THREE.EdgesGeometry(boxGeo);
    wall.add(new THREE.LineSegments(edges, edgeMat));
    wall.position.set(px, py, pz);
    return wall;
  };

  const w = room.width;
  const d = room.depth;
  const h = room.height;
  const t = WALL_THICKNESS;

  const walls: THREE.Group[] = [
    makeWall(w, h, t, 0, h / 2, d / 2), // north (+Z)
    makeWall(w, h, t, 0, h / 2, -d / 2), // south (-Z)
    makeWall(t, h, d, w / 2, h / 2, 0), // east (+X)
    makeWall(t, h, d, -w / 2, h / 2, 0), // west (-X)
  ];
  for (const wall of walls) roomGroup.add(wall);

  scene.add(roomGroup);

  return { scene, roomGroup, floor, walls, sun, ambient };
}
