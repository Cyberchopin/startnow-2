import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("redis-study-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const context = { waitUntil() {}, passThroughOnException() {} };
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

test("Vercel study submissions persist through server-only Redis REST", async () => {
  const previous = {
    vercel: process.env.VERCEL,
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    salt: process.env.STUDY_RATE_LIMIT_SALT,
  };
  const originalFetch = globalThis.fetch;
  process.env.VERCEL = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "server-only-token";
  process.env.STUDY_RATE_LIMIT_SALT = "test-only-rate-limit-salt-with-32-characters";
  const commands = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer server-only-token");
    const body = JSON.parse(init.body);
    commands.push(body);
    if (String(url).endsWith("/pipeline")) return Response.json(body.map(() => ({ result: "OK" })));
    if (body[0] === "EVAL") return Response.json({ result: 1 });
    if (body[0] === "SET") return Response.json({ result: "OK" });
    if (body[0] === "INCR") return Response.json({ result: 1 });
    if (body[0] === "HMGET") return Response.json({ result: ["1", "5", "4", "1"] });
    return Response.json({ error: "Unexpected command" }, { status: 400 });
  };

  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/study", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.80" },
      body: JSON.stringify({
        participantKey: "73ed1e8c-d76a-4f52-a7f8-6c47fbb9dc44",
        relationship: "prefer_not",
        usefulness: 5,
        feltUnderstood: 4,
        hardestStep: "mission",
        wouldReturn: "yes",
        feedback: "I opened the application instead of rewriting my plan.",
        changeRequest: "Make the spoken coach feel less synthetic and more human.",
        adult: true,
        consent: true,
      }),
    }), environment, context);

    assert.equal(response.status, 201, await response.clone().text());
    assert.deepEqual(await response.json(), { ok: true, responses: 1 });
    assert.ok(commands.some((command) => command[0] === "EVAL"));
    assert.ok(commands.some((command) => command[0] === "SET"));
    assert.ok(commands.some((command) => Array.isArray(command[0]) && command[0][0] === "SET"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ VERCEL: previous.vercel, UPSTASH_REDIS_REST_URL: previous.url, UPSTASH_REDIS_REST_TOKEN: previous.token, STUDY_RATE_LIMIT_SALT: previous.salt })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
