"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import OracleCanvas from "@/components/OracleCanvas";
import type { PersonaMeta } from "@/lib/persona";
import { tts } from "@/lib/tts";
import { sound } from "@/lib/sound";

interface Character {
  id: number;
  name: string;
  emoji: string;
  description: string;
  meta: PersonaMeta;
}

interface Volumes {
  voice: number;
  music: number;
  sfx: number;
  typing: number;
}

const DEFAULT_VOLUMES: Volumes = { voice: 1, music: 0.5, sfx: 0.6, typing: 0.4 };

function readNum(key: string, def: number): number {
  if (typeof localStorage === "undefined") return def;
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && localStorage.getItem(key) !== null ? v : def;
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [burst, setBurst] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [volumes, setVolumes] = useState<Volumes>(DEFAULT_VOLUMES);
  const [showSettings, setShowSettings] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [favorited, setFavorited] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selected = characters.find((c) => c.id === selectedId);
  const speaking = streaming || ttsSpeaking;

  // Load personas, music playlist, and persisted prefs; subscribe to TTS state.
  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((data: Character[]) => {
        setCharacters(data);
        if (data.length) setSelectedId(data[0].id);
      })
      .catch(() => {});

    fetch("/api/music")
      .then((r) => r.json())
      .then((tracks: string[]) => sound.setPlaylist(tracks))
      .catch(() => {});

    const voice = localStorage.getItem("gnome.voiceOn");
    const music = localStorage.getItem("gnome.musicOn");
    const voiceOnPref = voice === null ? true : voice === "1";
    const musicOnPref = music === null ? true : music === "1";
    const vols: Volumes = {
      voice: readNum("gnome.vol.voice", DEFAULT_VOLUMES.voice),
      music: readNum("gnome.vol.music", DEFAULT_VOLUMES.music),
      sfx: readNum("gnome.vol.sfx", DEFAULT_VOLUMES.sfx),
      typing: readNum("gnome.vol.typing", DEFAULT_VOLUMES.typing),
    };

    setVoiceOn(voiceOnPref);
    setMusicOn(musicOnPref);
    setVolumes(vols);

    tts.setMuted(!voiceOnPref);
    tts.setVolume(vols.voice);
    sound.setMusicVolume(vols.music);
    sound.setSfxVolume(vols.sfx);
    sound.setTypingVolume(vols.typing);
    sound.setMusicEnabled(musicOnPref);
    // Browsers block audio until first interaction — start on any gesture.
    sound.primeOnFirstGesture();

    const unsub = tts.onSpeakingChange(setTtsSpeaking);
    return () => {
      unsub();
      tts.cancel();
    };
  }, []);

  // Keep TTS voice + SFX theme in sync with the selected persona.
  useEffect(() => {
    if (selected) {
      tts.setVoice(selected.meta.voice);
      sound.setTheme(selected.meta.sfx);
    }
  }, [selected]);

  function onPersonaChange(id: number) {
    setSelectedId(id);
    sound.resume();
    const next = characters.find((c) => c.id === id);
    if (next) sound.setTheme(next.meta.sfx);
    sound.switchBell();
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem("gnome.voiceOn", next ? "1" : "0");
    tts.setMuted(!next);
  }

  function toggleMusic() {
    const next = !musicOn;
    setMusicOn(next);
    localStorage.setItem("gnome.musicOn", next ? "1" : "0");
    sound.setMusicEnabled(next); // resumes / starts playback (user gesture)
  }

  function changeVolume(key: keyof Volumes, value: number) {
    setVolumes((prev) => ({ ...prev, [key]: value }));
    localStorage.setItem(`gnome.vol.${key}`, String(value));
    if (key === "voice") tts.setVolume(value);
    if (key === "music") sound.setMusicVolume(value);
    if (key === "sfx") sound.setSfxVolume(value);
    if (key === "typing") sound.setTypingVolume(value);
  }

  const ask = useCallback(async () => {
    if (!question.trim() || selectedId == null || streaming) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    sound.resume();
    sound.tryStartMusic(); // ensure music is rolling if it hasn't started yet
    sound.whoosh();
    tts.begin();
    setAnswer("");
    setFavorited(false);
    setHistoryId(null);
    setStreaming(true);
    let firstChunk = true;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, characterId: selectedId }),
        signal: ac.signal,
      });
      const hid = res.headers.get("X-History-Id");
      if (hid) setHistoryId(Number(hid));
      if (!res.body) {
        setAnswer("*silence* (no response)");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (firstChunk) {
          firstChunk = false;
          sound.chime();
          setBurst((b) => b + 1);
        }
        setAnswer((prev) => prev + text);
        sound.typeTick();
        tts.feed(text);
      }
      tts.end();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setAnswer("*The oracle stumbled.* Try again, brave soul.");
      }
    } finally {
      setStreaming(false);
    }
  }, [question, selectedId, streaming]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") ask();
  }

  async function favorite() {
    if (historyId == null) return;
    const res = await fetch(`/api/history/${historyId}`, { method: "PATCH" });
    if (res.ok) {
      const data = await res.json();
      setFavorited(!!data.favorite);
    }
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          The Gnome Oracle <span className="spark">✨</span>
        </h1>
        <nav className="nav">
          <button
            className="iconbtn"
            onClick={() => setShowSettings((s) => !s)}
            title="Sound settings"
          >
            ⚙️ Sound
          </button>
          <Link className="navlink" href="/history">
            📜 History
          </Link>
          <Link className="navlink" href="/lab">
            🧪 Lab
          </Link>
        </nav>
      </div>

      {showSettings && (
        <div className="panel soundpanel">
          <div className="soundrow">
            <button className="iconbtn" onClick={toggleVoice}>
              {voiceOn ? "🔊" : "🔇"}
            </button>
            <span className="soundlabel">Wizard voice</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes.voice}
              disabled={!voiceOn}
              onChange={(e) => changeVolume("voice", Number(e.target.value))}
            />
          </div>
          <div className="soundrow">
            <button className="iconbtn" onClick={toggleMusic}>
              {musicOn ? "🎵" : "🔕"}
            </button>
            <span className="soundlabel">Music</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes.music}
              disabled={!musicOn}
              onChange={(e) => changeVolume("music", Number(e.target.value))}
            />
          </div>
          <div className="soundrow">
            <span className="iconbtn ghosticon">✨</span>
            <span className="soundlabel">Sound effects</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes.sfx}
              onChange={(e) => changeVolume("sfx", Number(e.target.value))}
            />
          </div>
          <div className="soundrow">
            <span className="iconbtn ghosticon">⌨️</span>
            <span className="soundlabel">Typing</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes.typing}
              onChange={(e) => changeVolume("typing", Number(e.target.value))}
            />
          </div>
        </div>
      )}

      <p className="tagline">
        Ask anything. Receive vibes, riddles, and the bare minimum of an answer.
      </p>

      <div className="panel stage">
        <OracleCanvas speaking={speaking} appearance={selected?.meta.appearance} burst={burst} />
        <div className={`bubble ${answer ? "" : "placeholder"}`}>
          {answer ||
            (speaking ? "The oracle stirs…" : "Pick a persona and ask me something silly.")}
        </div>
        {answer && !streaming && (
          <div className="row answeractions">
            <button className="ghost favbtn" onClick={() => tts.replay(answer)}>
              🔁 Replay
            </button>
            {historyId != null && (
              <button className="ghost favbtn" onClick={favorite} disabled={favorited}>
                {favorited ? "⭐ Favorited" : "☆ Favorite this"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="controls">
        <label className="field">
          Persona
          <select
            value={selectedId ?? ""}
            onChange={(e) => onPersonaChange(Number(e.target.value))}
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        {selected?.description && <p className="persona-desc">{selected.description}</p>}

        <div className="row">
          <input
            type="text"
            placeholder="Ask the oracle anything…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button onClick={ask} disabled={streaming || !question.trim()}>
            {streaming ? "Conjuring…" : "Ask the Oracle"}
          </button>
        </div>
      </div>
    </main>
  );
}
