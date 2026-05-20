import type { Room } from "../objects/catalog";

// Snapshot is the contract between scene capture (export/snapshot.ts) and
// the AI client (ai/*). Phase 6 of the plan locked this schema.

export interface Snapshot {
  image: Blob; // PNG, 1920x1080
  room: Room;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  lighting: {
    sunPosition: [number, number, number];
    ambientIntensity: number;
    fogColor?: string;
    fogNear?: number;
    fogFar?: number;
  };
  objects: Array<{
    name: string;
    box: { min: [number, number, number]; max: [number, number, number] };
    modelName?: string;
  }>;
}

export type Provider = "gemini" | "openai";

export type Style = "as-is" | "cozy daylight" | "editorial moody";

export interface RenderRequest {
  provider: Provider;
  prompt: string;
  snapshot: Snapshot;
  apiKey: string;
}

export interface RenderResult {
  imageBlob: Blob;
  prompt: string;
  provider: Provider;
}

// Stored render history entry. Data URL form so it can survive localStorage.
export interface Render {
  id: string;
  prompt: string;
  provider: Provider;
  imageDataUrl: string;
  createdAt: number;
}

export const MAX_RENDER_HISTORY = 6;

// Helper: build the auto-generated prompt body from the snapshot scene.
// User can edit anything; this is just the seed.
export function buildPrompt(snapshot: Snapshot, style: Style): string {
  const { room, objects } = snapshot;
  const objectList =
    objects.length === 0
      ? "an empty room"
      : `${objects.map((o) => o.name).join(", ")}`;
  const styleSuffix = style === "as-is" ? "" : `, ${style}`;
  return `Photoreal interior of a ${room.width.toFixed(1)} m × ${room.depth.toFixed(
    1,
  )} m × ${room.height.toFixed(1)} m room with warm afternoon light, containing ${objectList}${styleSuffix}. Architecture matches the reference image layout.`;
}
