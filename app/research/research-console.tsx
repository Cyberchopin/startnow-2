"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type StudyResponse = {
  id: number;
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

type Decision = {
  id: number;
  responseId: number | null;
  userSaid: string;
  weChanged: string;
  rationale: string;
  status: string;
  createdAt: string;
};

const CATEGORIES = ["unclassified", "onboarding", "mission", "timer", "proof", "retention", "accessibility", "other"];
const STATUSES = ["new", "reviewed", "actioned"];

export default function ResearchConsole({ ownerName }: { ownerName: string }) {
  const [responses, setResponses] = useState<StudyResponse[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<StudyResponse | null>(null);
  const [weChanged, setWeChanged] = useState("");
  const [rationale, setRationale] = useState("");
  const [decisionStatus, setDecisionStatus] = useState("planned");
  const [savingDecision, setSavingDecision] = useState(false);

  async function reload() {
    const response = await fetch("/api/research", { cache: "no-store" });
    if (!response.ok) { setError("Research data could not be loaded."); setLoading(false); return; }
    const data = await response.json() as { responses: StudyResponse[]; decisions: Decision[] };
    setResponses(data.responses);
    setDecisions(data.decisions);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/research", { cache: "no-store" }).then(async (response) => {
      if (!active) return;
      if (!response.ok) { setError("Research data could not be loaded."); setLoading(false); return; }
      const data = await response.json() as { responses: StudyResponse[]; decisions: Decision[] };
      if (!active) return;
      setResponses(data.responses);
      setDecisions(data.decisions);
      setLoading(false);
    }).catch(() => {
      if (active) { setError("Research data could not be loaded."); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  const visible = filter === "all" ? responses : responses.filter((item) => item.category === filter || item.reviewStatus === filter);
  const metrics = useMemo(() => {
    const count = responses.length;
    return {
      count,
      useful: count ? (responses.reduce((sum, item) => sum + item.usefulness, 0) / count).toFixed(1) : "—",
      understood: count ? (responses.reduce((sum, item) => sum + item.feltUnderstood, 0) / count).toFixed(1) : "—",
      returnRate: count ? Math.round((responses.filter((item) => item.wouldReturn === "yes").length / count) * 100) : 0,
      unreviewed: responses.filter((item) => item.reviewStatus === "new").length,
    };
  }, [responses]);

  async function classify(item: StudyResponse, category: string, reviewStatus: string) {
    setResponses((current) => current.map((row) => row.id === item.id ? { ...row, category, reviewStatus } : row));
    const response = await fetch("/api/research", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, category, reviewStatus }) });
    if (!response.ok) { setError("Classification was not saved."); await reload(); }
  }

  async function saveDecision() {
    if (!selected) return;
    setSavingDecision(true);
    setError("");
    const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responseId: selected.id, userSaid: selected.changeRequest, weChanged, rationale, status: decisionStatus }) });
    const result = await response.json() as { error?: string; decision?: Decision };
    if (!response.ok || !result.decision) setError(result.error || "Decision could not be saved.");
    else {
      setDecisions((current) => [result.decision!, ...current]);
      setResponses((current) => current.map((item) => item.id === selected.id ? { ...item, reviewStatus: "actioned" } : item));
      setSelected(null); setWeChanged(""); setRationale(""); setDecisionStatus("planned");
    }
    setSavingDecision(false);
  }

  return <main className="research-console">
    <header className="research-top"><Link className="brand" href="/"><span className="brand-mark">S</span><span>START NOW</span></Link><div><span>OWNER RESEARCH CONSOLE</span><b>{ownerName}</b><a href="/signout-with-chatgpt?return_to=/">Sign out</a></div></header>
    <div className="research-wrap">
      <section className="research-title"><div><p>PRIVATE · SERVER-AUTHORIZED</p><h1>Turn user evidence into product decisions.</h1><span>Raw feedback never appears in the public product. Every shipped change should trace back to evidence.</span></div><Link href="/">Open public product →</Link></section>
      <section className="research-metrics"><div><span>RESPONSES</span><b>{metrics.count}</b><small>anonymous adults</small></div><div><span>USEFULNESS</span><b>{metrics.useful}</b><small>out of 5</small></div><div><span>FELT UNDERSTOOD</span><b>{metrics.understood}</b><small>out of 5</small></div><div><span>WOULD RETURN</span><b>{metrics.returnRate}%</b><small>unpaid intent</small></div><div><span>NEEDS REVIEW</span><b>{metrics.unreviewed}</b><small>unclassified evidence</small></div></section>
      {error && <div className="research-error">{error}</div>}
      <div className="research-columns">
        <section className="evidence-panel"><div className="panel-head"><div><h2>User evidence</h2><span>{visible.length} visible responses</span></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All evidence</option><option value="new">Needs review</option>{CATEGORIES.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          {loading ? <div className="research-empty">Loading protected evidence…</div> : visible.length === 0 ? <div className="research-empty">No matching evidence yet.</div> : <div className="response-stack">{visible.map((item) => <article className="response-card" key={item.id}><div className="response-meta"><span>#{item.id} · {item.relationship.replace("_", " ")}</span><time>{new Date(item.createdAt).toLocaleDateString()}</time></div><div className="response-scores"><span>Useful <b>{item.usefulness}/5</b></span><span>Understood <b>{item.feltUnderstood}/5</b></span><span>Return <b>{item.wouldReturn}</b></span><span>Friction <b>{item.hardestStep}</b></span></div><blockquote>{item.feedback}</blockquote><div className="change-request"><span>SINGLE MOST IMPORTANT CHANGE</span><p>{item.changeRequest}</p></div><div className="classification"><select value={item.category} onChange={(event) => classify(item, event.target.value, item.reviewStatus)}>{CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select><select value={item.reviewStatus} onChange={(event) => classify(item, item.category, event.target.value)}>{STATUSES.map((status) => <option value={status} key={status}>{status}</option>)}</select><button onClick={() => { setSelected(item); setWeChanged(""); setRationale(""); }}>TURN INTO DECISION →</button></div></article>)}</div>}
        </section>
        <aside className="decision-panel"><div className="panel-head"><div><h2>User said → We changed</h2><span>{decisions.length} accountable decisions</span></div></div>{decisions.length === 0 ? <div className="research-empty">No product decision has been tied to evidence yet.</div> : <div className="decision-stack">{decisions.map((item) => <article key={item.id}><div><span className={`decision-status ${item.status}`}>{item.status}</span><small>{new Date(item.createdAt).toLocaleDateString()}</small></div><p><b>User said</b>{item.userSaid}</p><p><b>We changed</b>{item.weChanged}</p><p className="rationale"><b>Why</b>{item.rationale}</p></article>)}</div>}</aside>
      </div>
    </div>
    {selected && <div className="decision-modal" role="dialog" aria-modal="true" aria-labelledby="decision-title"><div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><span className="modal-kicker">EVIDENCE #{selected.id}</span><h2 id="decision-title">Make a traceable product decision.</h2><label><span>USER SAID</span><textarea value={selected.changeRequest} readOnly /></label><label><span>WE WILL CHANGE</span><textarea value={weChanged} onChange={(event) => setWeChanged(event.target.value)} placeholder="Name the concrete product or research change." /></label><label><span>RATIONALE</span><textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain why this evidence is strong enough to act on—or what will be tested." /></label><div className="modal-actions"><select value={decisionStatus} onChange={(event) => setDecisionStatus(event.target.value)}><option value="planned">Planned</option><option value="shipped">Shipped</option><option value="rejected">Rejected with rationale</option></select><button disabled={weChanged.trim().length < 8 || rationale.trim().length < 8 || savingDecision} onClick={saveDecision}>{savingDecision ? "SAVING…" : "SAVE DECISION"}</button></div></div></div>}
  </main>;
}
