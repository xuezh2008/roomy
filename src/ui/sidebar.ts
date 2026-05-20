import type { Store } from "../state/store";
import {
  DIM_MAX_CM,
  DIM_MIN_CM,
  createObject,
  validateDimCm,
  type RoomObject,
  type RoomyState,
} from "../objects/catalog";
import { cssHex } from "../lifecycle/cssVar";
import { exportLayout, importLayout } from "../persistence/layoutFile";

// Drafting-table sidebar: ROOM (readonly chips), NEW OBJECT form, OBJECTS list.
// All list content goes through textContent — never innerHTML — to neutralize
// XSS via crafted object names (Phase 3a F11 from eng review).

const SWATCH_COUNT = 8;

export interface SidebarHandle {
  root: HTMLElement;
  focusNameInput: () => void;
  detach: () => void;
}

export function attachSidebar(
  host: HTMLElement,
  store: Store<RoomyState>,
): SidebarHandle {
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.setAttribute("aria-label", "Workbench");

  const roomSection = buildRoomSection();
  const newObjectSection = buildNewObjectSection();
  const objectsSection = buildObjectsListSection();
  const filesSection = buildFilesSection();

  sidebar.append(
    roomSection.el,
    newObjectSection.el,
    objectsSection.el,
    filesSection.el,
  );
  host.appendChild(sidebar);

  // --- Wire FILES section (save + load JSON layout) ---
  filesSection.saveBtn.addEventListener("click", () => {
    const state = store.get();
    exportLayout({
      room: state.room,
      objects: state.objects,
      fog: state.fog,
    });
  });

  filesSection.loadInput.addEventListener("change", async () => {
    const file = filesSection.loadInput.files?.[0];
    filesSection.loadInput.value = "";
    if (!file) return;
    try {
      const layout = await importLayout(file);
      store.set((s) => ({
        ...s,
        room: layout.room,
        objects: layout.objects,
        fog: layout.fog,
        selectedId: null,
      }));
      filesSection.status.textContent = `loaded ${file.name}`;
      filesSection.status.classList.remove("error");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      filesSection.status.textContent = msg;
      filesSection.status.classList.add("error");
    }
  });
  filesSection.loadBtn.addEventListener("click", () => {
    filesSection.loadInput.click();
  });

  // --- Wire ROOM section (editable; commits on change/blur) ---
  const renderRoom = (state: RoomyState) => {
    const r = state.room;
    // Don't clobber the value the user is mid-typing.
    if (document.activeElement !== roomSection.wInput) {
      roomSection.wInput.value = String(Math.round(r.width * 100));
    }
    if (document.activeElement !== roomSection.dInput) {
      roomSection.dInput.value = String(Math.round(r.depth * 100));
    }
    if (document.activeElement !== roomSection.hInput) {
      roomSection.hInput.value = String(Math.round(r.height * 100));
    }
  };

  const commitRoom = () => {
    const wCm = clampCm(roomSection.wInput.value, 100, 3000);
    const dCm = clampCm(roomSection.dInput.value, 100, 3000);
    const hCm = clampCm(roomSection.hInput.value, 200, 1000);
    store.set((s) => ({
      ...s,
      room: { width: wCm / 100, depth: dCm / 100, height: hCm / 100 },
    }));
  };
  roomSection.wInput.addEventListener("change", commitRoom);
  roomSection.dInput.addEventListener("change", commitRoom);
  roomSection.hInput.addEventListener("change", commitRoom);

  // --- Wire NEW OBJECT form ---
  let pickedColor: string | null = null;

  const renderSwatches = () => {
    newObjectSection.swatchHost.replaceChildren();
    for (let i = 1; i <= SWATCH_COUNT; i++) {
      const hex = cssHex(`--swatch-${i}`, "#3d4a6b");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch";
      btn.style.backgroundColor = hex;
      btn.setAttribute("aria-label", `Color swatch ${i}`);
      btn.dataset.color = hex;
      btn.addEventListener("click", () => {
        pickedColor = hex;
        for (const sib of newObjectSection.swatchHost.children) {
          sib.classList.toggle("picked", sib === btn);
        }
      });
      newObjectSection.swatchHost.appendChild(btn);
    }
  };
  renderSwatches();

  const showError = (msg: string | null) => {
    if (msg) {
      newObjectSection.errorBox.textContent = msg;
      newObjectSection.errorBox.hidden = false;
    } else {
      newObjectSection.errorBox.textContent = "";
      newObjectSection.errorBox.hidden = true;
    }
  };

  newObjectSection.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = newObjectSection.name.value.trim();
    if (!name) {
      showError("Name required.");
      newObjectSection.name.focus();
      return;
    }

    const wResult = validateDimCm(newObjectSection.w.value);
    const hResult = validateDimCm(newObjectSection.h.value);
    const dResult = validateDimCm(newObjectSection.d.value);

    const reasons = [wResult, hResult, dResult]
      .filter((r) => r.clamped && r.reason)
      .map((r) => r.reason);
    if (reasons.length) {
      showError(
        `Dimensions clamped to ${DIM_MIN_CM}–${DIM_MAX_CM} cm: ${reasons.join("; ")}`,
      );
    } else {
      showError(null);
    }

    const state = store.get();
    const obj = createObject({
      name,
      dimsCm: { w: wResult.value, h: hResult.value, d: dResult.value },
      color: pickedColor ?? undefined,
      index: state.objects.length,
    });

    store.set((s) => ({ ...s, objects: [...s.objects, obj] }));

    // Reset form for the next entry; keep w/h/d so user can iterate.
    newObjectSection.name.value = "";
    pickedColor = null;
    for (const sib of newObjectSection.swatchHost.children) {
      sib.classList.remove("picked");
    }
    newObjectSection.name.focus();
  });

  // --- Render OBJECTS list reactively ---
  const renderObjects = (state: RoomyState) => {
    objectsSection.count.textContent = String(state.objects.length).padStart(
      2,
      "0",
    );
    if (state.objects.length === 0) {
      objectsSection.list.replaceChildren(buildEmptyCard());
      return;
    }
    const rows = state.objects.map((o) =>
      buildObjectRow(
        o,
        o.id === state.selectedId,
        // onClick: select the row's object
        () =>
          store.set((s) =>
            s.selectedId === o.id ? s : { ...s, selectedId: o.id },
          ),
        // onDelete: remove from objects + clear selection if it was selected
        () =>
          store.set((s) => ({
            ...s,
            selectedId: s.selectedId === o.id ? null : s.selectedId,
            objects: s.objects.filter((x) => x.id !== o.id),
          })),
        // onLoadModel: open file picker, set modelUrl on the object
        () => pickModelFile(o.id),
      ),
    );
    objectsSection.list.replaceChildren(...rows);
  };

  // Hidden file input reused across rows. Clicking "load" on a row sets
  // pendingPickId so the change handler knows which object receives the URL.
  let pendingPickId: string | null = null;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || !pendingPickId) return;
    const url = URL.createObjectURL(file);
    const id = pendingPickId;
    pendingPickId = null;
    store.set((s) => ({
      ...s,
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, modelUrl: url } : o,
      ),
    }));
  });
  sidebar.appendChild(fileInput);

  function pickModelFile(objectId: string) {
    pendingPickId = objectId;
    fileInput.click();
  }

  // Initial paint
  renderRoom(store.get());
  renderObjects(store.get());

  const unsubscribe = store.subscribe((state) => {
    renderRoom(state);
    renderObjects(state);
  });

  return {
    root: sidebar,
    focusNameInput: () => newObjectSection.name.focus(),
    detach: () => {
      unsubscribe();
      sidebar.remove();
    },
  };
}

// ----- DOM builders (no state, no listeners — pure DOM tree construction) -----

function buildRoomSection() {
  const el = document.createElement("section");
  el.className = "sidebar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.append(textSpan("ROOM"), suffixSpan("rectangular · cm"));

  const body = document.createElement("div");
  body.className = "room-dims";
  const w = roomDimInput("W", 100, 3000);
  const d = roomDimInput("D", 100, 3000);
  const h = roomDimInput("H", 200, 1000);
  body.append(w.wrap, d.wrap, h.wrap);

  el.append(heading, body);
  return {
    el,
    wInput: w.input,
    dInput: d.input,
    hInput: h.input,
  };
}

function roomDimInput(label: string, minCm: number, maxCm: number) {
  const wrap = document.createElement("label");
  wrap.className = "dim-input";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(minCm);
  input.max = String(maxCm);
  input.step = "10";
  input.autocomplete = "off";
  wrap.append(lbl, input);
  return { wrap, input };
}

function clampCm(raw: string, lo: number, hi: number): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function buildNewObjectSection() {
  const el = document.createElement("section");
  el.className = "sidebar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.append(textSpan("NEW OBJECT"), suffixSpan("cm"));

  const form = document.createElement("form");
  form.className = "new-object-form";
  form.noValidate = true;

  const name = document.createElement("input");
  name.type = "text";
  name.name = "name";
  name.placeholder = "name (e.g. couch)";
  name.maxLength = 60;
  name.autocomplete = "off";
  name.required = true;

  const dimsRow = document.createElement("div");
  dimsRow.className = "dims-row";
  const w = dimInput("W", 80);
  const h = dimInput("H", 75);
  const d = dimInput("D", 60);
  dimsRow.append(w.label, h.label, d.label);

  const swatchHost = document.createElement("div");
  swatchHost.className = "swatches";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn-primary";
  submit.textContent = "+ Add to room";

  const errorBox = document.createElement("div");
  errorBox.className = "form-error";
  errorBox.hidden = true;
  errorBox.setAttribute("role", "alert");

  form.append(name, dimsRow, swatchHost, submit, errorBox);
  el.append(heading, form);

  return {
    el,
    form,
    name,
    w: w.input,
    h: h.input,
    d: d.input,
    swatchHost,
    submit,
    errorBox,
  };
}

function buildFilesSection() {
  const el = document.createElement("section");
  el.className = "sidebar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.append(textSpan("FILES"), suffixSpan("json"));

  const row = document.createElement("div");
  row.className = "files-row";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-ghost";
  saveBtn.textContent = "↓ Save layout";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "btn-ghost";
  loadBtn.textContent = "↑ Load layout";

  const loadInput = document.createElement("input");
  loadInput.type = "file";
  loadInput.accept = ".json,application/json";
  loadInput.hidden = true;

  row.append(saveBtn, loadBtn);

  const status = document.createElement("div");
  status.className = "files-status";

  el.append(heading, row, status, loadInput);
  return { el, saveBtn, loadBtn, loadInput, status };
}

function buildObjectsListSection() {
  const el = document.createElement("section");
  el.className = "sidebar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  const titleSpan = textSpan("OBJECTS · ");
  const countSpan = document.createElement("span");
  countSpan.className = "section-count";
  countSpan.textContent = "00";
  titleSpan.append(countSpan);
  heading.append(titleSpan);

  const list = document.createElement("div");
  list.className = "objects-list";

  el.append(heading, list);
  return { el, list, count: countSpan };
}

function buildEmptyCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "objects-empty";
  card.textContent = "No pieces drafted yet.";
  return card;
}

function buildObjectRow(
  obj: RoomObject,
  selected: boolean,
  onClick: () => void,
  onDelete: () => void,
  onLoadModel: () => void,
): HTMLElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "object-row" + (selected ? " selected" : "");
  if (obj.modelUrl) row.classList.add("has-model");
  row.dataset.id = obj.id;
  row.addEventListener("click", () => {
    onClick();
  });

  const swatch = document.createElement("span");
  swatch.className = "object-swatch";
  swatch.style.backgroundColor = obj.color;

  const name = document.createElement("span");
  name.className = "object-name";
  name.textContent = obj.name; // textContent only — XSS-safe

  const dims = document.createElement("span");
  dims.className = "object-dims";
  dims.textContent = `${cm(obj.dims.w)}×${cm(obj.dims.h)}×${cm(obj.dims.d)}`;

  const load = document.createElement("button");
  load.type = "button";
  load.className = "object-row__load";
  load.setAttribute(
    "aria-label",
    obj.modelUrl ? `Replace model for ${obj.name}` : `Load model for ${obj.name}`,
  );
  load.textContent = obj.modelUrl ? "glb" : "+glb";
  load.addEventListener("click", (e) => {
    e.stopPropagation();
    onLoadModel();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "object-row__delete";
  del.setAttribute("aria-label", `Delete ${obj.name}`);
  del.textContent = "×";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete();
  });

  row.append(swatch, name, dims, load, del);
  return row;
}

// ----- tiny DOM helpers -----

function textSpan(s: string): HTMLSpanElement {
  const sp = document.createElement("span");
  sp.textContent = s;
  return sp;
}

function suffixSpan(s: string): HTMLSpanElement {
  const sp = document.createElement("span");
  sp.className = "section-suffix";
  sp.textContent = s;
  return sp;
}

function dimInput(label: string, defaultCm: number) {
  const wrap = document.createElement("label");
  wrap.className = "dim-input";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(DIM_MIN_CM);
  input.max = String(DIM_MAX_CM);
  input.step = "1";
  input.required = true;
  input.value = String(defaultCm);
  input.autocomplete = "off";
  wrap.append(lbl, input);
  return { label: wrap, input };
}

function cm(meters: number): string {
  return String(Math.round(meters * 100));
}
