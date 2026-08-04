import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("research-auth-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const context = { waitUntil() {}, passThroughOnException() {} };

test("public Vercel mode rejects forged ChatGPT owner headers", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(new Request("http://localhost/api/research", {
      headers: { "oai-authenticated-user-email": "owner@example.com" },
    }), {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      RESEARCH_OWNER_EMAILS: "owner@example.com",
    }, context);
    assert.equal(response.status, 403);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
