import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { researchDecisions, studyResponses } from "../../../db/schema";
import { getResearchOwner } from "../../research-auth";

const CATEGORIES = ["unclassified", "onboarding", "mission", "timer", "proof", "retention", "accessibility", "other"];
const REVIEW_STATUSES = ["new", "reviewed", "actioned"];
const DECISION_STATUSES = ["planned", "shipped", "rejected"];

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function rejectUnlessOwner() {
  const owner = await getResearchOwner();
  return owner ? null : Response.json({ error: "Owner access required." }, { status: 403 });
}

export async function GET() {
  const denied = await rejectUnlessOwner();
  if (denied) return denied;
  const db = getDb();
  const responses = await db.select().from(studyResponses).orderBy(desc(studyResponses.createdAt), desc(studyResponses.id)).limit(100);
  const decisions = await db.select().from(researchDecisions).orderBy(desc(researchDecisions.createdAt), desc(researchDecisions.id)).limit(100);
  return Response.json({ responses, decisions });
}

export async function PATCH(request: Request) {
  const denied = await rejectUnlessOwner();
  if (denied) return denied;
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  const category = text(body.category, 30);
  const reviewStatus = text(body.reviewStatus, 20);
  if (!Number.isInteger(id) || !CATEGORIES.includes(category) || !REVIEW_STATUSES.includes(reviewStatus)) return Response.json({ error: "Invalid classification." }, { status: 400 });
  const db = getDb();
  await db.update(studyResponses).set({ category, reviewStatus }).where(eq(studyResponses.id, id));
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const denied = await rejectUnlessOwner();
  if (denied) return denied;
  const body = await request.json() as Record<string, unknown>;
  const responseId = body.responseId ? Number(body.responseId) : null;
  const userSaid = text(body.userSaid, 600);
  const weChanged = text(body.weChanged, 600);
  const rationale = text(body.rationale, 600);
  const status = text(body.status, 20);
  if (userSaid.length < 8 || weChanged.length < 8 || rationale.length < 8 || !DECISION_STATUSES.includes(status)) return Response.json({ error: "Complete all decision fields with concrete evidence." }, { status: 400 });
  const db = getDb();
  const [decision] = await db.insert(researchDecisions).values({ responseId, userSaid, weChanged, rationale, status }).returning();
  if (responseId) await db.update(studyResponses).set({ reviewStatus: "actioned" }).where(eq(studyResponses.id, responseId));
  return Response.json({ decision }, { status: 201 });
}
