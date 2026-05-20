import type { RenderRequest } from "./types";

// Gemini 2.5 Flash Image (nano-banana). Image-to-image via generateContent.
// Direct browser fetch; CORS is permitted by Google.
//
// Format mirrors the gstack img-gen-nb skill — specifically:
//   - x-goog-api-key header (not ?key= URL param, which is older/discouraged)
//   - generationConfig.responseModalities = ["TEXT", "IMAGE"] — REQUIRED to
//     actually receive an image back; without it the image-capable model
//     defaults to text-only output even on paid keys.
//   - camelCase inlineData / mimeType throughout (API accepts both but the
//     reference impl uses camelCase end-to-end).

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  // Some responses still come back snake_case; keep a fallback parser.
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  error?: { code: number; message: string; status: string };
}

export async function callGemini(req: RenderRequest): Promise<Blob> {
  const imageBase64 = await blobToBase64(req.snapshot.image);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": req.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: req.prompt },
            { inlineData: { mimeType: "image/png", data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) {
      const mime =
        (p.inlineData && p.inlineData.mimeType) ||
        (p.inline_data && p.inline_data.mime_type) ||
        "image/png";
      return base64ToBlob(inline.data, mime);
    }
  }

  // No image in the response — surface the text part so the user sees why.
  const text = parts.find((p) => p.text)?.text;
  throw new Error(
    `Gemini returned no image${text ? ` — model said: ${text.slice(0, 280)}` : ""}`,
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
  const firstSentence = raw.split(/(?<=[.!?])\s/, 1)[0] ?? raw;
  return `Gemini: ${firstSentence}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
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
