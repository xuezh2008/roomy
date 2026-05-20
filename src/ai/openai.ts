import type { RenderRequest } from "./types";

// OpenAI gpt-image-1 via the images/edits endpoint (image-to-image).
// Direct browser fetch. Multipart/form-data: the snapshot PNG goes as the
// "image" field, the prompt as text.
//
// SECURITY NOTE: OpenAI keys are full-org-scoped by default. A leaked
// browser key can rack up billing until rate-limited. This is the explicit
// trade-off for the no-backend Pages deploy; users should rotate the key
// after testing if any third party may have hit this URL.

const ENDPOINT = "https://api.openai.com/v1/images/edits";

interface OpenAIResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message: string; type?: string; code?: string };
}

export async function callOpenAI(req: RenderRequest): Promise<Blob> {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("image", req.snapshot.image, "snapshot.png");
  form.append("prompt", req.prompt);
  form.append("size", "1536x1024"); // best landscape match for a 1920x1080 snapshot
  form.append("quality", "medium");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: form,
  });

  const data: OpenAIResponse = await response.json();

  if (!response.ok || data.error) {
    const apiMsg = data.error?.message ?? `HTTP ${response.status}`;
    throw new Error(humanizeOpenAIError(response.status, apiMsg));
  }

  const first = data.data?.[0];
  if (first?.b64_json) {
    return base64ToBlob(first.b64_json, "image/png");
  }
  if (first?.url) {
    const r = await fetch(first.url);
    return r.blob();
  }

  throw new Error("OpenAI returned no image");
}

function humanizeOpenAIError(code: number, raw: string): string {
  if (code === 429 || /quota/i.test(raw) || /rate limit/i.test(raw)) {
    return "OpenAI: rate limit or quota exceeded. Check usage at https://platform.openai.com/usage, or switch to Gemini.";
  }
  if (code === 401 || code === 403 || /api[\s_-]?key|invalid/i.test(raw)) {
    return "OpenAI: API key rejected. Get one at https://platform.openai.com/api-keys and paste it via the ⚙ button.";
  }
  if (/verif/i.test(raw)) {
    // gpt-image-1 requires "Verified Organization" status on the OpenAI account.
    return (
      "OpenAI: gpt-image-1 requires a verified organization on your account.\n" +
      "Fix: complete verification at https://platform.openai.com/settings/organization/general — or switch to Gemini."
    );
  }
  if (code === 400 && /image/i.test(raw)) {
    return `OpenAI: image input rejected — ${raw.split(/(?<=[.!?])\s/, 1)[0] ?? raw}`;
  }
  const firstSentence = raw.split(/(?<=[.!?])\s/, 1)[0] ?? raw;
  return `OpenAI: ${firstSentence}`;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Lightweight key check: GET /v1/models is free, validates auth.
// Does NOT confirm gpt-image-1 access specifically — that requires a
// verified organization which we can only detect on a real edit call.
export interface TestResult {
  ok: boolean;
  message: string;
}

export async function testOpenAIKey(apiKey: string): Promise<TestResult> {
  if (!apiKey.trim()) return { ok: false, message: "Empty key." };
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (response.ok) {
      const data = await response.json();
      const models = Array.isArray(data.data) ? data.data : [];
      const hasImage = models.some(
        (m: { id?: string }) => m.id === "gpt-image-1",
      );
      return hasImage
        ? { ok: true, message: "✓ key works, gpt-image-1 available." }
        : {
            ok: true,
            message:
              "✓ key works, but gpt-image-1 not listed — your org may need verification at https://platform.openai.com/settings/organization/general",
          };
    }
    const data = await response.json().catch(() => ({}));
    const apiMsg = data.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, message: humanizeOpenAIError(response.status, apiMsg) };
  } catch (e) {
    return {
      ok: false,
      message: `Network error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
