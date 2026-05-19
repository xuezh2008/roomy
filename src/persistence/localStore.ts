import {
  DEFAULT_FOG,
  type FogSettings,
  type Room,
  type RoomObject,
} from "../objects/catalog";
import type { Render } from "../ai/types";

// Persistence layer: versioned, debounced, quota-safe.
// v1: {room, objects}. v2 adds fog. v3 adds renders (AI history, ~500 KB
// per PNG so quota matters — renders are evicted before scene state on
// QuotaExceededError).

const KEY = "roomy:state";
const SCHEMA_VERSION = 3;
const DEBOUNCE_MS = 250;

interface Persisted {
  version: number;
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
  renders?: Render[];
}

export interface LoadedState {
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
  renders: Render[];
}

export function loadState(): LoadedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.version !== SCHEMA_VERSION) {
      console.info(
        `[roomy] persisted state schema mismatch (got ${parsed.version}, want ${SCHEMA_VERSION}) — starting fresh`,
      );
      return null;
    }
    if (!parsed.room || !Array.isArray(parsed.objects)) return null;
    // Light shape check on each object. If anything looks off, bail rather
    // than throwing later when the bridge tries to materialize it.
    for (const o of parsed.objects) {
      if (
        !o ||
        typeof o.id !== "string" ||
        !o.dims ||
        !Array.isArray(o.position) ||
        typeof o.color !== "string"
      ) {
        console.warn("[roomy] persisted object failed shape check; ignoring all");
        return null;
      }
    }
    return {
      room: parsed.room,
      objects: parsed.objects,
      fog: parsed.fog ?? DEFAULT_FOG,
      renders: Array.isArray(parsed.renders) ? parsed.renders : [],
    };
  } catch (e) {
    console.warn("[roomy] failed to parse persisted state:", e);
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

// Strip blob URLs before saving — they're tied to the current document and
// don't survive a refresh. Better to drop modelUrl entirely than to persist
// a dangling reference that triggers load errors on next boot.
function stripBlobModelUrls(objects: RoomObject[]): RoomObject[] {
  return objects.map((o) =>
    o.modelUrl && o.modelUrl.startsWith("blob:")
      ? { ...o, modelUrl: undefined }
      : o,
  );
}

function buildPayload(state: LoadedState, renders: Render[]): Persisted {
  return {
    version: SCHEMA_VERSION,
    room: state.room,
    objects: stripBlobModelUrls(state.objects),
    fog: state.fog,
    renders: renders.length > 0 ? renders : undefined,
  };
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.code === 22)
  );
}

export function saveState(state: LoadedState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // First attempt: everything.
    let renders = state.renders;
    while (true) {
      try {
        localStorage.setItem(KEY, JSON.stringify(buildPayload(state, renders)));
        return;
      } catch (e) {
        if (!isQuotaError(e)) {
          console.warn("[roomy] save failed:", e);
          return;
        }
        // Quota: drop the oldest render and retry. Renders are recoverable;
        // scene state is not, so we always evict renders before bailing.
        if (renders.length > 0) {
          renders = renders.slice(0, -1);
          continue;
        }
        console.warn(
          "[roomy] localStorage quota exceeded even without renders; state not saved",
        );
        return;
      }
    }
  }, DEBOUNCE_MS);
}

export function flushSave(state: LoadedState): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(buildPayload(state, state.renders)));
  } catch (e) {
    console.warn("[roomy] flush save failed:", e);
  }
}

export function clearPersisted(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  localStorage.removeItem(KEY);
}
