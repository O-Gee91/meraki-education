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