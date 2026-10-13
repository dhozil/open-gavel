"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, Gavel } from "lucide-react";
import cityStreet from "@/assets/city-street.jpg";

/* ==========================================================================
 * CrowdCanvas — procedural, skeleton-driven pedestrians.
 * Each person has a real 2-bone leg rig solved with IK. Feet in stance are
 * locked to the ground in world space (no foot sliding), heel-to-toe roll,
 * hip bob synced to the gait, counter-swinging arms with elbows, and
 * character-specific props (phone, skateboard, boombox, briefcase, coffee).
 * Source: user's gen-z-strides material, integrated verbatim.
 * ======================================================================== */

interface CrowdCanvasProps {
  density?: number;
  greetings?: string[];
}

/** Crowd chatter — community voices about moderation life. Never validator
 *  counts: the committee size is a network property, not a crowd fact. */
const DEFAULT_GREETINGS = [
  "Verdict: ALLOW. Rule cited.",
  "Just filed a report — watch it get judged.",
  "The reasoning is public. Go read it.",
  "No single admin decided this.",
  "My appeal got a fair second look.",
  "Same rules for everyone, every time.",
  "Disagree with a verdict? Appeal it.",
  "Check the evidence trail below.",
  "WARN, not a ban. Proportional.",
  "The rulebook updated — see what's new.",
  "Every verdict shows its work.",
  "Three appeals each. No exceptions.",
];

type Kind = "phone" | "skater" | "boombox" | "office" | "coffee" | "headphones";
type Hair = "short" | "curly" | "long" | "pony" | "bun" | "buzz";
type Hat = "none" | "cap" | "beanie";

interface Person {
  kind: Kind;
  x: number;
  y: number;
  yn: number;
  dir: 1 | -1;
  k: number; // units -> px
  v: number; // units / sec
  stride: number;
  cycle: number; // sec per gait cycle
  phase: number;
  bob: number;
  lean: number;
  thigh: number;
  shin: number;
  torso: number;
  headR: number;
  skin: string;
  hairColor: string;
  hair: Hair;
  hat: Hat;
  hatColor: string;
  top: string;
  top2: string;
  pants: string;
  shoe: string;
  sole: string;
  skirt: boolean;
  hood: boolean;
  backpack: string | null;
  // skater state
  sk: { mode: 0 | 1 | 2 | 3; t: number; dur: number; wheel: number };
  noteT: number;
  t: number;
}

interface Note {
  x: number;
  y: number;
  vx: number;
  life: number;
  ch: string;
}

const SKINS = ["#f6d2b6", "#e9b48e", "#cf9468", "#a36a45", "#6e4429"];
const HAIRS = ["#1c1b1f", "#3a2417", "#6b4528", "#b9874f", "#ff7aa8", "#8fd3ff", "#c6a8ff"];
const TOPS = ["#ff6b4a", "#2d3142", "#f4d35e", "#3d7c6b", "#e8e1d3", "#7b5cd6", "#e2557c", "#4f8fe0", "#ff9f1c"];
const PANTS = ["#26262e", "#3c4a6b", "#7b6b55", "#5b6770", "#1f3b4d", "#c9bba3"];
const SHOES: Array<[string, string]> = [
  ["#ffffff", "#d9d9d9"],
  ["#1c1b1f", "#ffffff"],
  ["#ff6b4a", "#ffffff"],
  ["#f4d35e", "#1c1b1f"],
];

const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0] as T;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => clamp(Math.round(((n >> s) & 255) * f), 0, 255);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

type P2 = { x: number; y: number };

/** 2-bone IK. bendSign 1 = joint points forward (+x), -1 = backward. */
function ik(a: P2, b: P2, l1: number, l2: number, bendSign: 1 | -1): P2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = clamp(Math.hypot(dx, dy), 0.001, l1 + l2 - 0.001);
  const th = Math.atan2(dy, dx);
  const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = th - bendSign * al;
  return { x: a.x + Math.cos(ang) * l1, y: a.y + Math.sin(ang) * l1 };
}

const KIND_SPEC: Record<Kind, { v: [number, number]; stride: [number, number]; bob: number; lean: number }> = {
  phone: { v: [22, 27], stride: [20, 24], bob: 1.2, lean: 0.1 },
  skater: { v: [52, 64], stride: [0, 0], bob: 0, lean: 0.08 },
  boombox: { v: [27, 32], stride: [24, 27], bob: 2.6, lean: -0.02 },
  office: { v: [37, 44], stride: [29, 32], bob: 1.4, lean: 0.07 },
  coffee: { v: [30, 35], stride: [24, 27], bob: 1.5, lean: 0.03 },
  headphones: { v: [33, 38], stride: [26, 29], bob: 1.8, lean: 0.05 },
};

function makePerson(W: number, H: number, onScreen: boolean): Person {
  const r = Math.random();
  const kind: Kind =
    r < 0.2 ? "phone" : r < 0.36 ? "skater" : r < 0.5 ? "boombox" : r < 0.7 ? "office" : r < 0.85 ? "coffee" : "headphones";
  const spec = KIND_SPEC[kind];
  const yn = Math.random();
  const y = H * 0.745 + yn * H * 0.17; // on the plaza of the city backdrop
  const base = Math.max(0.75, Math.min(1.5, H / 760));
  const k = (0.62 + yn * 0.6) * base;
  const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const v = rand(...spec.v);
  const stride = rand(...spec.stride);
  const tall = rand(0.94, 1.06);
  const office = kind === "office";
  const [shoe, sole] = office ? (["#2a1d17", "#120c09"] as [string, string]) : pick(SHOES);
  const skirt = !office && kind !== "skater" && Math.random() < 0.22;
  const hair: Hair = office ? pick(["short", "bun", "buzz"] as const) : pick(["short", "curly", "long", "pony", "bun", "buzz"] as const);
  const hatRoll = Math.random();
  const hat: Hat =
    office || kind === "headphones" ? "none" : hatRoll < 0.18 ? "cap" : hatRoll < 0.3 ? "beanie" : "none";
  const x = onScreen ? rand(0, W) : dir === 1 ? -80 : W + 80;
  return {
    kind,
    x,
    y,
    yn,
    dir,
    k,
    v,
    stride,
    cycle: stride > 0 ? (2 * stride) / v : 1,
    phase: Math.random(),
    bob: spec.bob,
    lean: spec.lean,
    thigh: 22 * tall,
    shin: 22 * tall,
    torso: 29 * tall,
    headR: 7.4,
    skin: pick(SKINS),
    hairColor: office ? pick(HAIRS.slice(0, 4)) : pick(HAIRS),
    hair,
    hat,
    hatColor: pick(TOPS),
    top: office ? pick(["#2d3142", "#3a3f4f", "#5b5148", "#1f3b4d"]) : pick(TOPS),
    top2: pick(TOPS),
    pants: office ? "#262833" : pick(PANTS),
    shoe,
    sole,
    skirt,
    hood: !office && Math.random() < 0.45,
    backpack: !office && kind !== "boombox" && Math.random() < 0.3 ? pick(TOPS) : null,
    sk: { mode: 2, t: rand(0, 1), dur: rand(1, 1.8), wheel: 0 },
    noteT: rand(0, 0.6),
    t: Math.random() * 10,
  };
}

/* ------------------------------------------------------------ drawing */

function seg(ctx: CanvasRenderingContext2D, pts: P2[], w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

interface Foot {
  ankle: P2;
  angle: number; // foot pitch, + = heel up
}

/** Gait foot for phase q in [0,1). Stance locks the toe/heel in world space. */
function gaitFoot(q: number, S: number, lift: number): Foot {
  const beta = 0.6;
  const FL = 8;
  if (q < beta) {
    const s = q / beta;
    const fx = S / 2 - S * s; // moves back at exactly body speed -> planted
    let angle = 0;
    if (s < 0.2) angle = -0.28 * (1 - ease(s / 0.2)); // heel strike, toe rolls down smoothly
    else if (s > 0.55) angle = 0.35 * ease((s - 0.55) / 0.45); // casual push-off, never a tiptoe launch
    if (angle > 0) {
      // pivot around the toe tip at (fx+FL, 0)
      const tx = fx + FL;
      return { ankle: { x: tx - Math.cos(angle) * FL, y: -3.5 - Math.sin(angle) * FL }, angle };
    }
    if (angle < 0) {
      // pivot around heel at (fx, 0)
      return { ankle: { x: fx, y: -3.5 }, angle };
    }
    return { ankle: { x: fx, y: -3.5 }, angle };
  }
  const s = (q - beta) / (1 - beta);
  const e = ease(s);
  // Hermite swing: foot leaves and lands with zero world velocity (no snap/slap)
  // Push-off and landing angles stay shallow (±0.35/∓0.28 max) so the foot
  // travels level instead of pointing like a dancer. Matches stance end/start.
  const A0 = 0.35;
  const x0 = -S / 2 + FL - Math.cos(A0) * FL;
  const x1 = S / 2;
  const m = (-S * (1 - beta)) / beta;
  const s2 = s * s;
  const s3 = s2 * s;
  const fx = (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * m;
  const heelUp = Math.sin(A0) * FL * (1 - ease(Math.min(1, s * 1.4)));
  const fy = -3.5 - heelUp - lift * Math.pow(Math.sin(Math.PI * s), 2) * 0.7;
  const angle = A0 * (1 - e) - 0.28 * e;
  return { ankle: { x: fx, y: fy }, angle };
}

function drawShoe(ctx: CanvasRenderingContext2D, f: Foot, p: Person, dark: boolean) {
  const a = f.angle;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // local foot frame: x forward along sole, ankle sits 3.5 above heel
  const tf = (lx: number, ly: number): P2 => ({
    x: f.ankle.x + lx * c - (ly + 3.5) * -s,
    y: f.ankle.y + lx * s + (ly + 3.5) * c,
  });
  const heel = tf(-1.5, 0);
  const toe = tf(9, 0);
  const top1 = tf(-1.5, -4);
  const top2 = tf(4, -4.5);
  const toeTop = tf(9.5, -1.8);
  ctx.fillStyle = dark ? shade(p.shoe, 0.75) : p.shoe;
  ctx.beginPath();
  ctx.moveTo(heel.x, heel.y);
  ctx.lineTo(top1.x, top1.y);
  ctx.lineTo(top2.x, top2.y);
  ctx.quadraticCurveTo(toeTop.x, toeTop.y, toe.x, toe.y);
  ctx.closePath();
  ctx.fill();
  seg(ctx, [heel, toe], 1.8, dark ? shade(p.sole, 0.75) : p.sole);
}

function drawLeg(ctx: CanvasRenderingContext2D, p: Person, hip: P2, f: Foot, dark: boolean, planted: number) {
  // planted = smooth stance weight (1 = loaded, 0 = swinging). Loaded knees
  // press straight onto the bone line; swinging knees bend fully.
  let knee = ik(hip, f.ankle, p.thigh, p.shin, 1);
  if (planted > 0) {
    const dx = f.ankle.x - hip.x;
    const dy = f.ankle.y - hip.y;
    const d2 = dx * dx + dy * dy || 1;
    const t = clamp(((knee.x - hip.x) * dx + (knee.y - hip.y) * dy) / d2, 0, 1);
    knee = {
      x: knee.x + (hip.x + dx * t - knee.x) * planted,
      y: knee.y + (hip.y + dy * t - knee.y) * planted,
    };
  }
  const col = dark ? shade(p.pants, 0.72) : p.pants;
  if (p.skirt) {
    // shorts: skin leg underneath, fabric rides along the thigh so it moves with the leg
    const skin = dark ? shade(p.skin, 0.82) : p.skin;
    seg(ctx, [knee, f.ankle], 5, skin);
    seg(ctx, [hip, knee], 6.5, skin);
    const hem = { x: hip.x + (knee.x - hip.x) * 0.62, y: hip.y + (knee.y - hip.y) * 0.62 };
    seg(ctx, [hip, hem], 9.5, col);
    seg(ctx, [hem, { x: hem.x + (knee.x - hip.x) * 0.04, y: hem.y + (knee.y - hip.y) * 0.04 }], 9.5, shade(p.pants, dark ? 0.6 : 0.85));
  } else {
    seg(ctx, [hip, knee], 8, col);
    seg(ctx, [knee, f.ankle], p.kind === "office" ? 6.5 : 7, col);
  }
  drawShoe(ctx, f, p, dark);
}

function armFK(sh: P2, ua: number, bend: number, l: number): [P2, P2] {
  const e = { x: sh.x + Math.sin(ua) * l, y: sh.y + Math.cos(ua) * l };
  const fa = ua + bend;
  return [e, { x: e.x + Math.sin(fa) * l, y: e.y + Math.cos(fa) * l }];
}

function drawArm(ctx: CanvasRenderingContext2D, p: Person, sh: P2, el: P2, hand: P2, dark: boolean) {
  const sleeve = dark ? shade(p.top, 0.72) : p.top;
  const skin = dark ? shade(p.skin, 0.82) : p.skin;
  const shortSleeve = p.kind !== "office" && !p.hood && p.top !== p.top2 && (p.top.charCodeAt(2) & 1) === 0;
  seg(ctx, [sh, el], 6, sleeve);
  if (shortSleeve) {
    seg(ctx, [el, hand], 4.4, skin);
  } else {
    const mid = { x: el.x + (hand.x - el.x) * 0.78, y: el.y + (hand.y - el.y) * 0.78 };
    seg(ctx, [el, mid], 5.4, sleeve);
  }
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 2.6, 0, TAU);
  ctx.fill();
}

function drawHead(ctx: CanvasRenderingContext2D, p: Person, neck: P2, tilt: number, nod: number, swing: number) {
  const r = p.headR;
  ctx.save();
  ctx.translate(neck.x, neck.y);
  ctx.rotate(tilt + nod);
  // neck
  seg(ctx, [{ x: 0, y: 2 }, { x: 0.6, y: -3 }], 4.5, shade(p.skin, 0.9));
  const hx = 1.2;
  const hy = -3 - r;
  ctx.fillStyle = p.hairColor;
  // back hair layers (behind head)
  if (p.hair === "long") {
    rr(ctx, hx - r - 1, hy - 2, r * 1.3, r * 2.5, 4);
    ctx.fill();
  }
  if (p.hair === "pony") {
    ctx.save();
    ctx.translate(hx - r + 1, hy - 1);
    ctx.rotate(0.5 + swing * 0.25);
    rr(ctx, -2.5, 0, 5, 13, 3);
    ctx.fill();
    ctx.restore();
  }
  if (p.hair === "bun") {
    ctx.beginPath();
    ctx.arc(hx - r * 0.6, hy - r * 0.85, 3.6, 0, TAU);
    ctx.fill();
  }
  // face
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.95, r, 0, 0, TAU);
  ctx.fill();
  // nose
  ctx.beginPath();
  ctx.ellipse(hx + r * 0.92, hy + 1.2, 1.4, 1.6, 0, 0, TAU);
  ctx.fill();
  // ear
  ctx.fillStyle = shade(p.skin, 0.88);
  ctx.beginPath();
  ctx.arc(hx - 1.2, hy + 0.8, 1.7, 0, TAU);
  ctx.fill();
  // eye
  ctx.fillStyle = "#1c1b1f";
  ctx.beginPath();
  ctx.arc(hx + r * 0.52, hy - 0.4, 0.95, 0, TAU);
  ctx.fill();
  // cheek blush
  ctx.fillStyle = "rgba(255,120,120,0.25)";
  ctx.beginPath();
  ctx.arc(hx + r * 0.4, hy + 2.6, 1.6, 0, TAU);
  ctx.fill();

  // top hair
  ctx.fillStyle = p.hairColor;
  if (p.hair === "curly") {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI * 0.95;
      ctx.beginPath();
      ctx.arc(hx - 0.5 + Math.cos(a) * r * 0.9, hy - 0.5 + Math.sin(a) * r * 0.9, 3.1, 0, TAU);
      ctx.fill();
    }
  } else if (p.hair === "buzz") {
    ctx.beginPath();
    ctx.ellipse(hx - 0.6, hy - 1.2, r * 0.98, r * 0.86, 0, Math.PI * 0.95, Math.PI * 2.02);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(hx - 0.8, hy - 1.4, r * 1.05, r * 0.95, 0, Math.PI * 0.82, Math.PI * 2.05);
    ctx.quadraticCurveTo(hx + r * 0.3, hy - 2.4, hx - r * 0.6, hy + 1);
    ctx.fill();
    // fringe
    ctx.beginPath();
    ctx.ellipse(hx + r * 0.45, hy - r * 0.55, r * 0.55, r * 0.32, -0.35, 0, TAU);
    ctx.fill();
  }

  // hats
  if (p.hat === "cap") {
    ctx.fillStyle = p.hatColor;
    ctx.beginPath();
    ctx.ellipse(hx - 0.4, hy - 2.4, r * 1.04, r * 0.82, 0, Math.PI, TAU);
    ctx.fill();
    rr(ctx, hx + 1, hy - 3.6, r + 4, 2.2, 1.1);
    ctx.fill();
  } else if (p.hat === "beanie") {
    ctx.fillStyle = p.hatColor;
    ctx.beginPath();
    ctx.ellipse(hx - 0.4, hy - 2.2, r * 1.06, r * 1.05, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = shade(p.hatColor, 0.8);
    rr(ctx, hx - r - 1, hy - 3.6, r * 2.1, 3, 1.5);
    ctx.fill();
  }
  if (p.kind === "headphones") {
    ctx.strokeStyle = "#1c1b1f";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(hx - 0.8, hy, r + 1.4, Math.PI * 1.15, Math.PI * 1.75);
    ctx.stroke();
    ctx.fillStyle = p.top2;
    rr(ctx, hx - 4.5, hy - 2.5, 5.5, 7, 2.5);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx: CanvasRenderingContext2D, p: Person) {
  const ph = p.phase;
  const swing = Math.sin(ph * TAU);
  let hipY: number;
  let fNear: Foot;
  let fFar: Foot;
  let lean = p.lean;
  let nod = 0;
  // smooth stance weights (1 = loaded straight, 0 = swinging bent);
  // skaters stay planted.
  let wN = 1;
  let wF = 1;

  if (p.kind === "skater") {
    const sk = p.sk;
    const ride = -9.5;
    // the resting foot stays on the board (far layer); the NEAR foot — the
    // one facing the viewer — does the pushing, so the stroke reads clearly.
    fFar = { ankle: { x: 7, y: ride }, angle: 0 };
    let push: Foot = { ankle: { x: -9, y: ride }, angle: 0 };
    const s = clamp(sk.t / sk.dur, 0, 1);
    hipY = -(p.thigh + p.shin) * 0.98 + ride; // upright stance
    if (sk.mode === 0) {
      // reach forward to ground
      const e = ease(s);
      push = { ankle: { x: -9 + 12 * e, y: ride + (ride * -1 - 3.5) * e - 5 * Math.sin(Math.PI * s) }, angle: -0.1 * e };
      hipY += 3 * e;
      lean += 0.12 * e;
    } else if (sk.mode === 1) {
      // planted push: foot moves back at board speed
      push = { ankle: { x: 3 - 26 * s, y: -3.5 }, angle: s > 0.6 ? 0.5 * (s - 0.6) / 0.4 : 0 };
      hipY += 3;
      lean += 0.12;
    } else if (sk.mode === 3) {
      const e = ease(s);
      push = { ankle: { x: -23 + 14 * e, y: -3.5 + (ride + 3.5) * e - 5 * Math.sin(Math.PI * s) }, angle: 0.2 * (1 - e) };
      hipY += 3 * (1 - e);
      lean += 0.12 * (1 - e);
    } else {
      hipY += Math.sin(p.t * 1.4) * 0.6;
    }
    fNear = push;
    // board
    ctx.fillStyle = "#1c1b1f";
    rr(ctx, -18, -7.6, 36, 2.6, 1.3);
    ctx.fill();
    ctx.fillStyle = p.top2;
    rr(ctx, -18, -5.6, 36, 1.4, 0.7);
    ctx.fill();
    for (const wx of [-11, 11]) {
      ctx.fillStyle = "#f4d35e";
      ctx.beginPath();
      ctx.arc(wx, -2.5, 2.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#1c1b1f";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(wx, -2.5);
      ctx.lineTo(wx + Math.cos(sk.wheel) * 2.5, -2.5 + Math.sin(sk.wheel) * 2.5);
      ctx.stroke();
    }
  } else {
    const lift = p.kind === "boombox" ? 2.8 : 2.2;
    fNear = gaitFoot(ph % 1, p.stride, lift);
    fFar = gaitFoot((ph + 0.5) % 1, p.stride, lift);
    // Inverted pendulum: the hip rides on top of the planted leg, kept almost
    // straight (97% extension) -> upright walking, natural rise & fall.
    const L = (p.thigh + p.shin) * 0.97;
    const heightOver = (f: Foot) => f.ankle.y - Math.sqrt(Math.max(1, L * L - f.ankle.x * f.ankle.x));
    const qN = ph % 1;
    const qF = (ph + 0.5) % 1;
    // Weighted soft-max over planted feet; weights fade in/out with zero
    // end-velocity (smoothstep, not linear ramps) so weight transfer — and
    // therefore the hip — never jerks at contact or lift-off.
    const sstep = (t: number) => {
      const c = clamp(t, 0, 1);
      return c * c * (3 - 2 * c);
    };
    const wOf = (q: number) => (q < 0.6 ? sstep(q / 0.1) * (1 - sstep((q - 0.5) / 0.1)) : 0);
    const cands: Array<[number, number]> = [];
    const wNl = wOf(qN);
    const wFl = wOf(qF);
    if (wNl > 0) cands.push([heightOver(fNear), wNl]);
    if (wFl > 0) cands.push([heightOver(fFar), wFl]);
    wN = wNl;
    wF = wFl;
    const KS = 0.8;
    const mx = Math.max(...cands.map((c) => c[0]));
    const sum = cands.reduce((acc, [h, w]) => acc + w * Math.exp(KS * (h - mx)), 0);
    hipY = mx + Math.log(Math.max(1e-3, sum)) / KS;
    if (p.kind === "boombox") nod = Math.sin(ph * TAU * 2) * 0.1;
  }

  const hip = { x: 0, y: hipY };
  const shoulder = { x: Math.sin(lean) * p.torso, y: hipY - Math.cos(lean) * p.torso };
  const shF = { x: shoulder.x - 1.5, y: shoulder.y + 2 };
  const shN = { x: shoulder.x + 1, y: shoulder.y + 2 };
  const armL = 12.5;

  // ---- arm targets
  let farArm: [P2, P2];
  let nearArm: [P2, P2];
  const A = p.kind === "office" ? 0.5 : 0.42;
  const fwdBend = (s: number) => 0.25 + 0.45 * Math.max(0, s);
  if (p.kind === "phone") {
    const hand = { x: shoulder.x + 11, y: shoulder.y + 10 };
    farArm = [ik(shF, { x: hand.x - 1, y: hand.y }, armL, armL, -1), { x: hand.x - 1, y: hand.y }];
    nearArm = [ik(shN, hand, armL, armL, -1), hand];
  } else if (p.kind === "skater") {
    const s = Math.sin(p.t * 1.4);
    farArm = armFK(shF, -0.7 - 0.1 * s, -0.3, armL);
    nearArm = armFK(shN, 0.5 + 0.1 * s, 0.5, armL);
  } else if (p.kind === "boombox") {
    farArm = armFK(shF, A * swing, fwdBend(swing), armL);
    const hand = { x: shoulder.x - 6, y: shoulder.y - 8 + nod * 4 };
    nearArm = [ik(shN, hand, armL, armL, -1), hand];
  } else if (p.kind === "coffee") {
    farArm = armFK(shF, A * swing, fwdBend(swing), armL);
    const hand = { x: shoulder.x + 9, y: shoulder.y + 12 + Math.sin(ph * TAU * 2) * 0.6 };
    nearArm = [ik(shN, hand, armL, armL, -1), hand];
  } else {
    farArm = armFK(shF, A * swing, fwdBend(swing), armL);
    nearArm = armFK(shN, -A * swing * (p.kind === "office" ? 0.55 : 1), p.kind === "office" ? 0.12 : fwdBend(-swing), armL);
  }

  // ---- back layer
  drawArm(ctx, p, shF, farArm[0], farArm[1], true);
  drawLeg(ctx, p, hip, fFar, true, wF);

  // backpack
  if (p.backpack) {
    ctx.fillStyle = p.backpack;
    ctx.save();
    ctx.translate((hip.x + shoulder.x) / 2 - 7, (hip.y + shoulder.y) / 2 - 3);
    ctx.rotate(lean);
    rr(ctx, -5, -9, 9, 18, 3.5);
    ctx.fill();
    ctx.fillStyle = shade(p.backpack, 0.8);
    rr(ctx, -6, 0, 5, 7, 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- torso
  seg(ctx, [{ x: hip.x - 0.5, y: hip.y - 1 }, { x: hip.x + 0.5, y: hip.y + 1 }], 10.5, p.pants);
  // torso body
  seg(ctx, [{ x: hip.x + Math.sin(lean) * 4, y: hip.y - Math.cos(lean) * 4 }, { x: shoulder.x, y: shoulder.y + 3 }], 13, p.top);
  if (p.kind === "office") {
    // shirt + tie
    const mx = shoulder.x + 4.5;
    ctx.fillStyle = "#f2efe8";
    ctx.beginPath();
    ctx.moveTo(mx - 1.6, shoulder.y - 1);
    ctx.lineTo(mx + 2.2, shoulder.y - 1);
    ctx.lineTo(mx + 1.2, shoulder.y + 12);
    ctx.closePath();
    ctx.fill();
    seg(ctx, [{ x: mx + 0.6, y: shoulder.y + 0.5 }, { x: mx + 0.4, y: shoulder.y + 11 }], 1.8, p.top2);
  } else {
    // hem stripe
    seg(
      ctx,
      [
        { x: hip.x + Math.sin(lean) * 4 - 1, y: hip.y - Math.cos(lean) * 4 },
        { x: hip.x + Math.sin(lean) * 6 - 1, y: hip.y - Math.cos(lean) * 6 },
      ],
      13.2,
      shade(p.top, 0.85),
    );
    if (p.hood) {
      ctx.fillStyle = shade(p.top, 0.85);
      ctx.beginPath();
      ctx.ellipse(shoulder.x - 4, shoulder.y + 1, 5, 3.5, -0.4, 0, TAU);
      ctx.fill();
    }
  }

  drawLeg(ctx, p, hip, fNear, false, wN);

  // ---- head
  const neck = { x: shoulder.x + 0.6, y: shoulder.y - 1 };
  const tilt = p.kind === "phone" ? 0.38 : p.kind === "skater" ? 0.05 : 0;
  drawHead(ctx, p, neck, tilt, nod, Math.sin(ph * TAU * 2));

  // ---- props in front
  if (p.kind === "phone") {
    const h = nearArm[1];
    ctx.save();
    ctx.translate(h.x + 1, h.y - 2);
    ctx.rotate(-0.9);
    ctx.fillStyle = "#1c1b1f";
    rr(ctx, -2, -4.5, 4, 9, 1.2);
    ctx.fill();
    ctx.fillStyle = "#9be7ff";
    rr(ctx, -1.3, -3.7, 2.6, 7.4, 0.8);
    ctx.fill();
    ctx.restore();
  }
  if (p.kind === "boombox") {
    const h = nearArm[1];
    ctx.save();
    ctx.translate(h.x - 6, h.y - 5);
    ctx.rotate(-0.08 + nod * 0.5);
    ctx.fillStyle = p.top2;
    rr(ctx, -11, -6, 22, 12, 2.5);
    ctx.fill();
    ctx.strokeStyle = "#1c1b1f";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.lineTo(-5, -9);
    ctx.lineTo(5, -9);
    ctx.lineTo(7, -6);
    ctx.stroke();
    const pulse = 1 + Math.max(0, Math.sin(ph * TAU * 2)) * 0.18;
    for (const sx of [-6, 6]) {
      ctx.fillStyle = "#1c1b1f";
      ctx.beginPath();
      ctx.arc(sx, 0.5, 4 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#e8e1d3";
      ctx.beginPath();
      ctx.arc(sx, 0.5, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#9be7ff";
    rr(ctx, -2, -4, 4, 3, 0.6);
    ctx.fill();
    ctx.restore();
  }
  if (p.kind === "coffee") {
    const h = nearArm[1];
    ctx.fillStyle = "#e8e1d3";
    ctx.beginPath();
    ctx.moveTo(h.x - 2.4, h.y - 7);
    ctx.lineTo(h.x + 2.8, h.y - 7);
    ctx.lineTo(h.x + 2, h.y + 1.5);
    ctx.lineTo(h.x - 1.6, h.y + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6b4528";
    rr(ctx, h.x - 2.8, h.y - 8.4, 6, 1.8, 0.8);
    ctx.fill();
    ctx.fillStyle = "#3d7c6b";
    rr(ctx, h.x - 2, h.y - 4.5, 4.2, 2.6, 0.5);
    ctx.fill();
  }
  if (p.kind === "office") {
    const h = nearArm[1];
    const sway = -swing * 0.12;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(sway);
    ctx.fillStyle = "#4a3428";
    rr(ctx, -8, 1.5, 16, 11, 1.8);
    ctx.fill();
    ctx.fillStyle = "#c9a227";
    rr(ctx, -1.5, 5, 3, 2, 0.5);
    ctx.fill();
    ctx.strokeStyle = "#2a1d17";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2.5, 1.6);
    ctx.lineTo(-2.5, -0.4);
    ctx.lineTo(2.5, -0.4);
    ctx.lineTo(2.5, 1.6);
    ctx.stroke();
    ctx.restore();
  }

  drawArm(ctx, p, shN, nearArm[0], nearArm[1], false);
}

/* ------------------------------------------------------------ component */

export function CrowdCanvas({ density = 22, greetings = DEFAULT_GREETINGS }: CrowdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let people: Person[] = [];
    const notes: Note[] = [];
    const count = clamp(density, 6, 40);

    const sortDepth = () => people.sort((a, b) => a.y - b.y);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      people = Array.from({ length: count }, () => makePerson(W, H, true));
      sortDepth();
    };

    type Bubble = { el: HTMLDivElement; p: Person; leaving: boolean };
    const bubbles: Bubble[] = [];
    // Speaker anchor: dead-center above the head, with a 14px air gap so the
    // tail tip hovers just over the head instead of covering it. Computed
    // identically at spawn and on every frame, so a bubble is born on its
    // speaker — it never travels in from anywhere else.
    const HEAD_GAP = 14;
    const anchor = (p: Person) => {
      const top = p.y - (p.thigh + p.shin + p.torso + 20) * p.k - HEAD_GAP;
      return `translate(${p.x.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -100%)`;
    };
    const spawnBubble = () => {
      const cands = people.filter((p) => p.x > W * 0.12 && p.x < W * 0.88 && !bubbles.some((b) => b.p === p));
      if (!cands.length) return;
      const p = pick(cands);
      const el = document.createElement("div");
      el.className = "crowd-bubble";
      el.textContent = pick(greetings);
      el.style.transform = anchor(p); // placed before first paint: no corner flash
      layer.appendChild(el);
      const b = { el, p, leaving: false };
      bubbles.push(b);
      requestAnimationFrame(() => el.classList.add("on"));
      window.setTimeout(() => {
        // Freeze: convert to fixed coordinates and detach from the follow
        // system entirely, then fade. From here on nothing — not the walker,
        // not recycling, not resize math — can move this bubble again.
        const r = el.getBoundingClientRect();
        const lr = layer.getBoundingClientRect();
        b.leaving = true;
        el.style.transform = "none";
        el.style.left = `${(r.left - lr.left).toFixed(1)}px`;
        el.style.top = `${(r.top - lr.top).toFixed(1)}px`;
        el.classList.remove("on");
        window.setTimeout(() => {
          el.remove();
          const i = bubbles.indexOf(b);
          if (i >= 0) bubbles.splice(i, 1);
        }, 350);
      }, 3200);
    };

    const update = (p: Person, dt: number) => {
      p.t += dt;
      if (p.kind === "skater") {
        const sk = p.sk;
        sk.t += dt;
        sk.wheel += (p.v * dt) / 2.5;
        if (sk.t >= sk.dur) {
          sk.t = 0;
          sk.mode = ((sk.mode + 1) % 4) as 0 | 1 | 2 | 3;
          sk.dur = sk.mode === 0 ? 0.28 : sk.mode === 1 ? 26 / p.v : sk.mode === 3 ? 0.32 : rand(1.2, 2.2);
        }
      } else {
        p.phase = (p.phase + dt / p.cycle) % 1;
      }
      p.x += p.dir * p.v * p.k * dt;
      if (p.kind === "boombox") {
        p.noteT -= dt;
        if (p.noteT <= 0) {
          p.noteT = rand(0.35, 0.7);
          notes.push({
            x: p.x + p.dir * 4 * p.k,
            y: p.y - (p.thigh + p.shin + p.torso + 10) * p.k,
            vx: rand(-8, 8),
            life: 1,
            ch: pick(["♪", "♫", "♬"]),
          });
        }
      }
    };

    let raf = 0;
    let prev = performance.now();
    let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = reduced ? 0 : Math.min(0.05, (now - prev) / 1000);
      prev = now;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      let reorder = false;
      for (const p of people) {
        update(p, dt);
        if ((p.dir === 1 && p.x > W + 90) || (p.dir === -1 && p.x < -90)) {
          Object.assign(p, makePerson(W, H, false));
          reorder = true;
        }
      }
      if (reorder) sortDepth();

      for (const p of people) {
        // shadow
        ctx.fillStyle = `rgba(30,20,10,${0.1 + p.yn * 0.06})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, (p.kind === "skater" ? 22 : 14) * p.k, 3 * p.k, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.dir * p.k, p.k);
        drawPerson(ctx, p);
        ctx.restore();
      }

      // music notes
      ctx.textAlign = "center";
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i]!;
        n.life -= dt * 0.7;
        n.y -= 22 * dt;
        n.x += n.vx * dt + Math.sin(n.life * 9) * 0.3;
        if (n.life <= 0) {
          notes.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(1, n.life * 1.5);
        ctx.fillStyle = "#2d3142";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.fillText(n.ch, n.x, n.y);
      }
      ctx.globalAlpha = 1;

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]!;
        if (!people.includes(b.p)) {
          // person object retired (resize) — drop the bubble outright
          b.el.remove();
          bubbles.splice(i, 1);
          continue;
        }
        if (b.leaving) continue; // fading in place — hands off the transform
        b.el.style.transform = anchor(b.p);
      }
    };

    resize();
    raf = requestAnimationFrame(frame);
    const first = window.setTimeout(spawnBubble, 1200);
    const timer = window.setInterval(spawnBubble, 3600);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => (reduced = mq.matches);
    mq.addEventListener("change", onMq);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(first);
      window.clearInterval(timer);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("resize", resize);
      bubbles.forEach((b) => b.el.remove());
    };
  }, [density, greetings]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </>
  );
}

const SERVICES = ["Report content", "Validator consensus", "Public reasoning", "Appeal rights"];

/**
 * OpenGavel hero — "Community Canvas".
 * Composed exactly like the user's gen-z-strides material: city backdrop,
 * parchment gradient, IK crowd, headline, and verdict bubbles.
 */
export const OpenGavelHero = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-parchment text-court">
      <img
        src={cityStreet}
        alt=""
        width={1920}
        height={1088}
        className="absolute inset-0 h-full w-full object-cover object-bottom"
      />
      <div className="absolute inset-x-0 top-0 h-[58%] bg-gradient-to-b from-parchment via-parchment/70 to-transparent" />
      <div className="absolute inset-0">
        <CrowdCanvas density={24} />
      </div>
      <div className="relative z-10 mx-auto grid max-w-3xl justify-items-center gap-5 px-4 pt-16 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-50">
          OpenGavel — Community Canvas
        </span>
        <h1 className="font-display max-w-[20ch] text-4xl uppercase leading-[1.02] tracking-tight md:text-6xl">
          Fair moderation, decided in the open.
        </h1>
        <p className="max-w-[52ch] text-sm leading-relaxed opacity-70 md:text-base">
          No single admin, no single AI. Independent validators re-judge every
          report — and publish the reasoning, the rule, and the version.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/how-it-works"
            className="inline-flex items-center gap-2 rounded-full border border-court bg-gavel px-6 py-3 text-sm font-bold text-court transition hover:bg-court hover:text-parchment"
          >
            <Gavel size={16} />
            See how it works
          </a>
          <a
            href="#cases"
            className="inline-flex items-center gap-2 rounded-full border border-court bg-white/60 px-6 py-3 text-sm font-bold transition hover:bg-court hover:text-parchment"
          >
            <ArrowDown size={16} />
            Watch live verdicts
          </a>
        </div>
      </div>
      <ul className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-wrap justify-center gap-x-6 gap-y-1 px-4 text-[11px] font-bold uppercase tracking-widest text-parchment opacity-80">
        {SERVICES.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
};

export default OpenGavelHero;
