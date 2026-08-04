"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ResearchLogin() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/research/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) setError(result.error || "Owner sign-in failed.");
      else window.location.assign("/research");
    } catch {
      setError("Owner sign-in is temporarily unavailable.");
    }
    setLoading(false);
  }

  return <main className="research-login"><form onSubmit={submit}>
    <Link className="brand" href="/"><span className="brand-mark">S</span><span>START NOW</span></Link>
    <p>PRIVATE RESEARCH</p><h1>Owner access</h1><span>Raw participant feedback is never exposed in the public product.</span>
    <label><b>OWNER SECRET</b><input type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} autoFocus /></label>
    {error && <div className="research-error">{error}</div>}
    <button disabled={secret.length < 20 || loading}>{loading ? "VERIFYING…" : "OPEN RESEARCH CONSOLE"}</button>
    <Link className="login-back" href="/">← Return to Start Now</Link>
  </form></main>;
}
