import * as THREE from 'three';
import {
  autoInk,
  BOT_AVATAR_RISE,
  BOT_AVATAR_OVERSCAN,
  botAvatarParts,
  botAvatarPresets,
  botAvatarShapes,
  drawBotAvatarFrame,
  restPose,
  type BotAvatarType
} from 'bot-avatars';

/** All textures are drawn once on 2D canvases at load: no image downloads, tiny memory. */

export const INK = '#1f2a44';

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

/** Seeded PRNG so the paper grain is identical every run. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, strength = 1) {
  const r = rng(seed);
  // speckle
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 14 * strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // fibres
  ctx.globalAlpha = 0.06 * strength;
  ctx.strokeStyle = '#6b5a3e';
  ctx.lineWidth = 1;
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = r() * Math.PI;
    const l = 4 + r() * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Neutral paper grain; materials multiply their own colour over it. */
export function paperGrain() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 7, 1);
  return tex(c);
}

/** The arena floor: a notebook page — grid, margin line, a little wear. */
export function notebookGround() {
  const S = 1024;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#f6f0e1';
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, 11, 0.8);
  const cell = S / 16;
  ctx.strokeStyle = 'rgba(86, 140, 196, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(S, i * cell);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(86, 140, 196, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 64; i++) {
    ctx.beginPath();
    ctx.moveTo((i * cell) / 4, 0);
    ctx.lineTo((i * cell) / 4, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (i * cell) / 4);
    ctx.lineTo(S, (i * cell) / 4);
    ctx.stroke();
  }
  return tex(c, 14);
}

/** Corrugated cardboard for boxes and the arena walls. */
export function kraft() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#c79a63';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(120, 80, 40, 0.12)';
  for (let x = 0; x < 256; x += 8) ctx.fillRect(x, 0, 3, 256);
  grain(ctx, 256, 256, 23, 1.4);
  return tex(c);
}

/** Soft round shadow for anything that stands on the floor. */
export function blobShadow() {
  const { c, ctx } = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(31,42,68,0.42)');
  g.addColorStop(1, 'rgba(31,42,68,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return tex(c, 1);
}

/** An ink splat, for bullet impacts and skill puddles. */
export function inkSplat(color = INK, seed = 3) {
  const { c, ctx } = canvas(128);
  const r = rng(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = 34 + r() * 14 + (i % 3 === 0 ? r() * 16 : 0);
    const x = 64 + Math.cos(a) * rr;
    const y = 64 + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = 46 + r() * 14;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, 1);
}

/** Crate face: kraft with a stamped "?" and tape strip. */
export function crateFace(gold = false) {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = gold ? '#e8c25a' : '#c79a63';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, gold ? 41 : 31, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(0, 108, 256, 40);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.fillStyle = gold ? '#8a3b12' : INK;
  ctx.font = 'bold 150px Itim, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(gold ? '★' : '?', 128, 136);
  return tex(c, 1);
}

/** The 3-band toon ramp every lit material shares: paper reads as flat planes of light. */
export function toonRamp() {
  const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export interface Wear {
  hat: 'none' | 'beret' | 'beanie' | 'party' | 'crown';
  glasses: 'none' | 'round' | 'square' | 'shades';
  headphones: boolean;
  bowTie: boolean;
  color: string;
}

export const NO_WEAR: Wear = { hat: 'none', glasses: 'none', headphones: false, bowTie: false, color: '#2b2b33' };

/**
 * Bakes a mascot into a die-cut sticker: the bot-avatars painter draws the
 * body (with its accessories), then a white paper border and an ink edge are
 * grown around the silhouette — what a cut-out on a stand looks like.
 * Returns the front texture, a plain card back, and where the body sits.
 */
export function bakeMascot(type: BotAvatarType, wear: Wear, opts: { color?: string; eyesShut?: boolean } = {}) {
  const box = 168;
  const side = Math.round(box * BOT_AVATAR_OVERSCAN); // the painter clears and draws a box×OVERSCAN square
  const preset = botAvatarPresets[type];
  const color = opts.color ?? preset.color;
  const art = canvas(side);
  const pose = restPose('default');
  if (opts.eyesShut) pose.eyeOpen = 0.05;
  const parts = botAvatarParts[type];
  drawBotAvatarFrame(art.ctx, box, pose, {
    path: new Path2D(botAvatarShapes[type]),
    parts: parts ? new Path2D(parts) : undefined,
    face: preset.face,
    faceX: preset.faceX,
    faceY: preset.faceY,
    faceScale: preset.faceScale,
    color,
    ink: autoInk(color),
    shading: 'crisp',
    theme: 'light',
    dpr: 1,
    wear: { ...wear, fabric: false }
  });

  const pad = 14;
  const S = side + pad * 2;
  const silhouette = (fill: string) => {
    const s = canvas(S);
    s.ctx.drawImage(art.c, pad, pad);
    s.ctx.globalCompositeOperation = 'source-in';
    s.ctx.fillStyle = fill;
    s.ctx.fillRect(0, 0, S, S);
    return s.c;
  };
  const grow = (ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, r: number) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.drawImage(img, Math.cos(a) * r, Math.sin(a) * r);
    }
  };
  const inkSil = silhouette(INK);
  const paperSil = silhouette('#fffdf7');

  const front = canvas(S);
  grow(front.ctx, inkSil, 11);
  grow(front.ctx, paperSil, 8);
  front.ctx.drawImage(art.c, pad, pad);

  const back = canvas(S);
  grow(back.ctx, inkSil, 11);
  grow(back.ctx, silhouette('#e9dcc2'), 8);
  back.ctx.globalCompositeOperation = 'source-atop';
  grain(back.ctx, S, S, 5, 1.2);
  back.ctx.strokeStyle = 'rgba(31,42,68,0.25)';
  back.ctx.lineWidth = 3;
  back.ctx.beginPath();
  back.ctx.moveTo(S / 2, 0);
  back.ctx.lineTo(S / 2, S);
  back.ctx.stroke();

  const mk = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  // Geometry facts for placing the card: in "box units" (the 100-unit body box = 1).
  const span = S / box;
  const bodyCenterBelow = BOT_AVATAR_RISE; // body centre this far below the canvas centre
  return { front: mk(front.c), back: mk(back.c), span, bodyCenterBelow, faceY: preset.faceY / 100, color };
}
