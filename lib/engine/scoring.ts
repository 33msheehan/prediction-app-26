const EPSILON = 1e-10;

export function brier(p: number, outcome: 0 | 1): number {
  return (p - outcome) ** 2;
}

export function logScore(p: number, outcome: 0 | 1): number {
  const clamped = Math.min(Math.max(p, EPSILON), 1 - EPSILON);
  return -(outcome * Math.log(clamped) + (1 - outcome) * Math.log(1 - clamped));
}
