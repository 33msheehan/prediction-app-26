// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: authMock }));

const selectChain: { from: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn> } = {
  from: vi.fn(() => selectChain),
  where: vi.fn(() => selectChain),
};
const dbSelectMock = vi.fn(() => selectChain);
vi.mock('@/lib/db/client', () => ({ db: { select: dbSelectMock } }));

describe('getCurrentUser', () => {
  it('returns null when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { getCurrentUser } = await import('./session');

    expect(await getCurrentUser()).toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns the db user matching the session's stable id", async () => {
    const user = { id: 'user-1', email: 'a@b.com', createdAt: new Date() };
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });
    selectChain.where.mockResolvedValueOnce([user]);
    const { getCurrentUser } = await import('./session');

    expect(await getCurrentUser()).toEqual(user);
  });
});
