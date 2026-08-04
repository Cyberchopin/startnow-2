import { cookies } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";

declare global {
  var __START_NOW_OWNER_EMAILS__: string | undefined;
  var __START_NOW_RATE_LIMIT_SALT__: string | undefined;
}

const SESSION_COOKIE = "start_now_research_session";
const SESSION_SECONDS = 8 * 60 * 60;

export type ResearchOwner = {
  displayName: string;
  email: string;
  fullName: string | null;
  authMode: "chatgpt" | "secret";
};

function ownerEmails() {
  const configured = globalThis.__START_NOW_OWNER_EMAILS__ ?? process.env.RESEARCH_OWNER_EMAILS ?? "";
  return new Set(configured.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export async function getResearchOwner() {
  // ChatGPT identity headers are trustworthy only behind the Sites control plane.
  // On public Vercel deployments a visitor could otherwise forge those headers.
  if (process.env.VERCEL !== "1") {
    const user = await getChatGPTUser();
    if (user && ownerEmails().has(user.email.toLowerCase())) return { ...user, authMode: "chatgpt" } satisfies ResearchOwner;
  }

  const secret = process.env.RESEARCH_OWNER_SECRET;
  if (!secret || secret.length < 20) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1_000) || !signature) return null;
  const expected = await sign(expiresText, secret);
  if (!constantTimeEqual(expected, signature)) return null;
  return { displayName: "Research owner", email: "", fullName: null, authMode: "secret" } satisfies ResearchOwner;
}

export async function ownerSecretMatches(candidate: string) {
  const secret = process.env.RESEARCH_OWNER_SECRET;
  if (!secret || secret.length < 20 || candidate.length < 20) return false;
  const [expected, supplied] = await Promise.all([digest(secret), digest(candidate)]);
  return constantTimeEqual(expected, supplied);
}

export async function createResearchSession() {
  const secret = process.env.RESEARCH_OWNER_SECRET;
  if (!secret || secret.length < 20) throw new Error("Research owner secret is not configured.");
  const expires = Math.floor(Date.now() / 1_000) + SESSION_SECONDS;
  const value = `${expires}.${await sign(String(expires), secret)}`;
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearResearchSession() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
