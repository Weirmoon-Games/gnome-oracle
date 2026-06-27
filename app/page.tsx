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

type ResponseStyle = "funny-useful" | "mostly-comedy" | "oracle-chaos";

interface Volumes {
  voice: number;
  music: number;
  sfx: number;
  typing: number;
}

const DEFAULT_VOLUMES: Volumes = { voice: 1, music: 0.5, sfx: 0.6, typing: 0.4 };

const RESPONSE_STYLES: { value: ResponseStyle; label: string }[] = [
  { value: "funny-useful", label: "Funny but useful" },
  { value: "mostly-comedy", label: "Mostly comedy" },
  { value: "oracle-chaos", label: "Oracle chaos" },
];

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
  const [outfitIndex, setOutfitIndex] = useState(0);
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>("funny-useful");
  const [mood, setMood] = useState("default");
  const abortRef = useRef<AbortController | null>(null);

  const selected = characters.find((c) => c.id === selectedId);
  const speaking = streaming || ttsSpeaking;
  const outfits = selected?.meta.appearanceVariants?.length
    ? selected.meta.appearanceVariants
    : selected
      ? [selected.meta.appearance]
      : [];
  const selectedAppearance = outfits[outfitIndex] ?? selected?.meta.appearance;
  const moods = selected?.meta.moods?.length ? selected.meta.moods : ["default"];

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
    const storedStyle = localStorage.getItem("gnome.responseStyle");
    const storedMood = localStorage.getItem("gnome.mood");
    const storedOutfit = Number(localStorage.getItem("gnome.outfitIndex"));
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
    if (isResponseStyle(storedStyle)) setResponseStyle(storedStyle);
    if (storedMood) setMood(storedMood);
    if (Number.isFinite(storedOutfit)) setOutfitIndex(Math.max(0, Math.min(3, storedOutfit)));

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
      setOutfitIndex((i) => Math.min(i, (selected.meta.appearanceVariants?.length ?? 1) - 1));
      setMood((current) => (selected.meta.moods.includes(current) ? current : "default"));
    }
  }, [selected]);

  function onPersonaChange(id: number) {
    setSelectedId(id);
    sound.resume();
    const next = characters.find((c) => c.id === id);
    if (next) sound.setTheme(next.meta.sfx);
    sound.switchBell();
  }

  function changeOutfit(index: number) {
    setOutfitIndex(index);
    localStorage.setItem("gnome.outfitIndex", String(index));
    setBurst((b) => b + 1);
    sound.switchBell();
  }

  function shuffleOutfit() {
    if (!outfits.length) return;
    const next =
      outfits.length === 1
        ? 0
        : (outfitIndex + 1 + Math.floor(Math.random() * (outfits.length - 1))) %
          outfits.length;
    changeOutfit(next);
  }

  function changeResponseStyle(value: ResponseStyle) {
    setResponseStyle(value);
    localStorage.setItem("gnome.responseStyle", value);
  }

  function changeMood(value: string) {
    setMood(value);
    localStorage.setItem("gnome.mood", value);
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
        body: JSON.stringify({ question, characterId: selectedId, responseStyle, mood }),
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
  }, [question, selectedId, streaming, responseStyle, mood]);

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
        <OracleCanvas speaking={speaking} appearance={selectedAppearance} burst={burst} />
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

        <div className="controlgrid">
          <label className="field">
            Outfit
            <div className="selectrow">
              <select
                value={outfitIndex}
                onChange={(e) => changeOutfit(Number(e.target.value))}
              >
                {outfits.map((_, i) => (
                  <option key={i} value={i}>
                    Outfit {i + 1}
                  </option>
                ))}
              </select>
              <button type="button" className="iconbtn" onClick={shuffleOutfit} title="Shuffle outfit">
                🎲
              </button>
            </div>
          </label>

          <label className="field">
            Response style
            <select
              value={responseStyle}
              onChange={(e) => changeResponseStyle(e.target.value as ResponseStyle)}
            >
              {RESPONSE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Mood
            <select value={mood} onChange={(e) => changeMood(e.target.value)}>
              {moods.map((m) => (
                <option key={m} value={m}>
                  {labelize(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

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

function isResponseStyle(value: string | null): value is ResponseStyle {
  return value === "funny-useful" || value === "mostly-comedy" || value === "oracle-chaos";
}

function labelize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
