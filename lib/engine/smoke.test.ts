import { describe, it, expect } from 'vitest';

// Smoke test — proves the Vitest toolchain runs. Replace/remove once the
// real engine tests land in Phase 2.
describe('toolchain smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
