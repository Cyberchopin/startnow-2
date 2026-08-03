import { getChatGPTUser } from "./chatgpt-auth";

declare global {
  var __START_NOW_OWNER_EMAILS__: string | undefined;
}

function ownerEmails() {
  const configured = globalThis.__START_NOW_OWNER_EMAILS__ ?? process.env.RESEARCH_OWNER_EMAILS ?? "";
  return new Set(configured.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export async function getResearchOwner() {
  const user = await getChatGPTUser();
  if (!user || !ownerEmails().has(user.email.toLowerCase())) return null;
  return user;
}
