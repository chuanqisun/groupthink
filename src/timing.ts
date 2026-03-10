export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
