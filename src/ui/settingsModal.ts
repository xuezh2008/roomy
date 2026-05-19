import type { AISettings } from "../persistence/settings";
import type { Provider } from "../ai/types";

// Settings popup: enter API keys + pick preferred provider. Keys are stored
// in this browser's localStorage. The modal makes the trade-off explicit
// (warning text + link-out to provider key pages).

export interface SettingsModalHandle {
  open: (focusProvider?: Provider) => void;
  detach: () => void;
}

export function attachSettingsModal({
  host,
  getSettings,
  setSettings,
}: {
  host: HTMLElement;
  getSettings: () => AISettings;
  setSettings: (next: AISettings) => void;
}): SettingsModalHandle {
  const backdrop = document.createElement("div");
  backdrop.className = "settings-backdrop";
  backdrop.hidden = true;

  const modal = document.createElement("div");
  modal.className = "settings-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "API key settings");

  modal.innerHTML = `
    <header class="settings-header">
      <h2 class="settings-title">AI render keys</h2>
      <button type="button" class="settings-close" aria-label="Close">×</button>
    </header>
    <p class="settings-warning">
      Keys live in this browser only. They never leave your machine, but the
      tab can read them — only paste a key on a device you trust. Rotate
      after testing if anyone else may have hit this URL.
    </p>
    <div class="settings-row">
      <label class="settings-label" for="gemini-key">Gemini (nano-banana)</label>
      <input id="gemini-key" type="password" class="settings-input" autocomplete="off" spellcheck="false" />
      <a class="settings-help" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">get a key ↗</a>
    </div>
    <div class="settings-row">
      <label class="settings-label" for="openai-key">OpenAI (gpt-image-1)</label>
      <input id="openai-key" type="password" class="settings-input" autocomplete="off" spellcheck="false" />
      <a class="settings-help" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">get a key ↗</a>
    </div>
    <div class="settings-row settings-provider-row">
      <span class="settings-label">Preferred</span>
      <div class="settings-provider-toggle" role="radiogroup" aria-label="Preferred provider">
        <button type="button" class="provider-btn" data-provider="gemini">gemini</button>
        <button type="button" class="provider-btn" data-provider="openai">openai</button>
      </div>
    </div>
    <footer class="settings-footer">
      <button type="button" class="btn-primary settings-save">Save</button>
      <button type="button" class="sidebar-link settings-clear">Clear all keys</button>
    </footer>
  `;

  backdrop.appendChild(modal);
  host.appendChild(backdrop);

  const geminiInput = modal.querySelector<HTMLInputElement>("#gemini-key")!;
  const openaiInput = modal.querySelector<HTMLInputElement>("#openai-key")!;
  const providerBtns = modal.querySelectorAll<HTMLButtonElement>(".provider-btn");
  const saveBtn = modal.querySelector<HTMLButtonElement>(".settings-save")!;
  const clearBtn = modal.querySelector<HTMLButtonElement>(".settings-clear")!;
  const closeBtn = modal.querySelector<HTMLButtonElement>(".settings-close")!;

  let currentProvider: Provider = "gemini";

  const renderProvider = (p: Provider) => {
    currentProvider = p;
    for (const btn of providerBtns) {
      btn.classList.toggle("active", btn.dataset.provider === p);
    }
  };

  for (const btn of providerBtns) {
    btn.addEventListener("click", () =>
      renderProvider(btn.dataset.provider as Provider),
    );
  }

  saveBtn.addEventListener("click", () => {
    setSettings({
      geminiKey: geminiInput.value.trim(),
      openaiKey: openaiInput.value.trim(),
      preferredProvider: currentProvider,
    });
    close();
  });

  clearBtn.addEventListener("click", () => {
    if (!confirm("Clear both API keys from this browser?")) return;
    setSettings({
      geminiKey: "",
      openaiKey: "",
      preferredProvider: currentProvider,
    });
    geminiInput.value = "";
    openaiInput.value = "";
  });

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function open(focusProvider?: Provider) {
    const s = getSettings();
    geminiInput.value = s.geminiKey;
    openaiInput.value = s.openaiKey;
    renderProvider(focusProvider ?? s.preferredProvider);
    backdrop.hidden = false;
    queueMicrotask(() => {
      const target =
        focusProvider === "openai"
          ? openaiInput
          : focusProvider === "gemini"
            ? geminiInput
            : s.geminiKey
              ? openaiInput
              : geminiInput;
      target.focus();
    });
  }

  function close() {
    backdrop.hidden = true;
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !backdrop.hidden) {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", onKey);

  return {
    open,
    detach() {
      window.removeEventListener("keydown", onKey);
      backdrop.remove();
    },
  };
}
