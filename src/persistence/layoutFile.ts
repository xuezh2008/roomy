import {
  DEFAULT_FOG,
  type FogSettings,
  type Room,
  type RoomObject,
} from "../objects/catalog";

// Save / load the current scene to a portable .json file the user can
// keep alongside other docs. Schema mirrors the localStorage layout but
// adds `savedAt` + `name` for human consumption. Render history is NOT
// included — it's tied to a specific session's API responses.

const FILE_SCHEMA_VERSION = 1;

interface LayoutFile {
  schema: "roomy-layout";
  version: number;
  name: string;
  savedAt: number;
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
}

export interface ImportedLayout {
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
}

// Trigger a browser download of the current layout. blob: model URLs are
// dropped so the file doesn't carry dangling refs across machines.
export function exportLayout(input: {
  room: Room;
  objects: RoomObject[];
  fog: FogSettings;
  name?: string;
}): void {
  const name = (input.name ?? "roomy-layout").trim() || "roomy-layout";
  const payload: LayoutFile = {
    schema: "roomy-layout",
    version: FILE_SCHEMA_VERSION,
    name,
    savedAt: Date.now(),
    room: input.room,
    objects: input.objects.map((o) =>
      o.modelUrl?.startsWith("blob:") ? { ...o, modelUrl: undefined } : o,
    ),
    fog: input.fog,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[T:]/g, "-");
  link.href = url;
  link.download = `${slugify(name)}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after a beat so Safari + Firefox don't cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function importLayout(file: File): Promise<ImportedLayout> {
  const text = await file.text();
  let parsed: Partial<LayoutFile>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File isn't valid JSON.");
  }
  if (parsed.schema && parsed.schema !== "roomy-layout") {
    throw new Error("That JSON isn't a Roomy layout file.");
  }
  if (!parsed.room || !Array.isArray(parsed.objects)) {
    throw new Error("Layout file is missing room or objects.");
  }
  for (const o of parsed.objects) {
    if (
      !o ||
      typeof o.id !== "string" ||
      !o.dims ||
      !Array.isArray(o.position) ||
      typeof o.color !== "string"
    ) {
      throw new Error("Layout file contains an invalid object entry.");
    }
  }
  return {
    room: parsed.room,
    objects: parsed.objects,
    fog: parsed.fog ?? DEFAULT_FOG,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "roomy-layout";
}
