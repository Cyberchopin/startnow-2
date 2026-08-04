import { and, avg, count, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { studyResponses } from "../../../db/schema";
import { redisCreateStudyResponse, redisRateLimited, redisResearchConfigured, redisStudySummary } from "../../redis-research";

const RELATIONSHIPS = ["neurodivergent", "ally", "educator", "prefer_not"];
const HARDEST_STEPS = ["checkin", "mission", "timer", "proof", "none"];
const RETURN_OPTIONS = ["yes", "maybe", "no"];
const MAX_ATTEMPTS_PER_HOUR = 5;

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function containsLikelyContactInfo(text: string) {
  return /@|https?:\/\/|\b\d{3}[-. )]\d{3}[-. ]\d{4}\b/i.test(text);
}

async function rateLimitKey(request: Request) {
  const connectingIp = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  const salt = globalThis.__START_NOW_RATE_LIMIT_SALT__ ?? process.env.STUDY_RATE_LIMIT_SALT;
  if (!salt || salt.length < 24) throw new Error("Study rate-limit salt is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${connectingIp}:${hour}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(request: Request) {
  const key = await rateLimitKey(request);
  if (redisResearchConfigured()) return redisRateLimited(key, MAX_ATTEMPTS_PER_HOUR);
  const d1 = getD1();
  await d1.prepare(`
    INSERT INTO study_rate_limits (key, attempt_count, created_at)
    VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET attempt_count = attempt_count + 1
  `).bind(key, Date.now()).run();
  const row = await d1.prepare("SELECT attempt_count FROM study_rate_limits WHERE key = ?1")
    .bind(key).first<{ attempt_count: number }>();
  return Number(row?.attempt_count || 0) > MAX_ATTEMPTS_PER_HOUR;
}

export async function GET() {
  try {
    if (redisResearchConfigured()) return Response.json(await redisStudySummary());
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
    if (cleanText(body.website, 200)) return Response.json({ ok: true }, { status: 201 });
    if (body.consent !== true || body.adult !== true) return Response.json({ error: "Adult consent is required." }, { status: 400 });

    const participantKey = cleanText(body.participantKey, 80);
    const relationship = cleanText(body.relationship, 30);
    const hardestStep = cleanText(body.hardestStep, 30);
    const wouldReturn = cleanText(body.wouldReturn, 10);
    const usefulness = Number(body.usefulness);
    const feltUnderstood = Number(body.feltUnderstood);
    const feedback = cleanText(body.feedback, 600);
    const changeRequest = cleanText(body.changeRequest, 600);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(participantKey) || !RELATIONSHIPS.includes(relationship) || !HARDEST_STEPS.includes(hardestStep) || !RETURN_OPTIONS.includes(wouldReturn)) return Response.json({ error: "Please complete every required field." }, { status: 400 });
    if (![1,2,3,4,5].includes(usefulness) || ![1,2,3,4,5].includes(feltUnderstood)) return Response.json({ error: "Ratings must be between 1 and 5." }, { status: 400 });
    if (feedback.length < 12 || changeRequest.length < 12) return Response.json({ error: "Please give at least one concrete sentence for each response." }, { status: 400 });
    if (containsLikelyContactInfo(`${feedback} ${changeRequest}`)) return Response.json({ error: "Please remove names, contact details, and links. This study is anonymous." }, { status: 400 });
    if (await isRateLimited(request)) return Response.json({ error: "Too many submission attempts. Please try again later." }, { status: 429, headers: { "Retry-After": "3600" } });

    if (redisResearchConfigured()) {
      await redisCreateStudyResponse({ participantKey, relationship, usefulness, feltUnderstood, hardestStep, wouldReturn, feedback, changeRequest });
      const summary = await redisStudySummary();
      return Response.json({ ok: true, responses: summary.responses }, { status: 201 });
    }
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
