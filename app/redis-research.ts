export type StudyRecord = {
  id: number;
  participantKey: string;
  relationship: string;
  usefulness: number;
  feltUnderstood: number;
  hardestStep: string;
  wouldReturn: string;
  feedback: string;
  changeRequest: string;
  category: string;
  reviewStatus: string;
  createdAt: string;
};

export type DecisionRecord = {
  id: number;
  responseId: number | null;
  userSaid: string;
  weChanged: string;
  rationale: string;
  status: string;
  createdAt: string;
};

type RedisEnvelope<T> = { result?: T; error?: string };

const KEY = {
  responseNextId: "startnow:study:next-id",
  responseIndex: "startnow:study:response-index",
  responseSummary: "startnow:study:summary",
  decisionNextId: "startnow:research:decision-next-id",
  decisionIndex: "startnow:research:decision-index",
};

function config() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function redisResearchConfigured() {
  return config() !== null;
}

async function command<T>(...args: Array<string | number>) {
  const current = config();
  if (!current) throw new Error("Redis research storage is not configured.");
  const response = await fetch(current.url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${current.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const payload = await response.json() as RedisEnvelope<T>;
  if (!response.ok || payload.error) throw new Error(payload.error || "Redis command failed.");
  return payload.result as T;
}

async function pipeline(commands: Array<Array<string | number>>) {
  const current = config();
  if (!current) throw new Error("Redis research storage is not configured.");
  const response = await fetch(`${current.url}/pipeline`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${current.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const payload = await response.json() as Array<RedisEnvelope<unknown>> | RedisEnvelope<unknown>;
  if (!response.ok || !Array.isArray(payload)) throw new Error("Redis pipeline failed.");
  const failed = payload.find((item) => item.error);
  if (failed?.error) throw new Error(failed.error);
  return payload.map((item) => item.result);
}

function responseKey(id: number | string) {
  return `startnow:study:response:${id}`;
}

function decisionKey(id: number | string) {
  return `startnow:research:decision:${id}`;
}

export async function redisRateLimited(hash: string, limit: number) {
  const script = "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return count";
  const count = Number(await command<number>("EVAL", script, 1, `startnow:study:rate:${hash}`, 3_600));
  return count > limit;
}

export async function redisCreateStudyResponse(input: Omit<StudyRecord, "id" | "category" | "reviewStatus" | "createdAt">) {
  const participantLock = `startnow:study:participant:${input.participantKey}`;
  const accepted = await command<string | null>("SET", participantLock, "1", "NX");
  if (accepted !== "OK") throw new Error("UNIQUE participant_key");

  try {
    const id = Number(await command<number>("INCR", KEY.responseNextId));
    const record: StudyRecord = {
      ...input,
      id,
      category: "unclassified",
      reviewStatus: "new",
      createdAt: new Date().toISOString(),
    };
    await pipeline([
      ["SET", responseKey(id), JSON.stringify(record)],
      ["ZADD", KEY.responseIndex, Date.now(), id],
      ["HINCRBY", KEY.responseSummary, "responses", 1],
      ["HINCRBY", KEY.responseSummary, "usefulness", record.usefulness],
      ["HINCRBY", KEY.responseSummary, "understood", record.feltUnderstood],
      ["HINCRBY", KEY.responseSummary, "returnYes", record.wouldReturn === "yes" ? 1 : 0],
    ]);
    return record;
  } catch (error) {
    await command("DEL", participantLock).catch(() => undefined);
    throw error;
  }
}

export async function redisStudySummary() {
  const values = await command<Array<string | null>>("HMGET", KEY.responseSummary, "responses", "usefulness", "understood", "returnYes");
  const responses = Number(values?.[0] || 0);
  return {
    responses,
    averageUsefulness: responses ? Number(values?.[1] || 0) / responses : 0,
    averageUnderstood: responses ? Number(values?.[2] || 0) / responses : 0,
    wouldReturnYes: Number(values?.[3] || 0),
  };
}

async function recordsFromIndex<T>(index: string, keyFor: (id: string) => string) {
  const ids = await command<string[]>("ZREVRANGE", index, 0, 99);
  if (!ids?.length) return [];
  const values = await pipeline(ids.map((id) => ["GET", keyFor(id)]));
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    try { return [JSON.parse(value) as T]; } catch { return []; }
  });
}

export async function redisListResearch() {
  const [responses, decisions] = await Promise.all([
    recordsFromIndex<StudyRecord>(KEY.responseIndex, responseKey),
    recordsFromIndex<DecisionRecord>(KEY.decisionIndex, decisionKey),
  ]);
  return { responses, decisions };
}

export async function redisUpdateStudyResponse(id: number, category: string, reviewStatus: string) {
  const serialized = await command<string | null>("GET", responseKey(id));
  if (!serialized) throw new Error("Study response was not found.");
  const record = JSON.parse(serialized) as StudyRecord;
  await command("SET", responseKey(id), JSON.stringify({ ...record, category, reviewStatus }));
}

export async function redisCreateDecision(input: Omit<DecisionRecord, "id" | "createdAt">) {
  const id = Number(await command<number>("INCR", KEY.decisionNextId));
  const decision: DecisionRecord = { ...input, id, createdAt: new Date().toISOString() };
  await pipeline([
    ["SET", decisionKey(id), JSON.stringify(decision)],
    ["ZADD", KEY.decisionIndex, Date.now(), id],
  ]);
  if (input.responseId) {
    const serialized = await command<string | null>("GET", responseKey(input.responseId));
    if (serialized) {
      const record = JSON.parse(serialized) as StudyRecord;
      await command("SET", responseKey(input.responseId), JSON.stringify({ ...record, reviewStatus: "actioned" }));
    }
  }
  return decision;
}
