export type TaskKind = "project" | "career";
export type Friction = "unclear" | "too_big" | "fear" | "boring" | "tired";
export type Intervention = "clarify_entry" | "remove_scope" | "make_reversible" | "add_urgency" | "reduce_effort";

export type MissionInput = {
  task: string;
  kind: TaskKind;
  friction: Friction;
  energy: number;
  overwhelm: number;
  shrinkLevel: number;
  matchingStarts: number;
  learnedShrinkLevel: number;
};

export type MissionPlan = {
  mission: string;
  rationale: string;
  coachingCue: string;
  intervention: Intervention;
  source: "gemini" | "fallback";
  model: string | null;
};

const INTERVENTIONS: Record<Friction, Intervention> = {
  unclear: "clarify_entry",
  too_big: "remove_scope",
  fear: "make_reversible",
  boring: "add_urgency",
  tired: "reduce_effort",
};

export function normalizeMissionInput(value: unknown): MissionInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const task = typeof input.task === "string" ? input.task.trim().replace(/\s+/g, " ").slice(0, 240) : "";
  const kind = input.kind === "career" || input.kind === "project" ? input.kind : null;
  const friction = typeof input.friction === "string" && input.friction in INTERVENTIONS ? input.friction as Friction : null;
  const energy = Number(input.energy);
  const overwhelm = Number(input.overwhelm);
  const shrinkLevel = Number(input.shrinkLevel);
  const matchingStarts = Number(input.matchingStarts);
  const learnedShrinkLevel = Number(input.learnedShrinkLevel);

  if (task.length < 3 || !kind || !friction) return null;
  if (![1, 2, 3].includes(energy) || ![1, 2, 3].includes(overwhelm)) return null;
  if (![0, 1, 2].includes(shrinkLevel)) return null;

  return {
    task,
    kind,
    friction,
    energy,
    overwhelm,
    shrinkLevel,
    matchingStarts: Number.isFinite(matchingStarts) ? Math.max(0, Math.min(50, Math.round(matchingStarts))) : 0,
    learnedShrinkLevel: Number.isFinite(learnedShrinkLevel) ? Math.max(0, Math.min(2, Math.round(learnedShrinkLevel))) : 0,
  };
}

export function buildFallbackMission(input: MissionInput): MissionPlan {
  const subject = input.task;
  let mission: string;

  if (input.shrinkLevel >= 2) {
    mission = input.kind === "career"
      ? `Open the browser and search for “${subject}”. Stop there.`
      : `Open the folder or file for “${subject}”. Stop there.`;
  } else if (input.shrinkLevel === 1 || input.energy === 1 || input.overwhelm === 3 || input.friction === "tired") {
    mission = input.kind === "career"
      ? `Open “${subject}”. Do not apply yet.`
      : `Open “${subject}”. You do not need to change anything.`;
  } else if (input.friction === "fear") {
    mission = input.kind === "career"
      ? `Open “${subject}” and draft one deliberately imperfect sentence.`
      : `Open “${subject}” and make one reversible, imperfect change.`;
  } else if (input.friction === "unclear") {
    mission = `Open “${subject}” and point to the exact place where you stopped.`;
  } else if (input.friction === "boring") {
    mission = input.kind === "career"
      ? `Open “${subject}” and race the clock to copy one requirement.`
      : `Open “${subject}” and make one visible change before the minute ends.`;
  } else {
    mission = input.kind === "career"
      ? `Open “${subject}” and improve just one matching bullet.`
      : `Open “${subject}” and make one visible change.`;
  }

  const reasons: Record<Friction, string> = {
    unclear: "Your barrier is uncertainty, so this exposes the exact entry point without asking you to plan the whole task.",
    too_big: "Your barrier is scope, so this removes everything except one visible, reversible action.",
    fear: "Your barrier is evaluation fear, so this makes the first change deliberately imperfect and reversible.",
    boring: "Your barrier is low stimulation, so this adds a short race and a visible finish line.",
    tired: "Your energy is limited, so this reduces the mission to the lowest-effort physical start.",
  };

  return {
    mission,
    rationale: reasons[input.friction],
    coachingCue: "Stay with the physical action. You do not need to solve the whole task.",
    intervention: INTERVENTIONS[input.friction],
    source: "fallback",
    model: null,
  };
}

export function isMissionPlan(value: unknown): value is MissionPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return typeof plan.mission === "string" && plan.mission.length >= 8 && plan.mission.length <= 220
    && typeof plan.rationale === "string" && plan.rationale.length >= 8 && plan.rationale.length <= 260
    && typeof plan.coachingCue === "string" && plan.coachingCue.length >= 8 && plan.coachingCue.length <= 180
    && typeof plan.intervention === "string" && Object.values(INTERVENTIONS).includes(plan.intervention as Intervention)
    && (plan.source === "gemini" || plan.source === "fallback")
    && (typeof plan.model === "string" || plan.model === null);
}
