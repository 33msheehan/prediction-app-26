// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@/auth';
import {
  appendVersion,
  ForecastNotFoundError,
  TreeValidationFailedError,
} from '@/lib/db/repository';
import { POST } from './route';

const authMock = vi.mocked(auth as unknown as () => Promise<{ user?: { id?: string } } | null>);
const appendVersionMock = vi.mocked(appendVersion);

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/repository', () => {
  class MockForecastNotFoundError extends Error {
    constructor(forecastId: string) {
      super(`Forecast ${forecastId} not found`);
    }
  }

  class MockTreeValidationFailedError extends Error {}

  return {
    appendVersion: vi.fn(),
    ForecastNotFoundError: MockForecastNotFoundError,
    TreeValidationFailedError: MockTreeValidationFailedError,
  };
});

describe('POST /api/forecasts/[id]/versions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no authenticated session', async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: 'forecast-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(appendVersion).not.toHaveBeenCalled();
  });

  it('calls appendVersion with a server-forced edit source and returns the saved version', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    appendVersionMock.mockResolvedValue({
      id: 'version-1',
      versionNo: 3,
      headlineP: 0.42,
      headlineSE: 0.01,
      trials: 10_000,
      createdAt: new Date('2026-06-21T20:00:00.000Z'),
    } as Awaited<ReturnType<typeof appendVersion>>);

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          tree: { root: { id: 'root' } },
          source: 'checkin',
        }),
      }),
      { params: Promise.resolve({ id: 'forecast-1' }) },
    );

    expect(appendVersion).toHaveBeenCalledWith('user-1', 'forecast-1', {
      tree: { root: { id: 'root' } },
      source: 'edit',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'version-1',
      versionNo: 3,
      headlineP: 0.42,
      headlineSE: 0.01,
      trials: 10_000,
    });
  });

  it('returns 404 when the forecast is missing or owned by another user', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    appendVersionMock.mockRejectedValue(new ForecastNotFoundError('forecast-1'));

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: 'forecast-1' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Forecast not found' });
  });

  it('returns 400 when the server rejects the submitted tree', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    appendVersionMock.mockRejectedValue(new TreeValidationFailedError('invalid tree'));

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ tree: { root: { id: 'bad-root' } } }),
      }),
      { params: Promise.resolve({ id: 'forecast-1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid tree' });
  });
});
