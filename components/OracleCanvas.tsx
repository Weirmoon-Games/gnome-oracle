"use client";

import { useEffect, useRef } from "react";
import type { Appearance } from "@/lib/persona";

const DEFAULT_APPEARANCE: Appearance = {
  hat: "wizard",
  hatColor: "#3a2470",
  robeColor: "#5a3aa0",
  beardColor: "#eef0f5",
  skin: "#f3d3b3",
  accent: "#ffd66b",
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

/**
 * A procedurally-drawn wizard/gnome that re-skins per persona. No image assets.
 * - Idle: gentle bob + twinkling stars + blink.
 * - speaking=true: mouth animates and the staff orb pulses.
 * - burst: bump this number to fire a sparkle pop (e.g. when an answer arrives).
 */
export default function OracleCanvas({
  speaking,
  appearance,
  burst = 0,
}: {
  speaking: boolean;
  appearance?: Appearance;
  burst?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const apRef = useRef<Appearance>(appearance ?? DEFAULT_APPEARANCE);
  apRef.current = appearance ?? DEFAULT_APPEARANCE;
  const burstRef = useRef(burst);
  const particlesRef = useRef<Particle[]>([]);

  // When `burst` changes, spawn a pop of sparkles.
  useEffect(() => {
    if (burst === burstRef.current) return;
    burstRef.current = burst;
    const p = particlesRef.current;
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 1.6;
      p.push({
        x: (Math.random() - 0.5) * 40,
        y: -40 - Math.random() * 40,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 0.6,
        life: 0,
        max: 40 + Math.random() * 40,
        size: 2 + Math.random() * 3,
      });
    }
  }, [burst]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = 280;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const start = performance.now();

    function draw(now: number) {
      const t = (now - start) / 1000;
      const isSpeaking = speakingRef.current;
      const ap = apRef.current;
      const hasStaff = ap.hat === "wizard" || ap.hat === "gnome";
      ctx!.clearRect(0, 0, SIZE, SIZE);

      const bob = Math.sin(t * 2) * 4;
      const cx = SIZE / 2;
      ctx!.save();
      ctx!.translate(cx, 150 + bob);

      // ---- Staff (wizard/gnome only) ----
      if (hasStaff) {
        ctx!.save();
        ctx!.strokeStyle = "#6b4a2b";
        ctx!.lineWidth = 7;
        ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(70, -60);
        ctx!.lineTo(82, 95);
        ctx!.stroke();
        const pulse = isSpeaking ? 1 + Math.sin(t * 12) * 0.18 : 1 + Math.sin(t * 3) * 0.06;
        const orbR = 12 * pulse;
        const grad = ctx!.createRadialGradient(70, -66, 1, 70, -66, orbR * 1.8);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.5, ap.accent);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(70, -66, orbR * 1.8, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = "#fffef2";
        ctx!.beginPath();
        ctx!.arc(70, -66, orbR * 0.55, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      // ---- Robe (body) ----
      ctx!.fillStyle = ap.robeColor;
      ctx!.beginPath();
      ctx!.moveTo(-8, -10);
      ctx!.lineTo(8, -10);
      ctx!.lineTo(48, 100);
      ctx!.quadraticCurveTo(0, 112, -48, 100);
      ctx!.closePath();
      ctx!.fill();
      ctx!.strokeStyle = "rgba(255,255,255,0.25)";
      ctx!.lineWidth = 3;
      ctx!.stroke();

      // ---- Head ----
      ctx!.fillStyle = ap.skin;
      ctx!.beginPath();
      ctx!.arc(0, -28, 26, 0, Math.PI * 2);
      ctx!.fill();

      // ---- Eyes (with occasional blink) ----
      const blink = Math.sin(t * 1.7) > 0.97 ? 0.15 : 1;
      ctx!.fillStyle = "#2a1a4a";
      ctx!.beginPath();
      ctx!.ellipse(-9, -32, 3, 4 * blink, 0, 0, Math.PI * 2);
      ctx!.ellipse(9, -32, 3, 4 * blink, 0, 0, Math.PI * 2);
      ctx!.fill();

      // rosy cheeks
      ctx!.fillStyle = "rgba(255,140,140,0.35)";
      ctx!.beginPath();
      ctx!.arc(-14, -24, 5, 0, Math.PI * 2);
      ctx!.arc(14, -24, 5, 0, Math.PI * 2);
      ctx!.fill();

      // ---- Mouth (animates while speaking) ----
      ctx!.fillStyle = "#7a2e2e";
      ctx!.strokeStyle = "#7a2e2e";
      ctx!.lineWidth = 2;
      if (isSpeaking) {
        const open = (Math.sin(t * 16) * 0.5 + 0.5) * 7 + 1;
        ctx!.beginPath();
        ctx!.ellipse(0, -16, 5, open, 0, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        ctx!.beginPath();
        ctx!.arc(0, -20, 6, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx!.stroke();
      }

      // ---- Beard ----
      ctx!.fillStyle = ap.beardColor;
      ctx!.beginPath();
      ctx!.moveTo(-22, -22);
      ctx!.quadraticCurveTo(-30, 30, 0, 46);
      ctx!.quadraticCurveTo(30, 30, 22, -22);
      ctx!.quadraticCurveTo(12, -6, 0, -8);
      ctx!.quadraticCurveTo(-12, -6, -22, -22);
      ctx!.closePath();
      ctx!.fill();
      ctx!.beginPath();
      ctx!.ellipse(-7, -14, 7, 4, 0, 0, Math.PI * 2);
      ctx!.ellipse(7, -14, 7, 4, 0, 0, Math.PI * 2);
      ctx!.fill();

      // ---- Hat (varies by persona) ----
      drawHat(ctx!, ap, t);

      ctx!.restore();

      // ---- Sparkle particles (drawn in body space) ----
      ctx!.save();
      ctx!.translate(cx, 150 + bob);
      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.015; // slight gravity
        if (p.life >= p.max) {
          parts.splice(i, 1);
          continue;
        }
        const a = 1 - p.life / p.max;
        drawStar(ctx!, p.x, p.y, p.size, ap.accent, a);
      }
      ctx!.restore();

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="oracle" aria-hidden="true" />;
}

function drawHat(ctx: CanvasRenderingContext2D, ap: Appearance, t: number) {
  const sway = Math.sin(t * 1.5) * 8;
  switch (ap.hat) {
    case "wizard": {
      ctx.fillStyle = ap.hatColor;
      ctx.beginPath();
      ctx.moveTo(-30, -44);
      ctx.lineTo(30, -44);
      ctx.lineTo(sway, -130);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(ap.hatColor, -0.18);
      ctx.beginPath();
      ctx.ellipse(0, -44, 36, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      hatStars(ctx, ap.accent, t, sway);
      break;
    }
    case "gnome": {
      // Long floppy pointed cap, rounded tip, no brim.
      ctx.fillStyle = ap.hatColor;
      ctx.beginPath();
      ctx.moveTo(-28, -46);
      ctx.quadraticCurveTo(-10, -120, sway, -132);
      ctx.quadraticCurveTo(8, -118, 28, -46);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(sway, -132, 5, 0, Math.PI * 2); // pom-pom
      ctx.fill();
      break;
    }
    case "fedora": {
      ctx.fillStyle = shade(ap.hatColor, -0.1);
      ctx.beginPath();
      ctx.ellipse(0, -48, 40, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ap.hatColor;
      // crown
      ctx.beginPath();
      ctx.moveTo(-22, -50);
      ctx.lineTo(-18, -78);
      ctx.quadraticCurveTo(0, -84, 18, -78);
      ctx.lineTo(22, -50);
      ctx.closePath();
      ctx.fill();
      // band
      ctx.fillStyle = ap.accent;
      ctx.fillRect(-22, -56, 44, 6);
      break;
    }
    case "cork": {
      // bush hat: wide brim + rounded crown + dangling corks
      ctx.fillStyle = ap.hatColor;
      ctx.beginPath();
      ctx.ellipse(0, -46, 42, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -52, 22, Math.PI, 0, false);
      ctx.fill();
      ctx.fillStyle = "#e8d9a0";
      for (let i = -2; i <= 2; i++) {
        const x = i * 16;
        ctx.beginPath();
        ctx.moveTo(x, -44);
        ctx.lineTo(x, -34);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, -32, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "cowboy": {
      ctx.fillStyle = ap.hatColor;
      // curled wide brim
      ctx.beginPath();
      ctx.moveTo(-44, -46);
      ctx.quadraticCurveTo(0, -34, 44, -46);
      ctx.quadraticCurveTo(0, -54, -44, -46);
      ctx.closePath();
      ctx.fill();
      // crown with crease
      ctx.beginPath();
      ctx.moveTo(-20, -48);
      ctx.quadraticCurveTo(-22, -80, 0, -82);
      ctx.quadraticCurveTo(22, -80, 20, -48);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(ap.hatColor, -0.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -80);
      ctx.lineTo(0, -50);
      ctx.stroke();
      ctx.fillStyle = ap.accent;
      ctx.fillRect(-20, -54, 40, 4);
      break;
    }
    case "none":
    default: {
      // No hat — a little floating accent sparkle instead.
      hatStars(ctx, ap.accent, t, 0);
      break;
    }
  }
}

function hatStars(ctx: CanvasRenderingContext2D, color: string, t: number, sway: number) {
  const stars = [
    { x: -8, y: -70 },
    { x: 6, y: -92 },
    { x: -2, y: -112 },
  ];
  stars.forEach((s, i) => {
    const tw = Math.sin(t * 4 + i * 1.7) * 0.5 + 0.5;
    drawStar(ctx, s.x + sway * 0.2, s.y, 3 + tw * 2, color, tw);
  });
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, 0.3 + alpha * 0.7));
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(0, -r);
    ctx.rotate((Math.PI * 2) / 10);
    ctx.lineTo(0, -r * 0.45);
    ctx.rotate((Math.PI * 2) / 10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Lighten (positive) / darken (negative) a hex color by a fraction. */
function shade(hex: string, frac: number): string {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m.padEnd(6, "0").slice(0, 6);
  let r = parseInt(full.slice(0, 2), 16);
  let g = parseInt(full.slice(2, 4), 16);
  let b = parseInt(full.slice(4, 6), 16);
  const adj = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * frac)));
  r = adj(r);
  g = adj(g);
  b = adj(b);
  return `rgb(${r},${g},${b})`;
}
