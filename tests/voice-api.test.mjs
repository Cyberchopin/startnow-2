import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("voice-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const context = { waitUntil() {}, passThroughOnException() {} };
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

test("returns natural wave audio without storing the TTS interaction", async () => {
  const originalFetch = globalThis.fetch;
  let outboundBody;
  globalThis.fetch = async (_url, init) => {
    outboundBody = JSON.parse(init.body);
    return Response.json({ output_audio: { data: "AAAAAA==" } });
  };

  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/voice", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.44" },
      body: JSON.stringify({ text: "Open the UCLA application page.", voice: "Sulafat" }),
    }), { ...environment, GEMINI_API_KEY: "test-only-key" }, context);

    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("content-type"), "audio/wav");
    assert.equal(outboundBody.model, "gemini-3.1-flash-tts-preview");
    assert.equal(outboundBody.store, false);
    assert.equal(outboundBody.generation_config.speech_config[0].voice, "Sulafat");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unsupported voice personas", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Open the application.", voice: "Unknown" }),
  }), environment, context);
  assert.equal(response.status, 400);
});
