// =============================================================================
// lib/clientSettings.ts — client settings model (localStorage + DB sync)
// =============================================================================
// One place that knows every user-facing preference, its default, and how to
// load/save it. Anonymous users persist to `localStorage` under `gnome.*` keys
// (the original behavior); signed-in users ALSO sync to the `settings` table via
// /api/settings so prefs follow the account (plan §5).
//
// Both the Home page and the Settings page import this so the two never drift.
// Pure client module (guards `localStorage`); no node imports.
// =============================================================================

import type { SfxTheme } from "./persona";
import type { TtsEngine } from "./tts";

export interface Volumes {
  voice: number;
  music: number;
  sfx: number;
  typing: number;
}

export interface AppSettings {
  voiceOn: boolean;
  musicOn: boolean;
  masterMute: boolean;
  volumes: Volumes;
  voiceEngine: TtsEngine; // kokoro | browser | off
  voiceId: string; // "" = per-persona; otherwise global override
  voiceSpeed: number; // 0 = per-persona; otherwise override
  sfxThemeOverride: SfxTheme | ""; // "" = per-persona
  responseStyle: string;
  mood: string;
  model: string; // "" = server default
  responseLength: number; // num_predict
  reduceMotion: boolean;
  theme: "light" | "dark";
  defaultPersonaId: number | null;
  outfitIndex: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  voiceOn: true,
  musicOn: true,
  masterMute: false,
  volumes: { voice: 1, music: 0.5, sfx: 0.6, typing: 0.4 },
  voiceEngine: "kokoro",
  voiceId: "",
  voiceSpeed: 0,
  sfxThemeOverride: "",
  responseStyle: "funny-useful",
  mood: "default",
  model: "",
  responseLength: 200,
  reduceMotion: false,
  theme: "dark",
  defaultPersonaId: null,
  outfitIndex: 0,
};

const K = {
  voiceOn: "gnome.voiceOn",
  musicOn: "gnome.musicOn",
  masterMute: "gnome.masterMute",
  volVoice: "gnome.vol.voice",
  volMusic: "gnome.vol.music",
  volSfx: "gnome.vol.sfx",
  volTyping: "gnome.vol.typing",
  voiceEngine: "gnome.voiceEngine",
  voiceId: "gnome.voiceId",
  voiceSpeed: "gnome.voiceSpeed",
  sfxThemeOverride: "gnome.sfxThemeOverride",
  responseStyle: "gnome.responseStyle",
  mood: "gnome.mood",
  model: "gnome.model",
  responseLength: "gnome.responseLength",
  reduceMotion: "gnome.reduceMotion",
  theme: "gnome.theme",
  defaultPersonaId: "gnome.defaultPersonaId",
  outfitIndex: "gnome.outfitIndex",
};

function ls(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}
function num(v: string | null, def: number): number {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? n : def;
}
function bool(v: string | null, def: boolean): boolean {
  return v === null ? def : v === "1";
}

/** Load settings from localStorage, layered over defaults. */
export function loadLocalSettings(): AppSettings {
  const s = ls();
  if (!s) return { ...DEFAULT_SETTINGS };
  const d = DEFAULT_SETTINGS;
  return {
    voiceOn: bool(s.getItem(K.voiceOn), d.voiceOn),
    musicOn: bool(s.getItem(K.musicOn), d.musicOn),
    masterMute: bool(s.getItem(K.masterMute), d.masterMute),
    volumes: {
      voice: num(s.getItem(K.volVoice), d.volumes.voice),
      music: num(s.getItem(K.volMusic), d.volumes.music),
      sfx: num(s.getItem(K.volSfx), d.volumes.sfx),
      typing: num(s.getItem(K.volTyping), d.volumes.typing),
    },
    voiceEngine: (s.getItem(K.voiceEngine) as TtsEngine) || d.voiceEngine,
    voiceId: s.getItem(K.voiceId) ?? d.voiceId,
    voiceSpeed: num(s.getItem(K.voiceSpeed), d.voiceSpeed),
    sfxThemeOverride: (s.getItem(K.sfxThemeOverride) as SfxTheme | "") ?? d.sfxThemeOverride,
    responseStyle: s.getItem(K.responseStyle) ?? d.responseStyle,
    mood: s.getItem(K.mood) ?? d.mood,
    model: s.getItem(K.model) ?? d.model,
    responseLength: num(s.getItem(K.responseLength), d.responseLength),
    reduceMotion: bool(s.getItem(K.reduceMotion), d.reduceMotion),
    theme: (s.getItem(K.theme) as "light" | "dark") || d.theme,
    defaultPersonaId: s.getItem(K.defaultPersonaId) ? num(s.getItem(K.defaultPersonaId), 0) : null,
    outfitIndex: num(s.getItem(K.outfitIndex), d.outfitIndex),
  };
}

/** Persist the full settings object to localStorage. */
export function saveLocalSettings(v: AppSettings): void {
  const s = ls();
  if (!s) return;
  s.setItem(K.voiceOn, v.voiceOn ? "1" : "0");
  s.setItem(K.musicOn, v.musicOn ? "1" : "0");
  s.setItem(K.masterMute, v.masterMute ? "1" : "0");
  s.setItem(K.volVoice, String(v.volumes.voice));
  s.setItem(K.volMusic, String(v.volumes.music));
  s.setItem(K.volSfx, String(v.volumes.sfx));
  s.setItem(K.volTyping, String(v.volumes.typing));
  s.setItem(K.voiceEngine, v.voiceEngine);
  s.setItem(K.voiceId, v.voiceId);
  s.setItem(K.voiceSpeed, String(v.voiceSpeed));
  s.setItem(K.sfxThemeOverride, v.sfxThemeOverride);
  s.setItem(K.responseStyle, v.responseStyle);
  s.setItem(K.mood, v.mood);
  s.setItem(K.model, v.model);
  s.setItem(K.responseLength, String(v.responseLength));
  s.setItem(K.reduceMotion, v.reduceMotion ? "1" : "0");
  s.setItem(K.theme, v.theme);
  if (v.defaultPersonaId == null) s.removeItem(K.defaultPersonaId);
  else s.setItem(K.defaultPersonaId, String(v.defaultPersonaId));
  s.setItem(K.outfitIndex, String(v.outfitIndex));
}

/** Merge DB-stored settings (from /api/settings) over the local ones. */
export function mergeServerSettings(base: AppSettings, server: Record<string, unknown>): AppSettings {
  const out = { ...base };
  if (typeof server.voiceOn === "boolean") out.voiceOn = server.voiceOn;
  if (typeof server.musicOn === "boolean") out.musicOn = server.musicOn;
  if (server.volumes && typeof server.volumes === "object") {
    out.volumes = { ...out.volumes, ...(server.volumes as Partial<Volumes>) };
  }
  if (typeof server.voiceEngine === "string") out.voiceEngine = server.voiceEngine as TtsEngine;
  if (typeof server.voiceId === "string") out.voiceId = server.voiceId;
  if (typeof server.voiceSpeed === "number") out.voiceSpeed = server.voiceSpeed;
  if (typeof server.sfxThemeOverride === "string") out.sfxThemeOverride = server.sfxThemeOverride as SfxTheme | "";
  if (typeof server.responseStyle === "string") out.responseStyle = server.responseStyle;
  if (typeof server.mood === "string") out.mood = server.mood;
  if (typeof server.model === "string") out.model = server.model;
  if (typeof server.responseLength === "number") out.responseLength = server.responseLength;
  if (typeof server.reduceMotion === "boolean") out.reduceMotion = server.reduceMotion;
  if (server.theme === "light" || server.theme === "dark") out.theme = server.theme;
  if (typeof server.defaultPersonaId === "number") out.defaultPersonaId = server.defaultPersonaId;
  return out;
}

/** Push settings to the DB for a signed-in user (fire-and-forget). */
export function syncToServer(v: AppSettings): void {
  try {
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceOn: v.voiceOn,
        musicOn: v.musicOn,
        volumes: v.volumes,
        voiceEngine: v.voiceEngine,
        voiceId: v.voiceId,
        voiceSpeed: v.voiceSpeed,
        sfxThemeOverride: v.sfxThemeOverride,
        responseStyle: v.responseStyle,
        mood: v.mood,
        model: v.model,
        responseLength: v.responseLength,
        reduceMotion: v.reduceMotion,
        theme: v.theme,
        defaultPersonaId: v.defaultPersonaId,
      }),
    });
  } catch {
    /* offline / anonymous — localStorage is the source of truth */
  }
}
