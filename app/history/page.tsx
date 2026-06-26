"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface HistoryRow {
  id: number;
  persona_name: string;
  persona_emoji: string;
  question: string;
  answer: string;
  favorite: number;
  created_at: string;
}

function timeAgo(iso: string): string {
  // sqlite stores UTC "YYYY-MM-DD HH:MM:SS"
  const then = new Date(iso.replace(" ", "T") + "Z").getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function History() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/history${favoritesOnly ? "?favorites=1" : ""}`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {});
  }, [favoritesOnly]);

  useEffect(load, [load]);

  async function toggleFav(id: number) {
    const res = await fetch(`/api/history/${id}`, { method: "PATCH" });
    if (res.ok) load();
  }

  async function remove(id: number) {
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          History <span className="spark">📜</span>
        </h1>
        <Link className="navlink" href="/">
          ← Back to the Oracle
        </Link>
      </div>
      <p className="tagline">Everything the oracle has ever uttered. Star the best nonsense.</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button
          className={favoritesOnly ? "ghost" : ""}
          onClick={() => setFavoritesOnly(false)}
        >
          All
        </button>
        <button
          className={favoritesOnly ? "" : "ghost"}
          onClick={() => setFavoritesOnly(true)}
        >
          ⭐ Favorites
        </button>
      </div>

      {rows.length === 0 && (
        <p className="persona-desc">
          {favoritesOnly ? "No favorites yet — go star some nonsense!" : "No questions asked yet."}
        </p>
      )}

      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="histcard">
            <div className="histhead">
              <span className="emoji">{r.persona_emoji}</span>
              <b>{r.persona_name}</b>
              <small className="histtime">{timeAgo(r.created_at)}</small>
              <span className="histactions">
                <button
                  className="iconbtn"
                  title={r.favorite ? "Unfavorite" : "Favorite"}
                  onClick={() => toggleFav(r.id)}
                >
                  {r.favorite ? "⭐" : "☆"}
                </button>
                <button className="iconbtn" title="Delete" onClick={() => remove(r.id)}>
                  🗑
                </button>
              </span>
            </div>
            <p className="histq">“{r.question}”</p>
            <p className="hista">{r.answer || "…"}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
