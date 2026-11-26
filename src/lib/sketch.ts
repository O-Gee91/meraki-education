export type Random = () => number;
export function seededRandom(seed: string): Random {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n = (value: number) => Number(value.toFixed(2));
export function sketchLine(x1: number, y1: number, x2: number, y2: number, rand: Random, opts: { bow?: number; overshoot?: number; jitter?: number } = {}): string {
  const jitter = opts.jitter ?? 0.65;
  const wiggle = () => (rand() - 0.5) * jitter;
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bow = (rand() - 0.5) * (opts.bow ?? 2);
  const over = opts.overshoot ?? 0.6;
  return `M ${n(x1 + wiggle())} ${n(y1 + wiggle())} Q ${n((x1 + x2) / 2 - dy / length * bow)} ${n((y1 + y2) / 2 + dx / length * bow)} ${n(x2 + dx / length * over + wiggle())} ${n(y2 + dy / length * over + wiggle())}`;
}
export function sketchCircle(cx: number, cy: number, rx: number, ry: number, rand: Random): string {
  return Array.from({ length: 49 }, (_, i) => {
    const angle = i / 48 * Math.PI * 2.12 - 0.2;
    const jitter = 1 + (rand() - 0.5) * 0.035;
    return `${i ? "L" : "M"} ${n(cx + Math.cos(angle) * rx * jitter)} ${n(cy + Math.sin(angle) * ry * jitter)}`;
  }).join(" ");
}
export function sketchBox(x: number, y: number, w: number, h: number, rand: Random): string[] {
  return [sketchLine(x, y, x + w, y, rand), sketchLine(x + w, y, x + w, y + h, rand), sketchLine(x + w, y + h, x, y + h, rand), sketchLine(x, y + h, x, y, rand)];
}
export function sketchGrid(cols: number, rows: number, rand: Random): string[] {
  if (cols < 1 || rows < 1) return [];
  return [...Array.from({ length: cols + 1 }, (_, i) => sketchLine(i * 100 / cols, 0, i * 100 / cols, 100, rand)), ...Array.from({ length: rows + 1 }, (_, i) => sketchLine(0, i * 100 / rows, 100, i * 100 / rows, rand))];
}
export function sketchTick(x: number, y: number, size: number, rand: Random): string[] {
  return [sketchLine(x, y + size * 0.5, x + size * 0.35, y + size, rand), sketchLine(x + size * 0.35, y + size, x + size, y, rand)];
}

export function sketchTally(count: number, rand: Random): string[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const total = Math.floor(count);
  return Array.from({ length: total }, (_, i) => {
    const group = Math.floor(i / 5);
    const stroke = i % 5;
    const x = group * 32 + 5;
    return stroke === 4
      ? sketchLine(x - 2, 38, x + 22, 10, rand)
      : sketchLine(x + stroke * 6, 10, x + stroke * 6, 38, rand);
  });
}

export function sketchMood(mood: number, rand: Random): string[] {
  const mouth = mood >= 4 ? "M 30 29 Q 50 47 70 29" : mood === 3 ? "M 34 34 L 66 34" : "M 30 37 Q 50 23 70 37";
  return [sketchCircle(50, 25, 36, 22, rand), sketchLine(36, 17, 36, 20, rand), sketchLine(64, 17, 64, 20, rand), mouth];
}

/** Bowed shaft with two barbs that meet the tip. Coordinates stay in the caller's box. */
export function sketchArrow(x1: number, y1: number, x2: number, y2: number, rand: Random): string[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const head = Math.min(14, length * 0.28);
  const spread = head * 0.55;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  return [
    sketchLine(x1, y1, x2, y2, rand, { bow: 2.4, overshoot: 0 }),
    sketchLine(x2, y2, bx + px * spread, by + py * spread, rand, { bow: 0.4, overshoot: 0.15 }),
    sketchLine(x2, y2, bx - px * spread, by - py * spread, rand, { bow: 0.4, overshoot: 0.15 }),
  ];
}

/** Five-point star that stops short of closing, so the stroke reads as one pen pass. */
export function sketchStar(cx: number, cy: number, radius: number, rand: Random): string {
  const points = 5;
  return Array.from({ length: points }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 4 * Math.PI) / points;
    const wobble = 1 + (rand() - 0.5) * 0.12;
    return `${i ? "L" : "M"} ${n(cx + Math.cos(angle) * radius * wobble)} ${n(cy + Math.sin(angle) * radius * wobble)}`;
  }).join(" ");
}

/** Spiral that winds outward. Seeded wobble keeps it still across refreshes. */
export function sketchSpiral(cx: number, cy: number, rand: Random): string {
  const steps = 32;
  const turns = 2.15;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const angle = t * Math.PI * 2 * turns;
    const radius = 1.5 + t * 13;
    const wobble = 1 + (rand() - 0.5) * 0.1;
    return `${i ? "L" : "M"} ${n(cx + Math.cos(angle) * radius * wobble)} ${n(cy + Math.sin(angle) * radius * wobble)}`;
  }).join(" ");
}

export function sketchDoodle(rand: Random): string[] {
  return [sketchStar(22, 24, 15, rand), sketchSpiral(72, 26, rand)];
}

/** Folded plane: outline, then the center crease. Slight jitter, stable per seed. */
export function sketchPlane(rand: Random): string[] {
  const j = () => (rand() - 0.5) * 1.4;
  const noseX = 90 + j();
  const noseY = 10 + j();
  const tailX = 10 + j();
  const tailY = 28 + j();
  const wingX = 56 + j();
  const wingY = 40 + j();
  const foldX = 42 + j();
  const foldY = 27 + j();
  return [
    `M ${n(tailX)} ${n(tailY)} L ${n(noseX)} ${n(noseY)} L ${n(wingX)} ${n(wingY)} L ${n(foldX)} ${n(foldY)} Z`,
    `M ${n(foldX)} ${n(foldY)} L ${n(foldX - 4)} ${n(foldY + 14)} L ${n(foldX + 12)} ${n(foldY + 6)}`,
  ];
}