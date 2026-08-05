import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("mission-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("returns a validated deterministic mission when Gemini is not configured", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/mission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "Apply to an ML internship",
      kind: "career",
      friction: "too_big",
      energy: 2,
      overwhelm: 3,
      shrinkLevel: 1,
      matchingStarts: 0,
      learnedShrinkLevel: 0,
    }),
  }), environment, context);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "fallback");
  assert.equal(result.model, null);
  assert.match(result.mission, /Open/);
  assert.ok(result.rationale.length >= 8);
  assert.ok(result.coachingCue.length >= 8);
});

test("rejects malformed mission requests", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/mission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: "x" }),
  }), environment, context);

  assert.equal(response.status, 400);
});

test("supports a learning task with a safe, shame-free fallback", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/mission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "Start the machine learning homework",
      kind: "learning",
      friction: "fear",
      energy: 2,
      overwhelm: 2,
      shrinkLevel: 0,
      matchingStarts: 0,
      learnedShrinkLevel: 0,
    }),
  }), environment, context);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "fallback");
  assert.match(result.mission, /rough answer fragment/);
});

test("accepts validated Gemini structured output and opts out of interaction storage", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  let outboundBody;
  globalThis.fetch = async (_url, init) => {
    outboundBody = JSON.parse(init.body);
    return Response.json({
      output_text: JSON.stringify({
        mission: "Open the resume and highlight one bullet that matches the role.",
        rationale: "This removes the full application and leaves one visible matching action.",
        coaching_cue: "Stay with the single bullet; the application can wait.",
        intervention: "remove_scope",
      }),
    });
  };

  try {
    const response = await worker.fetch(new Request("http://localhost/api/mission", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
      body: JSON.stringify({
        task: "Apply to an ML internship",
        kind: "career",
        friction: "too_big",
        energy: 2,
        overwhelm: 2,
        shrinkLevel: 0,
        matchingStarts: 1,
        learnedShrinkLevel: 0,
      }),
    }), {
      ...environment,
      GEMINI_API_KEY: "test-only-key",
      STUDY_RATE_LIMIT_SALT: "test-only-rate-limit-salt-with-32-characters",
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async run() {},
            async first() { return { attempt_count: 1 }; },
          };
        },
      },
    }, context);

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.source, "gemini");
    assert.equal(result.model, "gemini-3.6-flash");
    assert.equal(outboundBody.store, false);
    assert.equal(outboundBody.response_format.mime_type, "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
