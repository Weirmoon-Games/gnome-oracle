"use client";

// =============================================================================
// app/settings/SettingsClient.tsx — the full Settings panel (client)
// =============================================================================
// Consolidates and expands the old four-slider panel into grouped sections
// (plan §5): Voice, Audio, Oracle/LLM, Appearance, Account, and Admin (tunes,
// users, database). Preferences load from localStorage (+ DB when signed in)
// and save back to both. Audio/voice changes apply live via the sound/tts
// singletons.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KOKORO_VOICES, SFX_THEMES, type SfxTheme } from "@/lib/persona";
import { tts, type TtsEngine } from "@/lib/tts";
import { sound } from "@/lib/sound";
import {
  type AppSettings,
  type Volumes,
  loadLocalSettings,
  saveLocalSettings,
  mergeServerSettings,
  syncToServer,
} from "@/lib/clientSettings";

interface Props {
  initialDriver: "sqlite" | "postgres";
  user: { id: number; username: string; role: string } | null;
}

interface Persona {
  id: number;
  name: string;
  emoji: string;
}

export default function SettingsClient({ initialDriver, user }: Props) {
  const [s, setS] = useState<AppSettings>(loadLocalSettings);
  const [models, setModels] = useState<string[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [saved, setSaved] = useState(false);
  const signedIn = !!user;
  const isAdmin = user?.role === "admin";
  const firstLoad = useRef(true);

  // Initial fetches: server settings (signed in), model list, persona list.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { settings?: Record<string, unknown> }) => {
        if (data.settings && Object.keys(data.settings).length) {
          setS((prev) => mergeServerSettings(prev, data.settings!));
        }
      })
      .catch(() => {});
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models?: string[] }) => setModels(d.models ?? []))
      .catch(() => {});
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d: Persona[]) => setPersonas(d))
      .catch(() => {});
  }, []);

  // Apply + persist whenever settings change (skip the very first render).
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      applyLive(s);
      return;
    }
    applyLive(s);
    saveLocalSettings(s);
    if (signedIn) syncToServer(s);
    setSaved(true);
    const id = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(id);
  }, [s, signedIn]);

  /** Push the relevant values into the live audio/voice engines. */
  function applyLive(v: AppSettings) {
    const muteAll = v.masterMute;
    tts.setEngine(v.voiceEngine);
    tts.setMuted(muteAll || !v.voiceOn || v.voiceEngine === "off");
    tts.setVolume(muteAll ? 0 : v.volumes.voice);
    sound.setMusicEnabled(!muteAll && v.musicOn);
    sound.setMusicVolume(muteAll ? 0 : v.volumes.music);
    sound.setSfxVolume(muteAll ? 0 : v.volumes.sfx);
    sound.setTypingVolume(muteAll ? 0 : v.volumes.typing);
    if (v.sfxThemeOverride) sound.setTheme(v.sfxThemeOverride);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = v.theme;
      document.documentElement.dataset.reduceMotion = v.reduceMotion ? "1" : "0";
    }
  }

  const set = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
  }, []);
  const setVol = useCallback((key: keyof Volumes, value: number) => {
    setS((prev) => ({ ...prev, volumes: { ...prev.volumes, [key]: value } }));
  }, []);

  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          Settings <span className="spark">⚙️</span>
        </h1>
        <nav className="nav">
          <Link className="navlink" href="/docs/pages/settings">
            ⓘ About
          </Link>
          <Link className="navlink" href="/">
            ← Back to the Oracle
          </Link>
        </nav>
      </div>
      <p className="tagline">
        Tune the Oracle. {signedIn ? "Saved to your account." : "Saved in this browser."}{" "}
        {saved && <span className="badge">saved ✓</span>}
      </p>

      {/* ---------------------------------------------------------------- Voice */}
      <section className="panel">
        <h2 className="section-title">Voice</h2>
        <Row label="Engine">
          <select value={s.voiceEngine} onChange={(e) => set("voiceEngine", e.target.value as TtsEngine)}>
            <option value="kokoro">Kokoro (neural, natural)</option>
            <option value="browser">Browser voice (lightweight)</option>
            <option value="off">Off</option>
          </select>
        </Row>
        <Row label="Voice override">
          <select value={s.voiceId} onChange={(e) => set("voiceId", e.target.value)}>
            <option value="">Per-persona (default)</option>
            {KOKORO_VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Row>
        <Slider label="Speed" min={0} max={1.6} step={0.05} value={s.voiceSpeed} onChange={(v) => set("voiceSpeed", v)} hint={s.voiceSpeed === 0 ? "per-persona" : s.voiceSpeed.toFixed(2)} />
        <Slider label="Volume" value={s.volumes.voice} onChange={(v) => setVol("voice", v)} />
      </section>

      {/* ---------------------------------------------------------------- Audio */}
      <section className="panel">
        <h2 className="section-title">Audio</h2>
        <Toggle label="Master mute" checked={s.masterMute} onChange={(v) => set("masterMute", v)} />
        <Toggle label="Music" checked={s.musicOn} onChange={(v) => set("musicOn", v)} />
        <Slider label="Music volume" value={s.volumes.music} onChange={(v) => setVol("music", v)} />
        <Slider label="Sound effects" value={s.volumes.sfx} onChange={(v) => setVol("sfx", v)} />
        <Slider label="Typing" value={s.volumes.typing} onChange={(v) => setVol("typing", v)} />
        <Row label="SFX theme override">
          <select value={s.sfxThemeOverride} onChange={(e) => set("sfxThemeOverride", e.target.value as SfxTheme | "")}>
            <option value="">Per-persona (default)</option>
            {SFX_THEMES.map((th) => (
              <option key={th} value={th}>
                {th}
              </option>
            ))}
          </select>
        </Row>
      </section>

      {/* ----------------------------------------------------------- Oracle/LLM */}
      <section className="panel">
        <h2 className="section-title">Oracle / Model</h2>
        <Row label="Model">
          <select value={s.model} onChange={(e) => set("model", e.target.value)}>
            <option value="">Server default</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Row>
        <Slider label="Response length" min={32} max={1024} step={8} value={s.responseLength} onChange={(v) => set("responseLength", Math.round(v))} hint={`${s.responseLength} tokens`} />
        <Row label="Default response style">
          <select value={s.responseStyle} onChange={(e) => set("responseStyle", e.target.value)}>
            <option value="funny-useful">Funny but useful</option>
            <option value="mostly-comedy">Mostly comedy</option>
            <option value="oracle-chaos">Oracle chaos</option>
          </select>
        </Row>
      </section>

      {/* ------------------------------------------------------- Appearance/UX */}
      <section className="panel">
        <h2 className="section-title">Appearance</h2>
        <Toggle label="Reduce motion (calmer canvas)" checked={s.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
        <Row label="Theme">
          <select value={s.theme} onChange={(e) => set("theme", e.target.value as "light" | "dark")}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Row>
        <Row label="Default persona">
          <select
            value={s.defaultPersonaId ?? ""}
            onChange={(e) => set("defaultPersonaId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">First in list</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        </Row>
      </section>

      {/* -------------------------------------------------------------- Account */}
      <AccountSection signedIn={signedIn} username={user?.username} />

      {/* ---------------------------------------------------------------- Admin */}
      {isAdmin && (
        <>
          <TunesAdmin />
          <UsersAdmin />
          <DatabaseAdmin initialDriver={initialDriver} />
        </>
      )}
    </main>
  );
}

// --------------------------- small presentational bits ----------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field settingrow">
      <span className="soundlabel">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <div className="soundrow">
      <span className="soundlabel">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="histtime">{hint}</small>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="soundrow">
      <button className="iconbtn" onClick={() => onChange(!checked)}>
        {checked ? "✅" : "⬜"}
      </button>
      <span className="soundlabel">{label}</span>
    </div>
  );
}

// ------------------------------ Account section -----------------------------

function AccountSection({ signedIn, username }: { signedIn: boolean; username?: string }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  async function changePw() {
    setMsg("");
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: cur, next }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Password changed ✓" : data.error ?? "Failed");
    if (res.ok) {
      setCur("");
      setNext("");
    }
  }

  return (
    <section className="panel">
      <h2 className="section-title">Account</h2>
      {signedIn ? (
        <>
          <p className="persona-desc">Signed in as <b>{username}</b>.</p>
          <Row label="Current password">
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Row>
          <Row label="New password">
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Row>
          {msg && <p className="persona-desc">{msg}</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={changePw} disabled={!cur || next.length < 6}>
              Change password
            </button>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="ghost">
                Sign out
              </button>
            </form>
          </div>
        </>
      ) : (
        <p className="persona-desc">
          <Link className="navlink" href="/login">Sign in</Link> to save settings to your account and use History &amp; the Lab.
        </p>
      )}
    </section>
  );
}

// ----------------------------- Admin: Tunes ---------------------------------

function TunesAdmin() {
  const [tracks, setTracks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/music")
      .then((r) => r.json())
      .then((t: string[]) => setTracks(t))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/music", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Uploaded ${data.filename}` : data.error ?? "Upload failed");
    setBusy(false);
    e.target.value = "";
    load();
  }

  async function remove(url: string) {
    // Only uploaded files (served via /api/music/file/) are deletable.
    if (!url.startsWith("/api/music/file/")) return;
    const name = url.replace("/api/music/file/", "");
    const res = await fetch(`/api/music/file/${name}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <section className="panel">
      <h2 className="section-title">Manage tunes (admin)</h2>
      <input type="file" accept="audio/*" onChange={upload} disabled={busy} />
      {msg && <p className="persona-desc">{msg}</p>}
      <ul className="list">
        {tracks.map((url) => {
          const uploaded = url.startsWith("/api/music/file/");
          const name = decodeURIComponent(url.split("/").pop() ?? url);
          return (
            <li key={url}>
              <span className="emoji">{uploaded ? "⬆️" : "🎵"}</span>
              <span className="meta">
                <b>{name}</b>
                <small>{uploaded ? "uploaded" : "built-in"}</small>
              </span>
              <audio controls preload="none" src={url} style={{ height: 30 }} />
              {uploaded && (
                <button className="danger" onClick={() => remove(url)}>
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ----------------------------- Admin: Users ---------------------------------

function UsersAdmin() {
  const [users, setUsers] = useState<{ id: number; username: string; role: string }[]>([]);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [role, setRole] = useState("user");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: { id: number; username: string; role: string }[] }) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function create() {
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p, role }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Created ✓" : data.error ?? "Failed");
    if (res.ok) {
      setU("");
      setP("");
      load();
    }
  }

  return (
    <section className="panel">
      <h2 className="section-title">Manage users (admin)</h2>
      <ul className="list">
        {users.map((usr) => (
          <li key={usr.id}>
            <span className="emoji">{usr.role === "admin" ? "👑" : "🙂"}</span>
            <span className="meta">
              <b>{usr.username}</b>
              <small>{usr.role}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="controlgrid">
        <Row label="Username">
          <input value={u} onChange={(e) => setU(e.target.value)} />
        </Row>
        <Row label="Password">
          <input type="password" value={p} onChange={(e) => setP(e.target.value)} />
        </Row>
        <Row label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </Row>
      </div>
      {msg && <p className="persona-desc">{msg}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={create} disabled={u.length < 3 || p.length < 6}>
          Add user
        </button>
      </div>
    </section>
  );
}

// --------------------------- Admin: Database --------------------------------

function DatabaseAdmin({ initialDriver }: { initialDriver: "sqlite" | "postgres" }) {
  const [driver, setDriver] = useState(initialDriver);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function test() {
    setMsg("");
    setBusy(true);
    const res = await fetch("/api/admin/db/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Connection OK ✓" : data.error ?? "Test failed");
    setBusy(false);
  }

  async function doSwitch() {
    if (!confirm("Copy all data to Postgres and switch? The Oracle will blink for a moment. Your SQLite file stays as a backup.")) return;
    setBusy(true);
    setSwitching(true);
    setMsg("Switching… migrating + copying data…");
    const res = await fetch("/api/admin/db/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setDriver("postgres");
      setMsg("Switched to Postgres ✓ — the Oracle has reconnected.");
    } else {
      setSwitching(false);
      setMsg(data.error ?? "Switch failed");
    }
  }

  async function revert() {
    if (!confirm("Revert to the built-in SQLite database?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/db/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revert: true }),
    });
    setBusy(false);
    if (res.ok) {
      setDriver("sqlite");
      setMsg("Reverted to SQLite ✓");
    }
  }

  return (
    <section className="panel">
      <h2 className="section-title">Database backend (admin)</h2>
      <p className="persona-desc">
        Current backend: <b>{driver}</b>
        {switching && " — reconnecting…"}
      </p>
      {driver === "sqlite" ? (
        <>
          <Row label="Postgres URL">
            <input
              type="password"
              placeholder="postgres://user:pass@host:5432/db"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Row>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost" onClick={test} disabled={busy || !url}>
              Test
            </button>
            <button onClick={doSwitch} disabled={busy || !url}>
              Switch to Postgres
            </button>
          </div>
        </>
      ) : (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ghost" onClick={revert} disabled={busy}>
            Revert to SQLite
          </button>
        </div>
      )}
      {msg && <p className="persona-desc">{msg}</p>}
    </section>
  );
}
