"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildFallbackMission, isMissionPlan, type Friction, type MissionInput, type MissionPlan, type TaskKind } from "./mission-reasoner";

type Mode = "checkin" | "mission" | "running" | "proof" | "complete";
type View = "today" | "journeys" | "insights" | "study";
type VoicePersona = "Sulafat" | "Achird" | "Achernar";
type VoiceDelivery = "idle" | "loading" | "natural" | "browser";
type StudySummary = {
  responses: number;
  averageUsefulness: number;
  averageUnderstood: number;
  wouldReturnYes: number;
};
type Activation = {
  id: string;
  date: string;
  task: string;
  kind: TaskKind;
  friction: Friction;
  energy: number;
  overwhelmBefore: number;
  overwhelmAfter: number;
  shrinkCount: number;
  secondsToStart: number;
  proof: string;
  resumePoint: string;
};

type Progress = {
  streak: number;
  recoveryStreak: number;
  xp: number;
  todayStarts: number;
  todayDate: string;
  lastActiveDate: string;
  resumePoint: string;
  lastTask: string;
  lastKind: TaskKind;
  lastFriction: Friction;
  history: Activation[];
};

const EMPTY_PROGRESS: Progress = {
  streak: 0,
  recoveryStreak: 0,
  xp: 0,
  todayStarts: 0,
  todayDate: "",
  lastActiveDate: "",
  resumePoint: "",
  lastTask: "",
  lastKind: "project",
  lastFriction: "too_big",
  history: [],
};

const FRICTIONS: { id: Friction; label: string; action: string }[] = [
  { id: "unclear", label: "I don't know where to begin", action: "clarify the entry point" },
  { id: "too_big", label: "It feels too big", action: "remove scope" },
  { id: "fear", label: "I'm afraid I'll do it badly", action: "make it reversible" },
  { id: "boring", label: "It feels painfully boring", action: "add urgency" },
  { id: "tired", label: "I have almost no energy", action: "reduce effort" },
];

const ACTION_WORDS = /(?:\b(opened|wrote|copied|edited|created|found|submitted|searched|added|changed|started|drafted|highlighted|reviewed|typed|ran|tested|fixed|named|chose|made)\b|打开|写了|复制|修改|创建|找到|提交|搜索|添加|开始|完成)/i;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dayDifference(from: string, to: string) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function readProgress(): Progress {
  if (typeof window === "undefined") return EMPTY_PROGRESS;
  try {
    const saved = { ...EMPTY_PROGRESS, ...JSON.parse(localStorage.getItem("start-now-progress") || "{}") } as Progress;
    if (!Array.isArray(saved.history)) saved.history = [];
    if (saved.todayDate !== todayKey()) saved.todayStarts = 0;
    return saved;
  } catch {
    return EMPTY_PROGRESS;
  }
}

function frictionLabel(id: Friction) {
  return FRICTIONS.find((item) => item.id === id)?.label || "Unknown barrier";
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [mode, setMode] = useState<Mode>("checkin");
  const [energy, setEnergy] = useState(2);
  const [overwhelm, setOverwhelm] = useState(2);
  const [afterLoad, setAfterLoad] = useState(2);
  const [kind, setKind] = useState<TaskKind>("project");
  const [friction, setFriction] = useState<Friction>("too_big");
  const [task, setTask] = useState("");
  const [microLevel, setMicroLevel] = useState(0);
  const [proof, setProof] = useState("");
  const [nextEntry, setNextEntry] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [voice, setVoice] = useState(true);
  const [voicePersona, setVoicePersona] = useState<VoicePersona>("Sulafat");
  const [voiceDelivery, setVoiceDelivery] = useState<VoiceDelivery>("idle");
  const [missionPlan, setMissionPlan] = useState<MissionPlan | null>(null);
  const [missionStatus, setMissionStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [recoveredDays, setRecoveredDays] = useState(0);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [hydrated, setHydrated] = useState(false);
  const [studyRelationship, setStudyRelationship] = useState("prefer_not");
  const [studyUsefulness, setStudyUsefulness] = useState(0);
  const [studyUnderstood, setStudyUnderstood] = useState(0);
  const [studyHardest, setStudyHardest] = useState("none");
  const [studyReturn, setStudyReturn] = useState("");
  const [studyFeedback, setStudyFeedback] = useState("");
  const [studyChange, setStudyChange] = useState("");
  const [studyWebsite, setStudyWebsite] = useState("");
  const [studyAdult, setStudyAdult] = useState(false);
  const [studyConsent, setStudyConsent] = useState(false);
  const [studyStatus, setStudyStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [studyError, setStudyError] = useState("");
  const [studySummary, setStudySummary] = useState<StudySummary>({ responses: 0, averageUsefulness: 0, averageUnderstood: 0, wouldReturnYes: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const midPromptRef = useRef(false);
  const missionRequestRef = useRef(0);
  const missionAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopVoice = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const browserSpeak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((item) => /Natural|Neural|Online/i.test(item.name) && item.lang.startsWith("en"))
      ?? voices.find((item) => item.lang.startsWith("en"))
      ?? null;
    utterance.rate = 0.88;
    utterance.pitch = 0.96;
    window.speechSynthesis.speak(utterance);
    setVoiceDelivery("browser");
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!voice || typeof window === "undefined") return;
    stopVoice();
    setVoiceDelivery("loading");
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voicePersona }),
      });
      if (!response.ok) throw new Error("Natural voice unavailable");
      const url = URL.createObjectURL(await response.blob());
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        if (audioUrlRef.current === url) URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
        if (audioRef.current === audio) audioRef.current = null;
      }, { once: true });
      await audio.play();
      setVoiceDelivery("natural");
    } catch {
      browserSpeak(text);
    }
  }, [browserSpeak, stopVoice, voice, voicePersona]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setProgress(readProgress());
      setHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => stopVoice(), [stopVoice]);

  useEffect(() => {
    if (hydrated) localStorage.setItem("start-now-progress", JSON.stringify(progress));
  }, [progress, hydrated]);

  useEffect(() => {
    if (view !== "study") return;
    fetch("/api/study").then((response) => response.json() as Promise<StudySummary>).then((data) => setStudySummary(data)).catch(() => undefined);
  }, [view]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((value) => {
        if (value === 36 && !midPromptRef.current) {
          midPromptRef.current = true;
          void speak(missionPlan?.coachingCue || "Stay with the physical action. You do not need to solve the whole task.");
        }
        if (value <= 1) {
          setRunning(false);
          setMode("proof");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, speak, missionPlan?.coachingCue]);

  const level = Math.floor(progress.xp / 100) + 1;
  const levelProgress = progress.xp % 100;
  const proofWords = proof.trim().split(/\s+/).filter(Boolean).length;
  const proofIsSpecific = proofWords >= 2 && ACTION_WORDS.test(proof.trim());
  const averageIgnition = progress.history.length
    ? Math.round(progress.history.reduce((sum, item) => sum + item.secondsToStart, 0) / progress.history.length)
    : null;
  const topFriction = useMemo(() => {
    if (!progress.history.length) return null;
    const counts = progress.history.reduce<Record<string, number>>((all, item) => {
      all[item.friction] = (all[item.friction] || 0) + 1;
      return all;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Friction;
  }, [progress.history]);
  const similarStarts = useMemo(
    () => progress.history.filter((item) => item.kind === kind && item.friction === friction),
    [progress.history, kind, friction],
  );
  const learnedShrinkLevel = similarStarts.length >= 2
    ? Math.min(2, Math.round(similarStarts.reduce((sum, item) => sum + item.shrinkCount, 0) / similarStarts.length))
    : 0;
  const reliefRate = progress.history.length
    ? Math.round((progress.history.filter((item) => item.overwhelmAfter < item.overwhelmBefore).length / progress.history.length) * 100)
    : null;
  const averageShrinks = progress.history.length
    ? (progress.history.reduce((sum, item) => sum + item.shrinkCount, 0) / progress.history.length).toFixed(1)
    : null;
  const journeys = useMemo(() => {
    const grouped = new Map<string, Activation[]>();
    progress.history.forEach((item) => {
      const key = item.task.trim().toLowerCase();
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    return [...grouped.values()].map((items) => {
      const latest = items[0];
      const average = Math.round(items.reduce((sum, item) => sum + item.secondsToStart, 0) / items.length);
      const barrierCounts = items.reduce<Record<string, number>>((all, item) => {
        all[item.friction] = (all[item.friction] || 0) + 1;
        return all;
      }, {});
      const commonBarrier = Object.entries(barrierCounts).sort((a, b) => b[1] - a[1])[0][0] as Friction;
      return { name: latest.task, kind: latest.kind, starts: items.length, average, commonBarrier, latest };
    });
  }, [progress.history]);

  const fallbackPlan = useMemo(() => buildFallbackMission({
    task: task.trim() || (kind === "career" ? "one saved job listing" : kind === "learning" ? "one school assignment" : "your project"),
    kind,
    friction,
    energy,
    overwhelm,
    shrinkLevel: microLevel,
    matchingStarts: similarStarts.length,
    learnedShrinkLevel,
  }), [task, kind, friction, energy, overwhelm, microLevel, similarStarts.length, learnedShrinkLevel]);
  const activeMissionPlan = missionPlan || fallbackPlan;
  const mission = activeMissionPlan.mission;

  async function generateMission(input: MissionInput) {
    const requestId = missionRequestRef.current + 1;
    missionRequestRef.current = requestId;
    missionAbortRef.current?.abort();
    const controller = new AbortController();
    missionAbortRef.current = controller;
    setMissionPlan(buildFallbackMission(input));
    setMissionStatus("loading");

    try {
      const response = await fetch("/api/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const result = await response.json() as unknown;
      if (requestId === missionRequestRef.current && response.ok && isMissionPlan(result)) setMissionPlan(result);
    } catch {
      // The deterministic mission already shown is the intentional safe fallback.
    } finally {
      if (requestId === missionRequestRef.current) setMissionStatus("ready");
    }
  }

  function prepareMission() {
    if (task.trim().length < 3) return;
    setMode("mission");
    setSeconds(60);
    setMicroLevel(learnedShrinkLevel);
    setProof("");
    setNextEntry("");
    setAfterLoad(overwhelm);
    void generateMission({
      task: task.trim(), kind, friction, energy, overwhelm,
      shrinkLevel: learnedShrinkLevel,
      matchingStarts: similarStarts.length,
      learnedShrinkLevel,
    });
  }

  function startMission() {
    midPromptRef.current = false;
    setMode("running");
    setRunning(true);
    void speak(`Your only mission is: ${mission} ${activeMissionPlan.coachingCue}`);
  }

  function shrinkMission() {
    const nextLevel = Math.min(2, microLevel + 1);
    setMicroLevel(nextLevel);
    setSeconds(60);
    setMode("mission");
    setRunning(false);
    void speak("That step was still too large. We made it smaller. No judgment.");
    void generateMission({
      task: task.trim(), kind, friction, energy, overwhelm,
      shrinkLevel: nextLevel,
      matchingStarts: similarStarts.length,
      learnedShrinkLevel,
    });
  }

  function finish() {
    const date = todayKey();
    const gap = dayDifference(progress.lastActiveDate, date);
    const sameDay = progress.lastActiveDate === date;
    const taskName = task.trim();
    const savedResume = nextEntry.trim() || `Return to ${taskName} and continue from the first visible change.`;
    const activation: Activation = {
      id: `${Date.now()}`,
      date,
      task: taskName,
      kind,
      friction,
      energy,
      overwhelmBefore: overwhelm,
      overwhelmAfter: afterLoad,
      shrinkCount: microLevel,
      secondsToStart: Math.max(1, 60 - seconds),
      proof: proof.trim(),
      resumePoint: savedResume,
    };

    setProgress((current) => ({
      ...current,
      xp: current.xp + 25,
      streak: sameDay ? current.streak : gap === 1 ? current.streak + 1 : 1,
      recoveryStreak: !sameDay && gap > 1 && current.lastActiveDate ? current.recoveryStreak + 1 : current.recoveryStreak,
      todayStarts: current.todayDate === date ? current.todayStarts + 1 : 1,
      todayDate: date,
      lastActiveDate: date,
      resumePoint: savedResume,
      lastTask: taskName,
      lastKind: kind,
      lastFriction: friction,
      history: [activation, ...current.history].slice(0, 50),
    }));
    setRecoveredDays(!sameDay && gap > 1 && progress.lastActiveDate ? gap - 1 : 0);
    setMode("complete");
  }

  function resetToToday() {
    window.speechSynthesis?.cancel();
    missionAbortRef.current?.abort();
    setRunning(false);
    setMode("checkin");
    setView("today");
    setTask("");
    setProof("");
    setNextEntry("");
    setSeconds(60);
    setMicroLevel(0);
    setMissionPlan(null);
    setMissionStatus("idle");
    setRecoveredDays(0);
  }

  function resumeLast() {
    setTask(progress.lastTask);
    setKind(progress.lastKind);
    setFriction(progress.lastFriction);
    setNextEntry(progress.resumePoint);
    setMode("mission");
    setView("today");
    setSeconds(60);
    const matching = progress.history.filter((item) => item.kind === progress.lastKind && item.friction === progress.lastFriction);
    const learned = matching.length >= 2 ? Math.min(2, Math.round(matching.reduce((sum, item) => sum + item.shrinkCount, 0) / matching.length)) : 0;
    setMicroLevel(learned);
    void generateMission({ task: progress.lastTask, kind: progress.lastKind, friction: progress.lastFriction, energy, overwhelm, shrinkLevel: learned, matchingStarts: matching.length, learnedShrinkLevel: learned });
  }

  function resumeJourney(activation: Activation) {
    setTask(activation.task);
    setKind(activation.kind);
    setFriction(activation.friction);
    setNextEntry(activation.resumePoint);
    setEnergy(activation.energy);
    setOverwhelm(activation.overwhelmAfter);
    const matching = progress.history.filter((item) => item.kind === activation.kind && item.friction === activation.friction);
    const learned = matching.length >= 2 ? Math.min(2, Math.round(matching.reduce((sum, item) => sum + item.shrinkCount, 0) / matching.length)) : 0;
    setMicroLevel(learned);
    setSeconds(60);
    setView("today");
    setMode("mission");
    void generateMission({ task: activation.task, kind: activation.kind, friction: activation.friction, energy: activation.energy, overwhelm: activation.overwhelmAfter, shrinkLevel: learned, matchingStarts: matching.length, learnedShrinkLevel: learned });
  }

  async function submitStudy() {
    setStudyStatus("sending");
    setStudyError("");
    let participantKey = localStorage.getItem("start-now-study-key");
    if (!participantKey) {
      participantKey = crypto.randomUUID();
      localStorage.setItem("start-now-study-key", participantKey);
    }
    try {
      const response = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantKey,
          relationship: studyRelationship,
          usefulness: studyUsefulness,
          feltUnderstood: studyUnderstood,
          hardestStep: studyHardest,
          wouldReturn: studyReturn,
          feedback: studyFeedback,
          changeRequest: studyChange,
          adult: studyAdult,
          consent: studyConsent,
          website: studyWebsite,
        }),
      });
      const result = await response.json() as { error?: string; responses?: number };
      if (!response.ok) throw new Error(result.error || "Unable to submit feedback.");
      setStudySummary((current) => ({ ...current, responses: result.responses || current.responses + 1 }));
      setStudyStatus("sent");
    } catch (error) {
      setStudyError(error instanceof Error ? error.message : "Unable to submit feedback.");
      setStudyStatus("error");
    }
  }

  const studyReady = studyAdult && studyConsent && studyUsefulness > 0 && studyUnderstood > 0 && studyReturn && studyFeedback.trim().length >= 12 && studyChange.trim().length >= 12;

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main>
      <div className="aurora aurora-one" /><div className="aurora aurora-two" />
      <header className="topbar">
        <button className="brand" onClick={resetToToday} aria-label="Start Now home"><span className="brand-mark">S</span><span>START NOW</span></button>
        <nav className="workspace-nav" aria-label="Product sections">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>Today</button>
          <button className={view === "journeys" ? "active" : ""} onClick={() => setView("journeys")}>Journeys <span>{journeys.length}</span></button>
          <button className={view === "insights" ? "active" : ""} onClick={() => setView("insights")}>Insights</button>
          <button className={view === "study" ? "active" : ""} onClick={() => setView("study")}>User Study</button>
        </nav>
        <div className="stats" aria-label="Your actual progress">
          <div className="stat"><span className="stat-icon fire">◆</span><span><b>{progress.streak}</b><small>real-day streak</small></span></div>
          <div className="stat"><span className="stat-icon bolt">ϟ</span><span><b>{progress.xp} XP</b><small>level {level}</small></span></div>
          <span className="privacy-mark">PRIVATE · THIS DEVICE</span>
        </div>
      </header>

      <div className="shell">
        <aside className="side-panel">
          <div><p className="eyebrow">TODAY&apos;S STANDARD</p><h2>One honest start.</h2><p className="muted">No fake productivity. A streak moves only after a specific action.</p></div>
          <div className="quest-card">
            <div className="quest-top"><span>Daily ignition</span><b>{progress.todayStarts}/1</b></div>
            <div className="progress"><i style={{ width: `${Math.min(100, progress.todayStarts * 100)}%` }} /></div>
            <p>Start one thing you&apos;ve been avoiding</p><strong>+25 XP</strong>
          </div>
          {progress.resumePoint && <button className="resume-card" onClick={resumeLast}><span>RESUME — DON&apos;T REPLAN</span><b>{progress.lastTask}</b><p>{progress.resumePoint}</p><small>Continue from the saved edge →</small></button>}
          <div className="pattern-card">
            <span>FRICTION FINGERPRINT</span>
            {topFriction ? <><b>{frictionLabel(topFriction)}</b><p>Most common barrier across {progress.history.length} honest start{progress.history.length === 1 ? "" : "s"}.</p></> : <><b>Learning starts at #1</b><p>Complete one honest start to begin discovering your pattern.</p></>}
            <div><small>AVG. IGNITION</small><strong>{averageIgnition === null ? "—" : `${averageIgnition}s`}</strong><small>RECOVERIES</small><strong>{progress.recoveryStreak}</strong></div>
          </div>
          <div className="level-card"><div><span>Level {level}</span><span>{levelProgress}/100 XP</span></div><div className="progress"><i style={{ width: `${levelProgress}%` }} /></div></div>
        </aside>

        <section className="stage" aria-live="polite">
          {view === "journeys" && <div className="card workspace-card">
            <div className="workspace-heading"><div><p className="eyebrow accent">LONG-TERM WORK, WITHOUT THE RESTART COST</p><h1>Your journeys</h1><p className="lead">Every honest start becomes a saved edge. Return to the edge instead of rebuilding the plan.</p></div><button className="new-journey" onClick={resetToToday}>+ NEW JOURNEY</button></div>
            {journeys.length === 0 ? <div className="empty-state"><span>⌁</span><h2>No journey exists yet.</h2><p>Your first honest start will create one automatically.</p><button className="primary" onClick={resetToToday}>CREATE THE FIRST START <span>→</span></button></div> : <div className="journey-list">{journeys.map((journey) => <article className="journey-item" key={journey.name.toLowerCase()}>
              <div className={`journey-icon ${journey.kind}`}>{journey.kind === "career" ? "↗" : journey.kind === "learning" ? "◇" : "⌁"}</div>
              <div className="journey-main"><span>{journey.kind === "career" ? "CAREER" : journey.kind === "learning" ? "LEARNING" : "PERSONAL PROJECT"}</span><h2>{journey.name}</h2><p>{journey.latest.resumePoint}</p><div><small>{journey.starts} honest start{journey.starts === 1 ? "" : "s"}</small><small>{journey.average}s avg. ignition</small><small>Top barrier: {frictionLabel(journey.commonBarrier)}</small></div></div>
              <button className="journey-resume" onClick={() => resumeJourney(journey.latest)}>RESUME<br/><span>WITHOUT REPLANNING →</span></button>
            </article>)}</div>}
          </div>}

          {view === "insights" && <div className="card workspace-card insights-card">
            <div className="workspace-heading"><div><p className="eyebrow accent">BEHAVIOR, NOT VIBES</p><h1>Activation evidence</h1><p className="lead">Only completed honest starts appear here. These metrics describe behavior; they do not diagnose you.</p></div></div>
            <div className="insight-grid"><div><span>HONEST STARTS</span><b>{progress.history.length}</b><small>maximum 50 stored locally</small></div><div><span>AVG. IGNITION</span><b>{averageIgnition === null ? "—" : `${averageIgnition}s`}</b><small>intent → physical action</small></div><div><span>FELT LIGHTER</span><b>{reliefRate === null ? "—" : `${reliefRate}%`}</b><small>self-reported after starting</small></div><div><span>AVG. SHRINKS</span><b>{averageShrinks ?? "—"}</b><small>scope reductions per start</small></div></div>
            <div className="learning-note"><span>{progress.history.length >= 2 ? "LEARNING ACTIVE" : "LEARNING LOCKED"}</span><p>{progress.history.length >= 2 ? "Start Now now reuses the shrink level that worked for matching task and barrier types. It remains explainable and local." : "Complete two starts with the same task type and barrier to unlock history-based intervention sizing."}</p></div>
            <div className="history-head"><h2>Activation history</h2><span>{progress.history.length} records</span></div>
            {progress.history.length === 0 ? <div className="empty-history">No evidence yet. Complete one honest start first.</div> : <div className="history-list">{progress.history.map((item) => <article key={item.id}><div className="history-date"><b>{item.date.slice(5)}</b><span>{item.kind}</span></div><div className="history-action"><b>{item.task}</b><p>{item.proof}</p><small>{frictionLabel(item.friction)} · shrunk {item.shrinkCount}×</small></div><div className="history-result"><b>{item.secondsToStart}s</b><span>{item.overwhelmAfter < item.overwhelmBefore ? "felt lighter" : item.overwhelmAfter > item.overwhelmBefore ? "felt heavier" : "felt the same"}</span></div></article>)}</div>}
          </div>}

          {view === "study" && <div className="card workspace-card study-card">
            <div className="workspace-heading"><div><p className="eyebrow accent">DESIGNED WITH USERS, NOT FOR AN IMAGINARY USER</p><h1>3-minute product study</h1><p className="lead">First complete one real Start Now cycle. Then tell us exactly where the product helped or failed.</p></div><div className="study-count"><b>{studySummary.responses}</b><span>ANONYMOUS RESPONSES</span></div></div>
            {studyStatus === "sent" ? <div className="study-success"><span>✓</span><h2>Your evidence is in.</h2><p>Thank you. Your response can now influence the next product decision. No identity or contact information was collected.</p><button className="primary" onClick={resetToToday}>RETURN TO START NOW <span>→</span></button></div> : <>
              <div className="study-guardrail"><b>RESEARCH GUARDRAILS</b><p>18+ only · voluntary · anonymous · no names, emails, schools, links, or diagnosis details · one response per device · stop at any time</p></div>
              <div className="study-form">
                <label className="study-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={studyWebsite} onChange={(event) => setStudyWebsite(event.target.value)} /></label>
                <fieldset><legend>1. YOUR RELATIONSHIP TO THIS PROBLEM</legend><div className="study-options">{[["neurodivergent","I identify as neurodivergent"],["ally","Friend / family / ally"],["educator","Educator / mentor"],["prefer_not","Prefer not to say"]].map(([value,label]) => <button key={value} className={studyRelationship === value ? "active" : ""} onClick={() => setStudyRelationship(value)} aria-pressed={studyRelationship === value}>{label}</button>)}</div></fieldset>
                <fieldset><legend>2. AFTER USING THE FULL FLOW</legend><div className="rating-row"><div><span>How useful was it for starting?</span><div>{[1,2,3,4,5].map((n) => <button key={n} className={studyUsefulness === n ? "active" : ""} onClick={() => setStudyUsefulness(n)} aria-label={`Usefulness ${n} of 5`}>{n}</button>)}</div><small>1 = not useful · 5 = immediately useful</small></div><div><span>Did the intervention feel understood?</span><div>{[1,2,3,4,5].map((n) => <button key={n} className={studyUnderstood === n ? "active" : ""} onClick={() => setStudyUnderstood(n)} aria-label={`Understood ${n} of 5`}>{n}</button>)}</div><small>1 = generic · 5 = matched my state</small></div></div></fieldset>
                <fieldset><legend>3. WHERE DID THE PRODUCT CREATE FRICTION?</legend><div className="study-options compact">{[["checkin","Check-in"],["mission","Suggested move"],["timer","60-second room"],["proof","Proof of start"],["none","No major friction"]].map(([value,label]) => <button key={value} className={studyHardest === value ? "active" : ""} onClick={() => setStudyHardest(value)} aria-pressed={studyHardest === value}>{label}</button>)}</div></fieldset>
                <fieldset><legend>4. WOULD YOU RETURN TOMORROW WITHOUT BEING PAID?</legend><div className="study-options compact">{[["yes","Yes"],["maybe","Maybe"],["no","No"]].map(([value,label]) => <button key={value} className={studyReturn === value ? "active" : ""} onClick={() => setStudyReturn(value)} aria-pressed={studyReturn === value}>{label}</button>)}</div></fieldset>
                <fieldset><legend>5. CONCRETE EVIDENCE</legend><label className="study-text"><span>What changed in your behavior, if anything?</span><textarea value={studyFeedback} onChange={(event) => setStudyFeedback(event.target.value)} placeholder="e.g. I stopped rewriting my plan and opened the application after the second shrink." /></label><label className="study-text"><span>What is the single most important change we should make?</span><textarea value={studyChange} onChange={(event) => setStudyChange(event.target.value)} placeholder="Be direct. A negative answer is more useful than praise." /></label></fieldset>
                <div className="consent-box"><label><input type="checkbox" checked={studyAdult} onChange={(event) => setStudyAdult(event.target.checked)} /><span>I confirm I am 18 or older.</span></label><label><input type="checkbox" checked={studyConsent} onChange={(event) => setStudyConsent(event.target.checked)} /><span>I voluntarily consent to this anonymous product-research response being stored and analyzed.</span></label></div>
                {studyStatus === "error" && <div className="study-error">{studyError}</div>}
                <button className="primary" disabled={!studyReady || studyStatus === "sending"} onClick={submitStudy}>{studyStatus === "sending" ? "SAVING ANONYMOUS RESPONSE…" : "SUBMIT ONE HONEST RESPONSE"}<span>→</span></button>
              </div>
            </>}
          </div>}

          {view === "today" && mode === "checkin" && <div className="card checkin-card">
            <div className="step-count">01 <span>/ 03</span></div><p className="eyebrow accent">CHECK IN, THEN ACT</p><h1>What is blocking the start?</h1><p className="lead">Ten seconds of context. Then the interface stops asking questions.</p>
            <div className="scale-group"><div className="scale-title"><label>ENERGY</label><span>{["Drained", "Low", "Ready"][energy - 1]}</span></div><div className="segmented">{[1,2,3].map((n) => <button key={n} className={energy === n ? "selected" : ""} onClick={() => setEnergy(n)} aria-pressed={energy === n}><i />{["Drained", "Low", "Ready"][n-1]}</button>)}</div></div>
            <div className="scale-group"><div className="scale-title"><label>OVERWHELM</label><span>{["Clear", "Buzzing", "Flooded"][overwhelm - 1]}</span></div><div className="segmented">{[1,2,3].map((n) => <button key={n} className={overwhelm === n ? "selected warm" : ""} onClick={() => setOverwhelm(n)} aria-pressed={overwhelm === n}><i />{["Clear", "Buzzing", "Flooded"][n-1]}</button>)}</div></div>
            <div className="kind-row"><button className={kind === "project" ? "kind active" : "kind"} onClick={() => setKind("project")} aria-pressed={kind === "project"}><span>⌁</span><b>Personal project</b><small>Build what matters</small></button><button className={kind === "career" ? "kind active" : "kind"} onClick={() => setKind("career")} aria-pressed={kind === "career"}><span>↗</span><b>Job application</b><small>Move your future</small></button><button className={kind === "learning" ? "kind active" : "kind"} onClick={() => setKind("learning")} aria-pressed={kind === "learning"}><span>◇</span><b>School assignment</b><small>Begin without shame</small></button></div>
            <div className="friction-group"><label>SELECT THE MAIN BARRIER</label><div className="friction-options">{FRICTIONS.map((item) => <button key={item.id} className={friction === item.id ? "active" : ""} onClick={() => setFriction(item.id)} aria-pressed={friction === item.id}><span>{friction === item.id ? "✓" : "+"}</span>{item.label}</button>)}</div></div>
            <label className="task-input"><span>THE REAL THING YOU ARE AVOIDING</span><input value={task} onChange={(event) => setTask(event.target.value)} placeholder={kind === "project" ? "e.g. Build the working hackathon demo" : kind === "learning" ? "e.g. Start the machine learning homework" : "e.g. Apply to the ML internship"} onKeyDown={(event) => event.key === "Enter" && prepareMission()} /></label>
            <p className="ai-privacy">When Gemini is enabled, only this task text and your check-in state are sent for stateless reasoning. Start Now stores no model transcript.</p>
            <button className="primary" disabled={task.trim().length < 3} onClick={prepareMission}>GIVE ME ONE EXECUTABLE MOVE <span>→</span></button>
          </div>}

          {view === "today" && mode === "mission" && <div className="card mission-card">
            <div className="step-count">02 <span>/ 03</span></div><p className="eyebrow accent">ONE MOVE, NO PLAN</p><h1>Small enough to start.<br/>Concrete enough to count.</h1>
            <div className="mission-box"><div className="mission-label"><span>60-SECOND MISSION</span><b className={`source-badge ${activeMissionPlan.source}`}>{missionStatus === "loading" ? "REASONING…" : activeMissionPlan.source === "gemini" ? "GEMINI 3.6" : "SAFE FALLBACK"}</b></div><p>{mission}</p><small>Do only the physical action. Finishing is outside this contract.</small></div>
            <div className="friction-readout"><span>You selected</span><b>{frictionLabel(friction)}</b><small>Response: {FRICTIONS.find((item) => item.id === friction)?.action}</small></div>
            <div className="coach-toggle"><div className="coach-avatar">◖</div><div><b>Natural Voice Body Double</b><p>{voiceDelivery === "loading" ? "Preparing a human voice…" : voiceDelivery === "browser" ? "Browser voice fallback active" : "Gemini TTS · browser fallback"}</p></div><button className={voice ? "toggle on" : "toggle"} onClick={() => { if (voice) stopVoice(); setVoice(!voice); }} aria-label="Toggle voice" aria-pressed={voice}><i /></button></div>
            {voice && <div className="voice-personas" aria-label="Body Double voice"><button className={voicePersona === "Sulafat" ? "active" : ""} onClick={() => setVoicePersona("Sulafat")}><b>WARM</b><span>steady support</span></button><button className={voicePersona === "Achird" ? "active" : ""} onClick={() => setVoicePersona("Achird")}><b>FRIENDLY</b><span>gentle presence</span></button><button className={voicePersona === "Achernar" ? "active" : ""} onClick={() => setVoicePersona("Achernar")}><b>SOFT</b><span>low stimulation</span></button></div>}
            <div className="reasoning-note"><span>WHY THIS MOVE</span><p>{missionStatus === "loading" ? "Matching the action to your capacity, barrier, and successful starting pattern…" : activeMissionPlan.rationale}</p><small>{similarStarts.length >= 2 ? `Also sized from ${similarStarts.length} matching honest starts.` : "History sizing unlocks after two matching honest starts."}</small></div>
            <button className="primary pulse" disabled={missionStatus === "loading"} onClick={startMission}>{missionStatus === "loading" ? "ADAPTING THE NEXT MOVE…" : "START THE PHYSICAL ACTION"} <span>→</span></button><button className="secondary compact" disabled={missionStatus === "loading"} onClick={shrinkMission}>STILL TOO BIG — REMOVE ANOTHER STEP</button><button className="text-button" onClick={() => setMode("checkin")}>← Correct my inputs</button>
          </div>}

          {view === "today" && mode === "running" && <div className="card timer-card"><p className="eyebrow accent">HANDS FIRST. PLANNING LATER.</p><div className="timer-ring" style={{"--progress": `${(seconds / 60) * 360}deg`} as React.CSSProperties}><div><span>{time}</span><small>UNTIL THE CHECK-IN</small></div></div><h2>{mission}</h2><div className="coach-speaking"><span className="sound-bars"><i/><i/><i/><i/></span><p>No need to finish. Create one visible trace.</p></div><div className="timer-actions"><button onClick={() => setRunning(!running)}>{running ? "PAUSE" : "RESUME"}</button><button onClick={() => { setRunning(false); setMode("proof"); }}>I TOOK THE ACTION ✓</button></div><button className="stuck-button" onClick={shrinkMission}>Still frozen — remove another step</button></div>}

          {view === "today" && mode === "proof" && <div className="card proof-card">
            <div className="step-count">03 <span>/ 03</span></div><p className="eyebrow accent">HONEST START CHECK</p><h1>Name the action—not the intention.</h1><p className="lead">This is a specificity check, not surveillance. “I tried” will not pass; “I opened the resume” will.</p>
            <label className="proof-input"><span>WHAT DID YOUR HANDS ACTUALLY DO?</span><textarea value={proof} onChange={(event) => setProof(event.target.value)} placeholder="e.g. I opened the application and copied the first required skill into my notes." autoFocus /></label>
            <div className="outcome-scale"><span>HOW HEAVY DOES IT FEEL NOW?</span>{[1,2,3].map((n) => <button key={n} className={afterLoad === n ? "active" : ""} onClick={() => setAfterLoad(n)} aria-pressed={afterLoad === n}>{["Lighter", "Same", "Heavier"][n-1]}</button>)}</div>
            <label className="proof-input next"><span>SAVE TOMORROW&apos;S EXACT RE-ENTRY POINT</span><input value={nextEntry} onChange={(event) => setNextEntry(event.target.value)} placeholder="e.g. Continue with the first resume bullet" /></label>
            <div className="proof-status"><i className={proofIsSpecific ? "verified" : ""} />{proofIsSpecific ? "Specific action detected — this start counts" : "Use a concrete action: opened, wrote, copied, edited, tested…"}</div>
            <button className="primary" disabled={!proofIsSpecific} onClick={finish}>COUNT THIS HONEST START <span>→</span></button><button className="secondary compact" onClick={shrinkMission}>I DIDN&apos;T ACTUALLY START — INTERVENE AGAIN</button>
          </div>}

          {view === "today" && mode === "complete" && <div className="card complete-card"><div className="burst">✦</div><p className="eyebrow accent">EVIDENCE, NOT INTENTION</p><h1>You created a real starting point.</h1><p className="lead">Your barrier, intervention and time-to-action are now part of your friction fingerprint.</p>{recoveredDays > 0 && <div className="recovery-win"><span>RECOVERY COUNTS</span><b>You came back. That is progress.</b><p>After {recoveredDays} missed day{recoveredDays === 1 ? "" : "s"}, returning matters more than protecting a perfect streak.</p></div>}<div className="reward-row"><div><span>+25</span><small>XP EARNED</small></div><div><span>{progress.streak}</span><small>REAL-DAY STREAK</small></div><div><span>{Math.max(1, 60 - seconds)}s</span><small>TIME TO ACTION</small></div></div><div className="saved-entry"><span>NEXT RESUME POINT</span><p>{progress.resumePoint}</p></div><button className="primary" onClick={() => setView("journeys")}>SEE THE UPDATED JOURNEY <span>→</span></button><button className="secondary" onClick={resetToToday}>START SOMETHING ELSE</button></div>}
        </section>
      </div>
      <footer><span>START NOW · A SHIYUE WANG PROJECT</span><span>Local-first prototype · no diagnosis · no invented social proof</span></footer>
    </main>
  );
}
