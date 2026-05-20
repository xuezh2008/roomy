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

interface GeminiErrorDetail {
  "@type"?: string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, string>;
}

interface GeminiError {
  code: number;
  message: string;
  status: string;
  details?: GeminiErrorDetail[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  error?: GeminiError;
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
    throw new Error(humanizeGeminiError(response.status, data.error));
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

// Translate Gemini's verbose error responses into actionable guidance.
// Uses error.details[].reason (REST API code) where available — those are
// stable identifiers like API_KEY_HTTP_REFERRER_BLOCKED that map cleanly
// to a specific fix.
export function humanizeGeminiError(
  httpStatus: number,
  error: GeminiError | undefined,
): string {
  const code = error?.code ?? httpStatus;
  const raw = error?.message ?? `HTTP ${httpStatus}`;
  const reason = error?.details?.[0]?.reason ?? "";
  const combined = `${raw} ${reason}`;

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
  if (code === 400 && /api[\s_-]?key/i.test(combined)) {
    return "Gemini: API key rejected. Generate one at https://aistudio.google.com/apikey and paste it via the ⚙ button.";
  }
  if (code === 401 || code === 403) {
    // 403 has several specific reasons — map by error.details[0].reason first,
    // falling back to message-text matching for older API responses.
    if (
      reason === "API_KEY_HTTP_REFERRER_BLOCKED" ||
      /referrer/i.test(combined)
    ) {
      return [
        "Gemini: the key has HTTP-referrer restrictions that block https://xuezh2008.github.io.",
        "",
        "Fix one of:",
        "• Edit the key at https://console.cloud.google.com/apis/credentials → Application restrictions → add `xuezh2008.github.io/*` to allowed referrers.",
        "• Or generate an unrestricted key at https://aistudio.google.com/apikey — AI Studio keys default to no referrer restrictions.",
      ].join("\n");
    }
    if (reason === "API_KEY_API_BLOCKED" || /api blocked|api_blocked/i.test(combined)) {
      return [
        "Gemini: the key is restricted from the Generative Language API.",
        "",
        "Fix: at https://console.cloud.google.com/apis/credentials → edit key → API restrictions → remove restrictions, or add 'Generative Language API' to the allowed list.",
      ].join("\n");
    }
    if (reason === "API_KEY_IP_ADDRESS_BLOCKED" || /ip address/i.test(combined)) {
      return [
        "Gemini: the key has IP-address restrictions that block this browser.",
        "",
        "Fix: at https://console.cloud.google.com/apis/credentials → edit key → Application restrictions → remove the IP restriction, or pick HTTP referrer with `xuezh2008.github.io/*` instead.",
      ].join("\n");
    }
    if (
      reason === "SERVICE_DISABLED" ||
      /service\s+(is\s+)?disabled|enable.*generative/i.test(combined)
    ) {
      return [
        "Gemini: the Generative Language API isn't enabled on this key's Google Cloud project.",
        "",
        "Fix: visit https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com and click Enable for the project that owns this key.",
      ].join("\n");
    }
    // Generic 401/403 with raw message + every diagnostic we can think of.
    return [
      `Gemini: ${code === 401 ? "key rejected" : "access denied"} for this model.`,
      "",
      `Google said: ${reason ? reason + " — " : ""}${raw.slice(0, 200)}`,
      "",
      "Common fixes:",
      "• HTTP referrer restriction → add `xuezh2008.github.io/*` at https://console.cloud.google.com/apis/credentials.",
      "• API restriction → allow Generative Language API on that page.",
      "• Wrong project / API not enabled → enable at https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com.",
      "• Or generate a fresh unrestricted key at https://aistudio.google.com/apikey.",
    ].join("\n");
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

// Lightweight key check: tiny image-gen request that catches the three
// common failure modes (invalid key / free-tier blocked / actually working).
// No input image, minimal prompt → cheapest call that still validates the
// image-gen quota path.
export interface TestResult {
  ok: boolean;
  message: string;
}

export async function testGeminiKey(apiKey: string): Promise<TestResult> {
  if (!apiKey.trim()) return { ok: false, message: "Empty key." };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey.trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "a single red dot on white" }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    const data: GeminiResponse = await response.json();
    if (response.ok && !data.error) {
      const hasImage = data.candidates?.[0]?.content?.parts?.some(
        (p) => (p.inlineData ?? p.inline_data)?.data,
      );
      return hasImage
        ? { ok: true, message: "✓ key works, billing active." }
        : {
            ok: false,
            message: "Key responded but no image — model not enabled?",
          };
    }
    return {
      ok: false,
      message: humanizeGeminiError(response.status, data.error),
    };
  } catch (e) {
    return {
      ok: false,
      message: `Network error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
