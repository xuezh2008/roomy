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
    const msg = data.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`OpenAI: ${msg}`);
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

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
