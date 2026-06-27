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

      drawBackLayer(ctx!, ap, t);

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

      // ---- Torso / costume body ----
      drawTorso(ctx!, ap);
      drawPattern(ctx!, ap);

      // ---- Head ----
      ctx!.fillStyle = ap.skin;
      ctx!.beginPath();
      ctx!.arc(0, -28, 26, 0, Math.PI * 2);
      ctx!.fill();
      drawHair(ctx!, ap, t);

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
      drawFaceFeature(ctx!, ap);

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

      // ---- Costume accessory / handheld prop ----
      drawAccessory(ctx!, ap, t);
      drawHeldItem(ctx!, ap, t);

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

function drawBackLayer(ctx: CanvasRenderingContext2D, ap: Appearance, t: number) {
  if (ap.accessory === "cape" || ap.backItem === "star-cape") drawCape(ctx, ap);
  switch (ap.backItem) {
    case "turtle-shell":
      ctx.fillStyle = "#4f8d45";
      ctx.beginPath();
      ctx.ellipse(0, 44, 54, 66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2f5f2a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 102);
      ctx.moveTo(-38, 20);
      ctx.quadraticCurveTo(0, 42, 38, 20);
      ctx.moveTo(-44, 62);
      ctx.quadraticCurveTo(0, 82, 44, 62);
      ctx.stroke();
      break;
    case "twin-swords":
      drawBackSword(ctx, -0.55);
      drawBackSword(ctx, 0.55);
      break;
    case "dino-tail":
      ctx.fillStyle = shade(ap.robeColor, -0.18);
      ctx.beginPath();
      ctx.moveTo(22, 66);
      ctx.quadraticCurveTo(78, 76, 88, 118);
      ctx.quadraticCurveTo(50, 104, 12, 90);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ap.accent;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(38 + i * 10, 72 + i * 7);
        ctx.lineTo(48 + i * 10, 62 + i * 9);
        ctx.lineTo(50 + i * 8, 82 + i * 7);
        ctx.fill();
      }
      break;
    case "weather-vane":
      ctx.strokeStyle = "#cfd6e6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(54, -80);
      ctx.lineTo(54, 70);
      ctx.moveTo(34, -56);
      ctx.lineTo(74, -56);
      ctx.stroke();
      ctx.fillStyle = ap.accent;
      ctx.beginPath();
      ctx.moveTo(74, -56);
      ctx.lineTo(60, -66);
      ctx.lineTo(60, -46);
      ctx.closePath();
      ctx.fill();
      drawStar(ctx, 54, -84, 6 + Math.sin(t * 4) * 1.5, ap.accent, 0.8);
      break;
    case "backpack":
      ctx.fillStyle = shade(ap.robeColor, -0.28);
      ctx.beginPath();
      ctx.roundRect(-50, 10, 32, 72, 10);
      ctx.roundRect(18, 10, 32, 72, 10);
      ctx.fill();
      break;
    case "star-cape":
    case "none":
    default:
      break;
  }
}

function drawBackSword(ctx: CanvasRenderingContext2D, angle: number) {
  ctx.save();
  ctx.rotate(angle);
  ctx.strokeStyle = "#dfe6ee";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 84);
  ctx.lineTo(0, -72);
  ctx.stroke();
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-16, 46);
  ctx.lineTo(16, 46);
  ctx.stroke();
  ctx.restore();
}

function drawTorso(ctx: CanvasRenderingContext2D, ap: Appearance) {
  drawBaseBody(ctx, ap.robeColor);
  switch (ap.torsoStyle ?? "robe") {
    case "lab-coat":
    case "chef-coat":
      drawCoat(ctx, ap, ap.torsoStyle === "chef-coat" ? "#fff8e8" : "#f2f5f2");
      break;
    case "yellow-shirt":
      drawShirt(ctx, "#f2d64b", "#3456a3");
      break;
    case "martial-gi":
      drawMartialGi(ctx, ap);
      break;
    case "beach-shirt":
      drawOpenShirt(ctx, ap, "#e0a04f");
      break;
    case "collared-shirt":
      drawCollaredShirt(ctx);
      break;
    case "fry-cook":
      drawFryCook(ctx, ap);
      break;
    case "pirate-coat":
      drawPirateCoat(ctx, ap);
      break;
    case "tactical-suit":
      drawTacticalSuit(ctx, ap);
      break;
    case "detective-coat":
      drawOpenShirt(ctx, ap, "#5a4734");
      break;
    case "field-vest":
      drawFieldVest(ctx, ap);
      break;
    case "space-robe":
      drawSpaceRobe(ctx, ap);
      break;
    case "mechanic-coveralls":
      drawMechanic(ctx, ap);
      break;
    case "robe":
    default:
      break;
  }
}

function drawBaseBody(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-8, -10);
  ctx.lineTo(8, -10);
  ctx.lineTo(48, 100);
  ctx.quadraticCurveTo(0, 112, -48, 100);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawCoat(ctx: CanvasRenderingContext2D, ap: Appearance, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-22, -4);
  ctx.lineTo(-48, 96);
  ctx.quadraticCurveTo(-18, 106, 0, 92);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, -4);
  ctx.lineTo(48, 96);
  ctx.quadraticCurveTo(18, 106, 0, 92);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(ap.robeColor, -0.15);
  ctx.beginPath();
  ctx.moveTo(-10, 4);
  ctx.lineTo(0, 28);
  ctx.lineTo(10, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ap.accent;
  ctx.beginPath();
  ctx.arc(20, 28, 4, 0, Math.PI * 2);
  ctx.arc(24, 46, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawShirt(ctx: CanvasRenderingContext2D, shirt: string, pants: string) {
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(-32, -2);
  ctx.lineTo(32, -2);
  ctx.lineTo(42, 50);
  ctx.quadraticCurveTo(0, 62, -42, 50);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pants;
  ctx.beginPath();
  ctx.moveTo(-42, 50);
  ctx.quadraticCurveTo(0, 62, 42, 50);
  ctx.lineTo(48, 100);
  ctx.quadraticCurveTo(0, 112, -48, 100);
  ctx.closePath();
  ctx.fill();
}

function drawMartialGi(ctx: CanvasRenderingContext2D, ap: Appearance) {
  ctx.strokeStyle = "#1c5fd0";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-30, 28);
  ctx.lineTo(30, 58);
  ctx.moveTo(30, 28);
  ctx.lineTo(-30, 58);
  ctx.stroke();
  drawBelt(ctx, "#1c5fd0", ap.accent);
}

function drawOpenShirt(ctx: CanvasRenderingContext2D, ap: Appearance, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-36, 0);
  ctx.lineTo(-18, 88);
  ctx.lineTo(0, 20);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.lineTo(18, 88);
  ctx.lineTo(0, 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ap.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-24, 10);
  ctx.lineTo(-10, 80);
  ctx.moveTo(24, 10);
  ctx.lineTo(10, 80);
  ctx.stroke();
}

function drawCollaredShirt(ctx: CanvasRenderingContext2D) {
  drawShirt(ctx, "#fffdf5", "#6ca14e");
  ctx.fillStyle = "#fffdf5";
  ctx.beginPath();
  ctx.moveTo(-16, -4);
  ctx.lineTo(0, 18);
  ctx.lineTo(16, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-32, 52, 64, 7);
}

function drawFryCook(ctx: CanvasRenderingContext2D, ap: Appearance) {
  drawShirt(ctx, "#fffdf5", "#9b6731");
  ctx.fillStyle = "#d11f2e";
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.lineTo(12, 48);
  ctx.lineTo(0, 62);
  ctx.lineTo(-12, 48);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ap.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(-24, 24, 16, 10);
}

function drawPirateCoat(ctx: CanvasRenderingContext2D, ap: Appearance) {
  drawOpenShirt(ctx, ap, shade(ap.robeColor, -0.08));
  drawSash(ctx, "#b8192d");
  ctx.fillStyle = "#ffd66b";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-14, 22 + i * 16, 3, 0, Math.PI * 2);
    ctx.arc(14, 22 + i * 16, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTacticalSuit(ctx: CanvasRenderingContext2D, ap: Appearance) {
  ctx.fillStyle = "#1b1d22";
  ctx.fillRect(-32, 4, 64, 72);
  ctx.fillStyle = ap.robeColor;
  ctx.fillRect(-44, 8, 22, 76);
  ctx.fillRect(22, 8, 22, 76);
  ctx.fillStyle = "#101116";
  ctx.fillRect(-36, 48, 72, 10);
  ctx.fillStyle = ap.accent === "#111111" ? "#30333a" : ap.accent;
  ctx.fillRect(-26, 28, 14, 12);
  ctx.fillRect(12, 28, 14, 12);
}

function drawFieldVest(ctx: CanvasRenderingContext2D, ap: Appearance) {
  drawOpenShirt(ctx, ap, "#8c7449");
  ctx.fillStyle = "#d8bd7a";
  ctx.fillRect(-32, 28, 18, 14);
  ctx.fillRect(14, 28, 18, 14);
  ctx.fillRect(-26, 54, 16, 14);
  ctx.fillRect(10, 54, 16, 14);
}

function drawSpaceRobe(ctx: CanvasRenderingContext2D, ap: Appearance) {
  ctx.strokeStyle = ap.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-30, 10);
  ctx.quadraticCurveTo(0, 44, 30, 10);
  ctx.stroke();
  drawStar(ctx, -19, 39, 4, ap.accent, 0.9);
  drawStar(ctx, 20, 62, 3, ap.accent, 0.8);
}

function drawMechanic(ctx: CanvasRenderingContext2D, ap: Appearance) {
  ctx.fillStyle = shade(ap.robeColor, -0.06);
  ctx.fillRect(-30, 0, 60, 82);
  ctx.fillStyle = "#1f252e";
  ctx.fillRect(-34, 44, 68, 10);
  ctx.fillStyle = ap.accent;
  ctx.fillRect(-22, 18, 16, 12);
  ctx.fillRect(6, 18, 16, 12);
}

function drawPattern(ctx: CanvasRenderingContext2D, ap: Appearance) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  switch (ap.pattern) {
    case "stars":
      drawStar(ctx, -22, 34, 4, ap.accent, 0.9);
      drawStar(ctx, 18, 58, 3, ap.accent, 0.8);
      drawStar(ctx, 2, 78, 3, ap.accent, 0.7);
      break;
    case "fossil-bones":
      ctx.strokeStyle = ap.accent;
      ctx.lineWidth = 3;
      for (const y of [30, 58]) {
        ctx.beginPath();
        ctx.moveTo(-22, y);
        ctx.lineTo(22, y + 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-25, y - 1, 3, 0, Math.PI * 2);
        ctx.arc(-20, y + 4, 3, 0, Math.PI * 2);
        ctx.arc(20, y + 10, 3, 0, Math.PI * 2);
        ctx.arc(25, y + 15, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case "scales":
      ctx.strokeStyle = ap.accent;
      ctx.lineWidth = 2;
      for (let y = 24; y < 86; y += 14) {
        for (let x = -28; x <= 28; x += 16) {
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI);
          ctx.stroke();
        }
      }
      break;
    case "bubbles":
      ctx.strokeStyle = ap.accent;
      ctx.lineWidth = 2;
      for (const b of [{ x: -20, y: 28, r: 5 }, { x: 17, y: 45, r: 7 }, { x: -4, y: 72, r: 4 }]) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case "lightning":
      ctx.fillStyle = ap.accent;
      ctx.beginPath();
      ctx.moveTo(-6, 18);
      ctx.lineTo(10, 18);
      ctx.lineTo(0, 48);
      ctx.lineTo(16, 48);
      ctx.lineTo(-8, 88);
      ctx.lineTo(0, 56);
      ctx.lineTo(-14, 56);
      ctx.closePath();
      ctx.fill();
      break;
    case "circuit-lines":
      ctx.strokeStyle = ap.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-24, 28);
      ctx.lineTo(-4, 28);
      ctx.lineTo(-4, 50);
      ctx.lineTo(22, 50);
      ctx.moveTo(10, 50);
      ctx.lineTo(10, 76);
      ctx.stroke();
      ctx.fillStyle = ap.accent;
      for (const p of [{ x: -24, y: 28 }, { x: 22, y: 50 }, { x: 10, y: 76 }]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "leaf-veins":
      ctx.strokeStyle = ap.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.lineTo(0, 90);
      for (let y = 30; y < 82; y += 14) {
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(-18, y + 4, -26, y + 12);
        ctx.moveTo(0, y + 6);
        ctx.quadraticCurveTo(18, y + 10, 26, y + 18);
      }
      ctx.stroke();
      break;
    case "none":
    default:
      break;
  }
  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, ap: Appearance, t: number) {
  switch (ap.hair) {
    case "spiky-blue":
      ctx.fillStyle = "#9be7ff";
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const x = -28 + i * 7;
        const y = -54 - Math.sin(t * 2 + i) * 2;
        ctx.lineTo(x, -44);
        ctx.lineTo(x + 4, y - (i % 2) * 10);
      }
      ctx.lineTo(28, -44);
      ctx.closePath();
      ctx.fill();
      break;
    case "nervous-brown":
      ctx.fillStyle = "#7a4a28";
      ctx.beginPath();
      ctx.arc(0, -45, 24, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -48);
      ctx.quadraticCurveTo(2, -62, 12, -47);
      ctx.fill();
      break;
    case "orange-ears":
      ctx.fillStyle = "#f47b20";
      ctx.beginPath();
      ctx.ellipse(-26, -42, 11, 20, -0.45, 0, Math.PI * 2);
      ctx.ellipse(26, -42, 11, 20, 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "square-porous":
      ctx.fillStyle = "#f5d242";
      ctx.beginPath();
      ctx.roundRect(-24, -56, 48, 42, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(120,90,20,0.3)";
      for (const p of [{ x: -12, y: -45, r: 4 }, { x: 10, y: -50, r: 3 }, { x: 16, y: -32, r: 5 }]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "pirate-dreads":
      ctx.strokeStyle = "#2c1a12";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, -46);
        ctx.quadraticCurveTo(i * 9 + Math.sin(t + i) * 2, -18, i * 10, 2);
        ctx.stroke();
      }
      ctx.strokeStyle = "#b8192d";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-24, -48);
      ctx.lineTo(24, -48);
      ctx.stroke();
      break;
    case "bald":
    case "none":
    default:
      break;
  }
}

function drawFaceFeature(ctx: CanvasRenderingContext2D, ap: Appearance) {
  switch (ap.faceFeature) {
    case "goggles":
      drawGlasses(ctx, ap.accent);
      break;
    case "sunglasses":
      ctx.fillStyle = "#101116";
      ctx.beginPath();
      ctx.roundRect(-21, -38, 17, 11, 4);
      ctx.roundRect(4, -38, 17, 11, 4);
      ctx.fill();
      ctx.strokeStyle = "#101116";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, -33);
      ctx.lineTo(4, -33);
      ctx.stroke();
      break;
    case "round-glasses":
      ctx.strokeStyle = "#2a1a4a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-9, -32, 8, 0, Math.PI * 2);
      ctx.arc(9, -32, 8, 0, Math.PI * 2);
      ctx.moveTo(-1, -32);
      ctx.lineTo(1, -32);
      ctx.stroke();
      break;
    case "mask":
      drawMask(ctx);
      break;
    case "beard-stache":
      ctx.fillStyle = shade(ap.beardColor, -0.2);
      ctx.beginPath();
      ctx.ellipse(-8, -18, 11, 5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(8, -18, 11, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "eye-patch":
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.ellipse(-9, -32, 9, 7, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-25, -46);
      ctx.lineTo(22, -23);
      ctx.stroke();
      break;
    case "none":
    default:
      break;
  }
}

function drawCape(ctx: CanvasRenderingContext2D, ap: Appearance) {
  ctx.fillStyle = shade(ap.robeColor, -0.22);
  ctx.beginPath();
  ctx.moveTo(-30, -8);
  ctx.quadraticCurveTo(-62, 45, -48, 108);
  ctx.quadraticCurveTo(0, 126, 48, 108);
  ctx.quadraticCurveTo(62, 45, 30, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ap.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, -6);
  ctx.quadraticCurveTo(0, 12, 24, -6);
  ctx.stroke();
}

function drawAccessory(ctx: CanvasRenderingContext2D, ap: Appearance, t: number) {
  switch (ap.accessory) {
    case "glasses":
    case "lab-goggles":
      drawGlasses(ctx, ap.accessory === "lab-goggles" ? ap.accent : "#2a1a4a");
      break;
    case "pirate-sash":
      drawSash(ctx, "#b8192d");
      break;
    case "sword":
      drawSword(ctx, ap.accent);
      break;
    case "portal-gadget":
      drawPortalGadget(ctx, ap.accent, t);
      break;
    case "martial-belt":
      drawBelt(ctx, "#1b1b1b", ap.accent);
      break;
    case "spatula":
      drawSpatula(ctx);
      break;
    case "telescope":
      drawTelescope(ctx, ap.accent);
      break;
    case "fossil-badge":
      drawBadge(ctx, "#d9b56d", "fossil");
      break;
    case "mask":
      drawMask(ctx);
      break;
    case "microphone":
      drawMicrophone(ctx, ap.accent);
      break;
    case "book":
      drawBook(ctx, ap.accent);
      break;
    case "plant":
      drawPlant(ctx, ap.accent);
      break;
    case "wrench":
      drawWrench(ctx);
      break;
    case "star-map":
      drawBadge(ctx, ap.accent, "star");
      break;
    case "cape":
    case "none":
    default:
      break;
  }
}

function drawHeldItem(ctx: CanvasRenderingContext2D, ap: Appearance, t: number) {
  switch (ap.heldItem) {
    case "portal-gun":
      drawPortalGadget(ctx, ap.accent, t);
      break;
    case "flask":
      drawFlask(ctx, ap.accent, t);
      break;
    case "fossil-brush":
      drawBrush(ctx);
      break;
    case "rock-hammer":
      drawRockHammer(ctx);
      break;
    case "telescope":
      drawTelescope(ctx, ap.accent);
      break;
    case "red-flashlight":
      drawFlashlight(ctx);
      break;
    case "spatula":
      drawSpatula(ctx);
      break;
    case "compass":
      drawCompass(ctx, ap.accent);
      break;
    case "sword":
      drawSword(ctx, ap.accent);
      break;
    case "wrench":
      drawWrench(ctx);
      break;
    case "book":
      drawBook(ctx, ap.accent);
      break;
    case "microphone":
      drawMicrophone(ctx, ap.accent);
      break;
    case "plant-shears":
      drawShears(ctx, ap.accent);
      break;
    case "none":
    default:
      break;
  }
}

function drawFlask(ctx: CanvasRenderingContext2D, accent: string, t: number) {
  ctx.save();
  ctx.translate(42, 28);
  ctx.rotate(0.18);
  ctx.strokeStyle = "#dce7ef";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4, -26);
  ctx.lineTo(-4, -8);
  ctx.quadraticCurveTo(-17, 12, -9, 26);
  ctx.quadraticCurveTo(0, 36, 9, 26);
  ctx.quadraticCurveTo(17, 12, 4, -8);
  ctx.lineTo(4, -26);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.ellipse(0, 18 + Math.sin(t * 4) * 1.5, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBrush(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(42, 34);
  ctx.rotate(0.55);
  ctx.strokeStyle = "#8b5a2b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.lineTo(0, -14);
  ctx.stroke();
  ctx.fillStyle = "#d8bd7a";
  ctx.beginPath();
  ctx.ellipse(0, -23, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRockHammer(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(42, 32);
  ctx.rotate(0.5);
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 36);
  ctx.lineTo(0, -10);
  ctx.stroke();
  ctx.fillStyle = "#8d98a3";
  ctx.beginPath();
  ctx.moveTo(-18, -22);
  ctx.lineTo(18, -14);
  ctx.lineTo(4, -4);
  ctx.lineTo(-18, -10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlashlight(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(42, 26);
  ctx.rotate(-0.6);
  ctx.fillStyle = "#303642";
  ctx.fillRect(-6, -7, 30, 14);
  ctx.fillStyle = "#ff4f5e";
  ctx.beginPath();
  ctx.arc(25, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,79,94,0.18)";
  ctx.beginPath();
  ctx.moveTo(29, -7);
  ctx.lineTo(76, -24);
  ctx.lineTo(76, 24);
  ctx.lineTo(29, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCompass(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save();
  ctx.translate(38, 38);
  ctx.fillStyle = "#b8863b";
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7d6";
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(4, 2);
  ctx.lineTo(0, 9);
  ctx.lineTo(-4, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawShears(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save();
  ctx.translate(39, 34);
  ctx.rotate(0.4);
  ctx.strokeStyle = "#c7d0db";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(18, -24);
  ctx.moveTo(0, 15);
  ctx.lineTo(-14, -22);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-7, 24, 7, 0, Math.PI * 2);
  ctx.arc(7, 24, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGlasses(ctx: CanvasRenderingContext2D, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-20, -38, 15, 11, 4);
  ctx.roundRect(5, -38, 15, 11, 4);
  ctx.moveTo(-5, -33);
  ctx.lineTo(5, -33);
  ctx.stroke();
}

function drawSash(ctx: CanvasRenderingContext2D, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(34, 78);
  ctx.stroke();
  ctx.fillStyle = "#ffd66b";
  ctx.beginPath();
  ctx.arc(28, 70, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawSword(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save();
  ctx.translate(40, 36);
  ctx.rotate(-0.35);
  ctx.strokeStyle = "#dfe6ee";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(0, -38);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-13, 21);
  ctx.lineTo(13, 21);
  ctx.stroke();
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(-4, 22, 8, 24);
  ctx.restore();
}

function drawPortalGadget(ctx: CanvasRenderingContext2D, accent: string, t: number) {
  ctx.save();
  ctx.translate(-42, 24);
  ctx.rotate(0.18);
  ctx.fillStyle = "#dce7ef";
  ctx.fillRect(-6, -8, 18, 30);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(3, -2, 5 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(5, -8);
  ctx.lineTo(19, -22);
  ctx.stroke();
  ctx.restore();
}

function drawBelt(ctx: CanvasRenderingContext2D, color: string, accent: string) {
  ctx.fillStyle = color;
  ctx.fillRect(-32, 50, 64, 9);
  ctx.fillStyle = accent;
  ctx.fillRect(-7, 48, 14, 13);
}

function drawSpatula(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(41, 26);
  ctx.rotate(0.35);
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(0, -8);
  ctx.stroke();
  ctx.fillStyle = "#cfd6e6";
  ctx.fillRect(-9, -24, 18, 16);
  ctx.restore();
}

function drawTelescope(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save();
  ctx.translate(37, 4);
  ctx.rotate(-0.38);
  ctx.fillStyle = "#30445c";
  ctx.fillRect(-28, -7, 44, 14);
  ctx.fillStyle = accent;
  ctx.fillRect(14, -9, 12, 18);
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, 7);
  ctx.lineTo(-18, 38);
  ctx.moveTo(0, 7);
  ctx.lineTo(18, 38);
  ctx.stroke();
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, color: string, kind: "fossil" | "star") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(24, 18, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a1a4a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (kind === "star") {
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(24 + Math.cos((i * Math.PI * 2) / 5 - Math.PI / 2) * 7, 18 + Math.sin((i * Math.PI * 2) / 5 - Math.PI / 2) * 7);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(18, 19);
    ctx.quadraticCurveTo(24, 10, 30, 19);
    ctx.moveTo(20, 22);
    ctx.lineTo(28, 22);
  }
  ctx.stroke();
}

function drawMask(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#1f1f25";
  ctx.beginPath();
  ctx.ellipse(-10, -31, 10, 8, -0.15, 0, Math.PI * 2);
  ctx.ellipse(10, -31, 10, 8, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-9, -32, 4, 2, 0, 0, Math.PI * 2);
  ctx.ellipse(9, -32, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawMicrophone(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save();
  ctx.translate(39, 8);
  ctx.rotate(-0.25);
  ctx.fillStyle = "#20242c";
  ctx.beginPath();
  ctx.ellipse(0, -14, 8, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.lineTo(6, -14);
  ctx.stroke();
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, 34);
  ctx.stroke();
  ctx.restore();
}

function drawBook(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.fillStyle = shade(accent, -0.25);
  ctx.beginPath();
  ctx.moveTo(-34, 22);
  ctx.lineTo(-4, 14);
  ctx.lineTo(-4, 50);
  ctx.lineTo(-34, 58);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(accent, 0.18);
  ctx.beginPath();
  ctx.moveTo(-4, 14);
  ctx.lineTo(26, 22);
  ctx.lineTo(26, 58);
  ctx.lineTo(-4, 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fffdf5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, 14);
  ctx.lineTo(-4, 50);
  ctx.stroke();
}

function drawPlant(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(-42, 42, 18, 16);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(-37, 36, 8, 4, -0.7, 0, Math.PI * 2);
  ctx.ellipse(-28, 34, 8, 4, 0.7, 0, Math.PI * 2);
  ctx.ellipse(-33, 28, 5, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWrench(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(40, 30);
  ctx.rotate(0.45);
  ctx.strokeStyle = "#c7d0db";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 36);
  ctx.lineTo(0, -22);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -28, 10, 0.3 * Math.PI, 1.7 * Math.PI);
  ctx.stroke();
  ctx.restore();
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
