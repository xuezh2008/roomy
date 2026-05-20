import type { RenderRequest } from "./types";

// Gemini 2.5 Flash Image (nano-banana). Image-to-image via generateContent.
// Direct browser fetch; CORS is permitted by Google. The key sits in
// localStorage which the user enters via the settings modal.

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  error?: { code: number; message: string; status: string };
}

export async function callGemini(req: RenderRequest): Promise<Blob> {
  const imageBase64 = await blobToBase64(req.snapshot.image);

  const url = `${ENDPOINT}?key=${encodeURIComponent(req.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: req.prompt },
            { inline_data: { mime_type: "image/png", data: imageBase64 } },
          ],
        },
      ],
    }),
  });

  const data: GeminiResponse = await response.json();

  if (!response.ok || data.error) {
    const apiMsg = data.error?.message ?? `HTTP ${response.status}`;
    const code = data.error?.code ?? response.status;
    throw new Error(humanizeGeminiError(code, apiMsg));
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    // The API sometimes returns snake_case, sometimes camelCase.
    const inline = p.inline_data ?? p.inlineData;
    if (inline?.data) {
      const mime =
        ("mime_type" in inline && inline.mime_type) ||
        ("mimeType" in inline && inline.mimeType) ||
        "image/png";
      return base64ToBlob(inline.data, mime as string);
    }
  }

  // No image in the response — log the text parts for the user to see.
  const text = parts.find((p) => p.text)?.text;
  throw new Error(
    `Gemini returned no image${text ? ` — model said: ${text}` : ""}`,
  );
}

// Pull the first useful sentence out of Gemini's verbose error responses and
// give it actionable framing. The raw API message dumps doc URLs + per-metric
// breakdowns that don't help anyone fix the problem.
function humanizeGeminiError(code: number, raw: string): string {
  const isQuota = code === 429 || /quota/i.test(raw) || /rate limit/i.test(raw);
  const isFreeTierZero = /limit:\s*0/i.test(raw);

  if (isQuota && isFreeTierZero) {
    return (
      "Gemini: image generation is not included in the free tier on this key.\n" +
      "Fix: enable billing at https://aistudio.google.com/apikey — or switch the provider toggle to OpenAI."
    );
  }
  if (isQuota) {
    const retry = raw.match(/retry in ([\d.]+)\s*s/i);
    return `Gemini: rate limited${retry ? ` (retry in ${Math.ceil(parseFloat(retry[1]))} s)` : ""}. Try again shortly or switch to OpenAI.`;
  }
  if (code === 400 && /api[\s_-]?key/i.test(raw)) {
    return "Gemini: API key rejected. Generate one at https://aistudio.google.com/apikey and paste it via the ⚙ button.";
  }
  if (code === 401 || code === 403) {
    return "Gemini: API key isn't authorized for this model. Check key permissions at https://aistudio.google.com/apikey.";
  }
  // Default: keep the first sentence of the raw message and drop the rest.
  const firstSentence = raw.split(/(?<=[.!?])\s/, 1)[0] ?? raw;
  return `Gemini: ${firstSentence}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  // Chunked encode to avoid call-stack limits on large arrays
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
