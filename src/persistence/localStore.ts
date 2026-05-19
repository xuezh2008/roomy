import type { Room, RoomObject } from "../objects/catalog";

// Persistence layer: versioned, debounced, quota-safe.
// Schema is intentionally small (room + objects). Phase 7 bumps to v2 when
// AI render history joins.

const KEY = "roomy:state";
const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 250;

interface Persisted {
  version: number;
  room: Room;
  objects: RoomObject[];
}

export interface LoadedState {
  room: Room;
  objects: RoomObject[];
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
    return { room: parsed.room, objects: parsed.objects };
  } catch (e) {
    console.warn("[roomy] failed to parse persisted state:", e);
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function saveState(state: LoadedState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const payload: Persisted = {
        version: SCHEMA_VERSION,
        room: state.room,
        objects: state.objects,
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
      objects: state.objects,
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
