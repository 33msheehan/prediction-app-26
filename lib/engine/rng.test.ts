import { describe, expect, it } from 'vitest';
import { createRng, createRngStream, randomOpen01 } from './rng';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('forecast');
    const b = createRng('forecast');

    expect(Array.from({ length: 10 }, () => a())).toEqual(Array.from({ length: 10 }, () => b()));
  });

  it('creates independent deterministic streams', () => {
    const streamA = createRngStream('forecast', 'a');
    const streamB = createRngStream('forecast', 'b');

    expect(Array.from({ length: 5 }, () => streamA())).not.toEqual(
      Array.from({ length: 5 }, () => streamB()),
    );
  });
});

describe('randomOpen01', () => {
  it('excludes zero', () => {
    const values = [0, 0, 0.25];
    const rng = () => values.shift() ?? 0.5;

    expect(randomOpen01(rng)).toBe(0.25);
  });
});
