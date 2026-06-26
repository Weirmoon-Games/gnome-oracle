"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { PersonaMeta } from "@/lib/persona";

interface Character {
  id: number;
  name: string;
  emoji: string;
  description: string;
  is_seed: number;
  meta: PersonaMeta;
}

export default function Lab() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [vibe, setVibe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justMade, setJustMade] = useState<Character | null>(null);

  function load() {
    fetch("/api/characters")
      .then((r) => r.json())
      .then(setCharacters)
      .catch(() => {});
  }

  useEffect(load, []);

  async function generate() {
    if (!vibe.trim() || busy) return;
    setBusy(true);
    setError("");
    setJustMade(null);
    try {
      const res = await fetch("/api/characters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setJustMade(data);
      setVibe("");
      load();
    } catch {
      setError("Could not reach the conjurer.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    if (res.ok) {
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete.");
    }
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          Persona Lab <span className="spark">🧪</span>
        </h1>
        <Link className="navlink" href="/">
          ← Back to the Oracle
        </Link>
      </div>
      <p className="tagline">
        Describe a vibe and the model will conjure a brand-new persona for the drop-down.
      </p>

      <div className="panel">
        <label className="field">
          Describe a vibe
          <textarea
            rows={3}
            placeholder="e.g. a 1920s gangster, a sleepy cat, an overdramatic Shakespearean actor…"
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
          />
        </label>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={generate} disabled={busy || !vibe.trim()}>
            {busy ? "Conjuring persona…" : "✨ Conjure a Persona"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {justMade && (
          <p className="persona-desc" style={{ marginTop: 10 }}>
            Created <b>{justMade.emoji} {justMade.name}</b> — it's now in the drop-down!
          </p>
        )}
      </div>

      <h2 className="section-title">All Personas</h2>
      <ul className="list">
        {characters.map((c) => (
          <li key={c.id}>
            <span className="emoji">{c.emoji}</span>
            <span
              className="swatch"
              title={`${c.meta.appearance.hat} hat`}
              style={{
                background: c.meta.appearance.robeColor,
                borderColor: c.meta.appearance.accent,
              }}
            >
              <span style={{ background: c.meta.appearance.hatColor }} />
              <span style={{ background: c.meta.appearance.accent }} />
            </span>
            <span className="meta">
              <b>{c.name}</b>
              <small>{c.description}</small>
            </span>
            {c.is_seed ? (
              <span className="badge">built-in</span>
            ) : (
              <button className="danger" onClick={() => remove(c.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
