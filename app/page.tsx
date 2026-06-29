"use client";

// =============================================================================
// app/page.tsx — the Oracle (home)
// =============================================================================
// Asking the Oracle is open to everyone. This page now also:
//   • loads the user (via /api/me) to show Login/Logout and gate History/Lab,
//   • loads preferences via lib/clientSettings (localStorage + DB when signed in),
//   • drives the pluggable TTS engine (Kokoro / browser) and shows a small
//     "summoning the voice…" indicator while the neural model downloads,
//   • threads the chosen model + response length into /api/ask,
//   • respects reduce-motion + theme, and a configurable default persona.
// Per-ask controls (persona, outfit, response style, mood) stay here; durable
// preferences live on /settings.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import OracleCanvas from "@/components/OracleCanvas";
import type { PersonaMeta } from "@/lib/persona";
import { tts, type TtsStatus } from "@/lib/tts";
import { sound } from "@/lib/sound";
import {
  type AppSettings,
  loadLocalSettings,
  saveLocalSettings,
  mergeServerSettings,
  syncToServer,
} from "@/lib/clientSettings";

interface Character {
  id: number;
  name: string;
  emoji: string;
  description: string;
  meta: PersonaMeta;
}

type ResponseStyle = "funny-useful" | "mostly-comedy" | "oracle-chaos";

const RESPONSE_STYLES: { value: ResponseStyle; label: string }[] = [
  { value: "funny-useful", label: "Funny but useful" },
  { value: "mostly-comedy", label: "Mostly comedy" },
  { value: "oracle-chaos", label: "Oracle chaos" },
];

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<TtsStatus>("idle");
  const [burst, setBurst] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(loadLocalSettings);
  const [user, setUser] = useState<{ id: number; username: string; role: string } | null>(null);
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

  // Load personas, music, prefs, current user; subscribe to TTS state.
  useEffect(() => {
    let local = loadLocalSettings();

    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { user: typeof user }) => setUser(d.user))
      .catch(() => {});

    // Merge server-side settings if signed in (best effort).
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { settings?: Record<string, unknown> }) => {
        if (d.settings && Object.keys(d.settings).length) {
          local = mergeServerSettings(local, d.settings);
          setSettings(local);
          applyPrefs(local);
        }
      })
      .catch(() => {});

    fetch("/api/characters")
      .then((r) => r.json())
      .then((data: Character[]) => {
        setCharacters(data);
        if (data.length) {
          const def = local.defaultPersonaId;
          const pick = def != null && data.some((c) => c.id === def) ? def : data[0].id;
          setSelectedId(pick);
        }
      })
      .catch(() => {});

    fetch("/api/music")
      .then((r) => r.json())
      .then((tracks: string[]) => sound.setPlaylist(tracks))
      .catch(() => {});

    setSettings(local);
    setResponseStyle(isResponseStyle(local.responseStyle) ? local.responseStyle : "funny-useful");
    setMood(local.mood || "default");
    setOutfitIndex(Math.max(0, Math.min(3, local.outfitIndex)));
    applyPrefs(local);
    sound.primeOnFirstGesture();

    const unsub = tts.onSpeakingChange(setTtsSpeaking);
    const unsubStatus = tts.onStatusChange(setVoiceStatus);
    return () => {
      unsub();
      unsubStatus();
      tts.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Push preferences into the live audio/voice engines + document theme. */
  function applyPrefs(v: AppSettings) {
    const mute = v.masterMute;
    tts.setEngine(v.voiceEngine);
    tts.setMuted(mute || !v.voiceOn || v.voiceEngine === "off");
    tts.setVolume(mute ? 0 : v.volumes.voice);
    sound.setMusicEnabled(!mute && v.musicOn);
    sound.setMusicVolume(mute ? 0 : v.volumes.music);
    sound.setSfxVolume(mute ? 0 : v.volumes.sfx);
    sound.setTypingVolume(mute ? 0 : v.volumes.typing);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = v.theme;
      document.documentElement.dataset.reduceMotion = v.reduceMotion ? "1" : "0";
    }
  }

  // Keep the persona's voice + SFX theme in sync with the selection, honoring
  // any global overrides from Settings.
  useEffect(() => {
    if (!selected) return;
    const baseVoice = selected.meta.voice;
    tts.setVoice({
      ...baseVoice,
      voiceId: (settings.voiceId || baseVoice.voiceId) as typeof baseVoice.voiceId,
      speed: settings.voiceSpeed > 0 ? settings.voiceSpeed : baseVoice.speed ?? baseVoice.rate,
    });
    sound.setTheme(settings.sfxThemeOverride || selected.meta.sfx);
    setOutfitIndex((i) => Math.min(i, (selected.meta.appearanceVariants?.length ?? 1) - 1));
    setMood((current) => (selected.meta.moods.includes(current) ? current : "default"));
  }, [selected, settings.voiceId, settings.voiceSpeed, settings.sfxThemeOverride]);

  function onPersonaChange(id: number) {
    setSelectedId(id);
    sound.resume();
    const next = characters.find((c) => c.id === id);
    if (next) sound.setTheme(settings.sfxThemeOverride || next.meta.sfx);
    sound.switchBell();
  }

  function persist(next: AppSettings) {
    setSettings(next);
    saveLocalSettings(next);
    if (user) syncToServer(next);
  }

  function changeOutfit(index: number) {
    setOutfitIndex(index);
    persist({ ...settings, outfitIndex: index });
    setBurst((b) => b + 1);
    sound.switchBell();
  }

  function shuffleOutfit() {
    if (!outfits.length) return;
    const next =
      outfits.length === 1
        ? 0
        : (outfitIndex + 1 + Math.floor(Math.random() * (outfits.length - 1))) % outfits.length;
    changeOutfit(next);
  }

  function changeResponseStyle(value: ResponseStyle) {
    setResponseStyle(value);
    persist({ ...settings, responseStyle: value });
  }

  function changeMood(value: string) {
    setMood(value);
    persist({ ...settings, mood: value });
  }

  function toggleVoice() {
    const next = { ...settings, voiceOn: !settings.voiceOn };
    persist(next);
    tts.setMuted(next.masterMute || !next.voiceOn || next.voiceEngine === "off");
  }

  function toggleMusic() {
    const next = { ...settings, musicOn: !settings.musicOn };
    persist(next);
    sound.setMusicEnabled(!next.masterMute && next.musicOn);
  }

  const ask = useCallback(async () => {
    if (!question.trim() || selectedId == null || streaming) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    sound.resume();
    sound.tryStartMusic();
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
        body: JSON.stringify({
          question,
          characterId: selectedId,
          responseStyle,
          mood,
          model: settings.model || undefined,
          responseLength: settings.responseLength,
        }),
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
  }, [question, selectedId, streaming, responseStyle, mood, settings.model, settings.responseLength]);

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
          <button className="iconbtn" onClick={toggleVoice} title="Toggle voice">
            {settings.voiceOn ? "🔊" : "🔇"}
          </button>
          <button className="iconbtn" onClick={toggleMusic} title="Toggle music">
            {settings.musicOn ? "🎵" : "🔕"}
          </button>
          <Link className="navlink" href="/settings">
            ⚙️ Settings
          </Link>
          {user && (
            <Link className="navlink" href="/history">
              📜 History
            </Link>
          )}
          {user && (
            <Link className="navlink" href="/lab">
              🧪 Lab
            </Link>
          )}
          <Link className="navlink" href="/docs">
            📚 Docs
          </Link>
          {user ? (
            <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
              <button type="submit" className="navlink" title={`Sign out ${user.username}`}>
                🚪 Logout
              </button>
            </form>
          ) : (
            <Link className="navlink" href="/login">
              🔑 Login
            </Link>
          )}
        </nav>
      </div>

      <p className="tagline">
        Ask anything. Receive vibes, riddles, and the bare minimum of an answer.
      </p>

      {voiceStatus === "loading" && settings.voiceEngine === "kokoro" && (
        <p className="persona-desc">🔮 Summoning the Oracle's voice… (downloading the neural model)</p>
      )}

      <div className="panel stage">
        <OracleCanvas
          speaking={speaking}
          appearance={selectedAppearance}
          burst={burst}
          reduceMotion={settings.reduceMotion}
        />
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
            {historyId == null && !user && (
              <span className="histtime">Sign in to save your favorites.</span>
            )}
          </div>
        )}
      </div>

      <div className="controls">
        <label className="field">
          Persona
          <select value={selectedId ?? ""} onChange={(e) => onPersonaChange(Number(e.target.value))}>
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
              <select value={outfitIndex} onChange={(e) => changeOutfit(Number(e.target.value))}>
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
            <select value={responseStyle} onChange={(e) => changeResponseStyle(e.target.value as ResponseStyle)}>
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
