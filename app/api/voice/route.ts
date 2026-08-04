const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const MAX_VOICE_REQUESTS_PER_HOUR = 30;
const VOICES = new Set(["Sulafat", "Achird", "Achernar"]);

declare global {
  var __START_NOW_VOICE_RATE_LIMITS__: Map<string, number> | undefined;
  var __START_NOW_VOICE_RATE_LIMIT_SALT__: string | undefined;
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

async function rateLimitKey(request: Request) {
  const ip = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  const configured = globalThis.__START_NOW_RATE_LIMIT_SALT__ ?? process.env.STUDY_RATE_LIMIT_SALT;
  const salt = configured && configured.length >= 24
    ? configured
    : globalThis.__START_NOW_VOICE_RATE_LIMIT_SALT__ ??= crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:voice:${ip}:${hour}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(request: Request) {
  const key = await rateLimitKey(request);
  const counters = globalThis.__START_NOW_VOICE_RATE_LIMITS__ ??= new Map<string, number>();
  const attempts = (counters.get(key) ?? 0) + 1;
  counters.set(key, attempts);
  if (counters.size > 1_000) counters.clear();
  return attempts > MAX_VOICE_REQUESTS_PER_HOUR;
}

function findAudioData(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const object = payload as Record<string, unknown>;
  const direct = object.output_audio;
  if (direct && typeof direct === "object" && typeof (direct as Record<string, unknown>).data === "string") {
    return (direct as Record<string, string>).data;
  }
  for (const value of Object.values(object)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findAudioData(item);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findAudioData(value);
      if (found) return found;
    }
  }
  return null;
}

function pcmToWave(base64: string) {
  const binary = atob(base64);
  const pcm = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24_000, true);
  view.setUint32(28, 48_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  bytes.set(pcm, 44);
  return buffer;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Voice request must be valid JSON." }, { status: 400 });
  }

  const text = clean(body.text, 420);
  const voice = clean(body.voice, 30);
  if (text.length < 3 || !VOICES.has(voice)) {
    return Response.json({ error: "Provide a short transcript and a supported voice." }, { status: 400 });
  }

  const apiKey = globalThis.__START_NOW_GEMINI_API_KEY__ ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "Natural voice is unavailable." }, { status: 503 });
  if (await isRateLimited(request)) {
    return Response.json({ error: "Voice limit reached. Browser voice is still available." }, { status: 429, headers: { "Retry-After": "3600" } });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model: TTS_MODEL,
        store: false,
        input: `Speak in a warm, grounded Body Double voice. Calm, human, unhurried, and close—not theatrical, sugary, clinical, or motivational. Read the transcript exactly once without adding words. Transcript: ${JSON.stringify(text)}`,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return Response.json({ error: "Natural voice generation failed." }, { status: 502 });
    const audio = findAudioData(await response.json());
    if (!audio) return Response.json({ error: "Natural voice returned no audio." }, { status: 502 });
    return new Response(pcmToWave(audio), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, no-store",
        "X-Voice-Model": TTS_MODEL,
      },
    });
  } catch {
    return Response.json({ error: "Natural voice is temporarily unavailable." }, { status: 503 });
  }
}
