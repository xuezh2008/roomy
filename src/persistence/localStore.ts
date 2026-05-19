import {
  DEFAULT_FOG,
  type FogSettings,
  type Room,
  type RoomObject,
} from "../objects/catalog";

// Persistence layer: versioned, debounced, quota-safe.
// v1: {room, objects}. v2 adds fog. Phase 7 will bump to v3 for AI render
// history. We bump on schema additions even when forward-compatible defaults
// could be applied — keeps the contract honest.

const KEY = "roomy:state";
const SCHEMA_VERSION = 2;
const DEBOUNCE_MS = 250;

interface Persisted {
  version: number;
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
}

export interface LoadedState {
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
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

export function saveState(state: LoadedState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const payload: Persisted = {
        version: SCHEMA_VERSION,
        room: state.room,
        objects: stripBlobModelUrls(state.objects),
        fog: state.fog,
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" || e.code === 22)
      ) {
        console.warn("[roomy] localStorage quota exceeded; state not saved");
      } else {
        console.warn("[roomy] save failed:", e);
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
    const payload: Persisted = {
      version: SCHEMA_VERSION,
      room: state.room,
      objects: stripBlobModelUrls(state.objects),
      fog: state.fog,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
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
