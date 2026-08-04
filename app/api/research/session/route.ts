import { clearResearchSession, createResearchSession, ownerSecretMatches } from "../../../research-auth";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid sign-in request." }, { status: 400 });
  }
  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!await ownerSecretMatches(secret)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ error: "Owner secret is incorrect." }, { status: 401 });
  }
  await createResearchSession();
  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearResearchSession();
  return Response.json({ ok: true });
}
