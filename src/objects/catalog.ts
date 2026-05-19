// Domain types + factories for room state.
// Single source of truth: meters in storage, cm at the UI boundary.
// UI components convert via cm/100 on submit, m*100 on display.

import { cssHex } from "../lifecycle/cssVar";

export interface RoomObject {
  id: string;
  name: string;
  dims: { w: number; h: number; d: number }; // meters
  position: [number, number, number]; // meters
  rotationY: number; // radians
  scale?: number; // glTF normalization factor, Phase 6
  modelUrl?: string; // catalog reference, Phase 6
  color: string; // hex string (e.g., '#3d4a6b')
  locked?: boolean;
  visible?: boolean;
  createdAt: number;
}

export interface Room {
  width: number; // meters
  depth: number; // meters
  height: number; // meters
}

export interface RoomyState {
  room: Room;
  objects: RoomObject[];
  selectedId: string | null;
}

export const DEFAULT_ROOM: Room = { width: 5, depth: 4, height: 2.6 };

export const DIM_MIN_CM = 5;
export const DIM_MAX_CM = 2000;
const SWATCH_COUNT = 8;

export interface CreateObjectInput {
  name: string;
  dimsCm: { w: number; h: number; d: number };
  color?: string;
  index: number; // objects.length at creation, for swatch cycle
}

export function createObject(input: CreateObjectInput): RoomObject {
  const w = input.dimsCm.w / 100;
  const h = input.dimsCm.h / 100;
  const d = input.dimsCm.d / 100;
  return {
    id: crypto.randomUUID(),
    name: input.name,
    dims: { w, h, d },
    position: [0, h / 2, 0], // sit on floor (y = h/2)
    rotationY: 0,
    color: input.color ?? defaultSwatch(input.index),
    createdAt: Date.now(),
  };
}

export function defaultSwatch(index: number): string {
  const n = (index % SWATCH_COUNT) + 1;
  return cssHex(`--swatch-${n}`, "#3d4a6b");
}

// Validation: clamp + checks for the form boundary.
// Returns the clamped value plus whether it had to be clamped.
export interface ValidationResult {
  value: number;
  clamped: boolean;
  reason?: string;
}

export function validateDimCm(raw: unknown): ValidationResult {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n)) {
    return { value: DIM_MIN_CM, clamped: true, reason: "Not a number" };
  }
  if (n < DIM_MIN_CM) {
    return {
      value: DIM_MIN_CM,
      clamped: true,
      reason: `Below ${DIM_MIN_CM} cm minimum`,
    };
  }
  if (n > DIM_MAX_CM) {
    return {
      value: DIM_MAX_CM,
      clamped: true,
      reason: `Above ${DIM_MAX_CM} cm maximum`,
    };
  }
  return { value: n, clamped: false };
}
