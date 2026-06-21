import seedrandom from 'seedrandom';

export type Rng = () => number;

export function createRng(seed: string | number): Rng {
  const generator = seedrandom(String(seed));
  return () => generator.quick();
}

export function createRngStream(seed: string | number, streamId: string | number): Rng {
  return createRng(`${seed}:${streamId}`);
}

export function randomOpen01(rng: Rng): number {
  let value = rng();

  while (value <= 0) {
    value = rng();
  }

  return value;
}
