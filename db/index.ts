import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

declare global {
  // The Worker entry installs the stable D1 binding before routing a request.
  // This avoids importing the Cloudflare-only module in Node-based artifact validation.
  var __START_NOW_DB__: D1Database | undefined;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getD1() {
  if (!globalThis.__START_NOW_DB__) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  return globalThis.__START_NOW_DB__;
}
