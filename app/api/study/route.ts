import { and, avg, count, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { studyResponses } from "../../../db/schema";

const RELATIONSHIPS = ["neurodivergent", "ally", "educator", "prefer_not"];
const HARDEST_STEPS = ["checkin", "mission", "timer", "proof", "none"];
const RETURN_OPTIONS = ["yes", "maybe", "no"];

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function containsLikelyContactInfo(text: string) {
  return /@|https?:\/\/|\b\d{3}[-. )]\d{3}[-. ]\d{4}\b/i.test(text);
}

export async function GET() {
  try {
    const db = getDb();
    const [summary] = await db.select({
      responses: count(),
      averageUsefulness: avg(studyResponses.usefulness),
      averageUnderstood: avg(studyResponses.feltUnderstood),
    }).from(studyResponses);
    const [returnYes] = await db.select({ total: count() }).from(studyResponses).where(and(eq(studyResponses.wouldReturn, "yes")));
    return Response.json({
      responses: summary?.responses || 0,
      averageUsefulness: Number(summary?.averageUsefulness || 0),
      averageUnderstood: Number(summary?.averageUnderstood || 0),
      wouldReturnYes: returnYes?.total || 0,
    });
  } catch {
    return Response.json({ responses: 0, averageUsefulness: 0, averageUnderstood: 0, wouldReturnYes: 0 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.consent !== true || body.adult !== true) return Response.json({ error: "Adult consent is required." }, { status: 400 });

    const participantKey = cleanText(body.participantKey, 80);
    const relationship = cleanText(body.relationship, 30);
    const hardestStep = cleanText(body.hardestStep, 30);
    const wouldReturn = cleanText(body.wouldReturn, 10);
    const usefulness = Number(body.usefulness);
    const feltUnderstood = Number(body.feltUnderstood);
    const feedback = cleanText(body.feedback, 600);
    const changeRequest = cleanText(body.changeRequest, 600);

    if (!participantKey || !RELATIONSHIPS.includes(relationship) || !HARDEST_STEPS.includes(hardestStep) || !RETURN_OPTIONS.includes(wouldReturn)) return Response.json({ error: "Please complete every required field." }, { status: 400 });
    if (![1,2,3,4,5].includes(usefulness) || ![1,2,3,4,5].includes(feltUnderstood)) return Response.json({ error: "Ratings must be between 1 and 5." }, { status: 400 });
    if (feedback.length < 12 || changeRequest.length < 12) return Response.json({ error: "Please give at least one concrete sentence for each response." }, { status: 400 });
    if (containsLikelyContactInfo(`${feedback} ${changeRequest}`)) return Response.json({ error: "Please remove names, contact details, and links. This study is anonymous." }, { status: 400 });

    const db = getDb();
    await db.insert(studyResponses).values({ participantKey, relationship, usefulness, feltUnderstood, hardestStep, wouldReturn, feedback, changeRequest });
    const [summary] = await db.select({ responses: count() }).from(studyResponses);
    return Response.json({ ok: true, responses: summary?.responses || 1 }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save feedback.";
    if (message.includes("UNIQUE")) return Response.json({ error: "This device has already submitted one study response." }, { status: 409 });
    return Response.json({ error: "Unable to save feedback right now." }, { status: 500 });
  }
}
