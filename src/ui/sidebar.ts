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

  sidebar.append(roomSection.el, newObjectSection.el, objectsSection.el);
  host.appendChild(sidebar);

  // --- Wire ROOM section (readonly display from store) ---
  const renderRoom = (state: RoomyState) => {
    const r = state.room;
    roomSection.wChip.textContent = `${Math.round(r.width * 100)}`;
    roomSection.dChip.textContent = `${Math.round(r.depth * 100)}`;
    roomSection.hChip.textContent = `${Math.round(r.height * 100)}`;
  };

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
    const rows = state.objects.map((o) => buildObjectRow(o));
    objectsSection.list.replaceChildren(...rows);
  };

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
  heading.append(
    textSpan("ROOM"),
    suffixSpan("rectangular"),
  );

  const body = document.createElement("div");
  body.className = "room-display";
  const wChip = chip("W");
  const dChip = chip("D");
  const hChip = chip("H");
  body.append(wChip.row, dChip.row, hChip.row);

  el.append(heading, body);
  return {
    el,
    wChip: wChip.value,
    dChip: dChip.value,
    hChip: hChip.value,
  };
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

function buildObjectRow(obj: RoomObject): HTMLElement {
  const row = document.createElement("div");
  row.className = "object-row";
  row.dataset.id = obj.id;

  const swatch = document.createElement("span");
  swatch.className = "object-swatch";
  swatch.style.backgroundColor = obj.color;

  const name = document.createElement("span");
  name.className = "object-name";
  name.textContent = obj.name; // textContent only — XSS-safe

  const dims = document.createElement("span");
  dims.className = "object-dims";
  dims.textContent = `${cm(obj.dims.w)}×${cm(obj.dims.h)}×${cm(obj.dims.d)}`;

  row.append(swatch, name, dims);
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

function chip(label: string) {
  const row = document.createElement("div");
  row.className = "chip-row";
  const lbl = document.createElement("span");
  lbl.className = "chip-label";
  lbl.textContent = label;
  const val = document.createElement("span");
  val.className = "chip-value";
  val.textContent = "—";
  row.append(lbl, val);
  return { row, value: val };
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
