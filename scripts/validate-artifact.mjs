import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, "dist", "server", "index.js");
const hostingPath = path.join(root, "dist", ".openai", "hosting.json");

await access(workerPath);
JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("portable-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must export a default object with fetch(request, env, ctx)");
}

const sourceMigrations = (await readdir(path.join(root, "drizzle"))).filter((name) => name.endsWith(".sql"));
if (sourceMigrations.length) {
  const packagedMigrations = (await readdir(path.join(root, "dist", ".openai", "drizzle"))).filter((name) => name.endsWith(".sql"));
  for (const migration of sourceMigrations) {
    if (!packagedMigrations.includes(migration)) throw new Error(`Missing packaged migration: ${migration}`);
  }
}

console.log("Validated portable Sites artifact and packaged migrations.");
