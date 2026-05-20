import type { Store } from "../state/store";
import type { Provider, Render, Style } from "../ai/types";
import { MAX_RENDER_HISTORY, buildPrompt } from "../ai/types";
import type { RoomyState } from "../objects/catalog";
import type { AISettings } from "../persistence/settings";
import { hasKey } from "../persistence/settings";
import { renderWithAI } from "../ai";
import { captureSnapshot, type SnapshotArgs } from "../export/snapshot";

// Bottom-of-canvas AI render drawer. Idle state shows a status pip + CTA;
// active state expands to show the prompt editor + result preview + history.

export interface RenderDrawerHandle {
  el: HTMLElement;
  open: () => void;
  detach: () => void;
}

const STYLES: Style[] = ["as-is", "cozy daylight", "editorial moody"];

export function attachRenderDrawer({
  host,
  store,
  getSettings,
  onOpenSettings,
  snapshotArgs,
}: {
  host: HTMLElement;
  store: Store<RoomyState>;
  getSettings: () => AISettings;
  onOpenSettings: (focus?: Provider) => void;
  snapshotArgs: () => Omit<SnapshotArgs, "state">;
}): RenderDrawerHandle {
  const drawer = document.createElement("aside");
  drawer.className = "render-drawer";
  drawer.dataset.state = "collapsed";

  drawer.innerHTML = `
    <div class="render-collapsed">
      <span class="render-status">
        <span class="render-pip"></span>
        <span class="render-status-text">idle</span>
      </span>
      <button type="button" class="render-cta">● Render with AI</button>
      <div class="render-history-rail"></div>
      <button type="button" class="render-settings-btn" aria-label="API keys">⚙</button>
    </div>
    <div class="render-expanded" hidden>
      <div class="render-prompt-pane">
        <div class="render-pane-header">
          <span>prompt</span>
          <button type="button" class="sidebar-link render-close">close ×</button>
        </div>
        <textarea class="render-prompt" rows="6" spellcheck="true"></textarea>
        <div class="render-provider-row">
          <span class="render-mini-label">provider</span>
          <div class="render-provider-toggle">
            <button type="button" class="provider-btn" data-provider="gemini">gemini</button>
            <button type="button" class="provider-btn" data-provider="openai">openai</button>
          </div>
        </div>
        <div class="render-style-row">
          <span class="render-mini-label">style</span>
          <div class="render-style-chips"></div>
        </div>
        <button type="button" class="btn-primary render-go">Render</button>
      </div>
      <div class="render-result-pane">
        <div class="render-result-status">No render yet — write a prompt and hit Render.</div>
        <img class="render-result-img" hidden />
        <div class="render-progress" hidden>
          <div class="render-progress-bar"></div>
          <div class="render-progress-text">working…</div>
        </div>
      </div>
    </div>
  `;

  host.appendChild(drawer);

  const collapsed = drawer.querySelector<HTMLDivElement>(".render-collapsed")!;
  const expanded = drawer.querySelector<HTMLDivElement>(".render-expanded")!;
  const cta = drawer.querySelector<HTMLButtonElement>(".render-cta")!;
  const closeBtn = drawer.querySelector<HTMLButtonElement>(".render-close")!;
  const promptArea = drawer.querySelector<HTMLTextAreaElement>(".render-prompt")!;
  const goBtn = drawer.querySelector<HTMLButtonElement>(".render-go")!;
  const settingsBtn =
    drawer.querySelector<HTMLButtonElement>(".render-settings-btn")!;
  const providerBtns = drawer.querySelectorAll<HTMLButtonElement>(
    ".render-provider-toggle .provider-btn",
  );
  const styleChipsHost =
    drawer.querySelector<HTMLDivElement>(".render-style-chips")!;
  const historyRail =
    drawer.querySelector<HTMLDivElement>(".render-history-rail")!;
  const resultImg = drawer.querySelector<HTMLImageElement>(".render-result-img")!;
  const resultStatus = drawer.querySelector<HTMLDivElement>(
    ".render-result-status",
  )!;
  const progress = drawer.querySelector<HTMLDivElement>(".render-progress")!;
  const statusText = drawer.querySelector<HTMLSpanElement>(
    ".render-status-text",
  )!;
  const pip = drawer.querySelector<HTMLSpanElement>(".render-pip")!;

  let currentProvider: Provider = getSettings().preferredProvider;
  let currentStyle: Style = "as-is";
  let inflight = false;

  // --- Style chips ---
  for (const s of STYLES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "style-chip";
    chip.dataset.style = s;
    chip.textContent = s;
    chip.addEventListener("click", () => setStyle(s));
    styleChipsHost.appendChild(chip);
  }
  const setStyle = (s: Style) => {
    currentStyle = s;
    for (const chip of styleChipsHost.querySelectorAll<HTMLButtonElement>(
      ".style-chip",
    )) {
      chip.classList.toggle("picked", chip.dataset.style === s);
    }
  };
  setStyle("as-is");

  // --- Provider toggles ---
  const setProvider = (p: Provider) => {
    currentProvider = p;
    for (const btn of providerBtns) {
      btn.classList.toggle("active", btn.dataset.provider === p);
    }
  };
  for (const btn of providerBtns) {
    btn.addEventListener("click", () =>
      setProvider(btn.dataset.provider as Provider),
    );
  }
  setProvider(currentProvider);

  // --- Open / close ---
  function open() {
    drawer.dataset.state = "expanded";
    expanded.hidden = false;
    collapsed.classList.add("dimmed");
    // Seed the prompt area with a generated baseline IF the textarea is empty.
    if (!promptArea.value.trim()) {
      seedPromptFromSnapshot();
    }
    promptArea.focus();
  }
  function close() {
    drawer.dataset.state = "collapsed";
    expanded.hidden = true;
    collapsed.classList.remove("dimmed");
  }

  cta.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  settingsBtn.addEventListener("click", () => onOpenSettings(currentProvider));

  async function seedPromptFromSnapshot() {
    try {
      const args = snapshotArgs();
      const snap = await captureSnapshot({ ...args, state: store.get() });
      promptArea.value = buildPrompt(snap, currentStyle);
    } catch (e) {
      promptArea.value = buildPrompt(
        {
          image: new Blob(),
          room: store.get().room,
          camera: { position: [0, 0, 0], target: [0, 0, 0], fov: 50 },
          lighting: { sunPosition: [4, 6, 3], ambientIntensity: 1.7 },
          objects: store.get().objects.map((o) => ({
            name: o.name,
            box: {
              min: [0, 0, 0],
              max: [o.dims.w, o.dims.h, o.dims.d],
            },
          })),
        },
        currentStyle,
      );
      console.warn("[roomy] snapshot for prompt seed failed:", e);
    }
  }

  // --- History rail rendering ---
  function renderHistory() {
    historyRail.replaceChildren();
    const renders = store.get().renders;
    const slots = Math.max(MAX_RENDER_HISTORY, renders.length);
    for (let i = 0; i < slots; i++) {
      const r = renders[i];
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "render-thumb";
      if (r) {
        tile.dataset.id = r.id;
        const img = document.createElement("img");
        img.src = r.imageDataUrl;
        img.alt = r.prompt.slice(0, 80);
        tile.appendChild(img);
        tile.title = `${r.provider} · ${new Date(r.createdAt).toLocaleString()}`;
        tile.addEventListener("click", () => {
          showResult(r.imageDataUrl, `from history — ${r.provider}`);
          promptArea.value = r.prompt;
          open();
        });
      } else {
        tile.classList.add("empty");
        tile.textContent = "+";
        tile.addEventListener("click", open);
      }
      historyRail.appendChild(tile);
    }
  }

  // --- Result display ---
  function showResult(src: string, label: string) {
    resultImg.src = src;
    resultImg.hidden = false;
    resultStatus.textContent = label;
    progress.hidden = true;
  }
  function showProgress(label: string) {
    progress.hidden = false;
    resultImg.hidden = true;
    resultStatus.textContent = label;
  }
  function showError(label: string) {
    progress.hidden = true;
    resultImg.hidden = true;
    resultStatus.textContent = label;
  }

  // --- Render trigger ---
  goBtn.addEventListener("click", () => void doRender());
  promptArea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void doRender();
    }
  });

  async function doRender() {
    if (inflight) return;
    const prompt = promptArea.value.trim();
    if (!prompt) {
      showError("Write a prompt first.");
      return;
    }

    // Cache lookup BEFORE API check: an identical (prompt, provider) pair
    // already in history means we have the answer locally. Free, instant,
    // and works even with no API key set.
    const cached = store
      .get()
      .renders.find(
        (r) => r.prompt === prompt && r.provider === currentProvider,
      );
    if (cached) {
      const ageS = Math.round((Date.now() - cached.createdAt) / 1000);
      const ageLabel = formatAge(ageS);
      showResult(cached.imageDataUrl, `${cached.provider} · cached (${ageLabel})`);
      statusText.textContent = "idle";
      return;
    }

    const settings = getSettings();
    if (!hasKey(settings, currentProvider)) {
      onOpenSettings(currentProvider);
      return;
    }
    inflight = true;
    pip.classList.add("active");
    statusText.textContent = `rendering · ${currentProvider}`;
    goBtn.disabled = true;
    showProgress("The model is making something nice for you. (~10–25 s)");

    try {
      const args = snapshotArgs();
      const snap = await captureSnapshot({ ...args, state: store.get() });
      const blob = await renderWithAI({
        provider: currentProvider,
        prompt,
        snapshot: snap,
        apiKey:
          currentProvider === "gemini" ? settings.geminiKey : settings.openaiKey,
      });
      const dataUrl = await blobToDataUrl(blob);
      const render: Render = {
        id: crypto.randomUUID(),
        prompt,
        provider: currentProvider,
        imageDataUrl: dataUrl,
        createdAt: Date.now(),
      };
      store.set((s) => ({
        ...s,
        renders: [render, ...s.renders].slice(0, MAX_RENDER_HISTORY),
      }));
      showResult(dataUrl, `${currentProvider} · just now`);
      statusText.textContent = "idle";
      pip.classList.remove("active");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
      statusText.textContent = "error";
      pip.classList.remove("active");
      pip.classList.add("error");
      setTimeout(() => pip.classList.remove("error"), 4000);
    } finally {
      inflight = false;
      goBtn.disabled = false;
    }
  }

  // --- Reactive: re-render history when store.renders changes ---
  const unsubStore = store.subscribe((state, prev) => {
    if (state.renders !== prev.renders) renderHistory();
  });
  renderHistory();

  return {
    el: drawer,
    open,
    detach() {
      unsubStore();
      drawer.remove();
    },
  };
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
