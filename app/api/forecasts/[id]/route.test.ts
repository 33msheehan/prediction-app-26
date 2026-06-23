// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@/auth';
import { deleteForecast, ForecastNotFoundError } from '@/lib/db/repository';
import { DELETE } from './route';

const authMock = vi.mocked(auth as unknown as () => Promise<{ user?: { id?: string } } | null>);
const deleteForecastMock = vi.mocked(deleteForecast);

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/repository', () => {
  class MockForecastNotFoundError extends Error {
    constructor(forecastId: string) {
      super(`Forecast ${forecastId} not found`);
    }
  }

  return {
    deleteForecast: vi.fn(),
    ForecastNotFoundError: MockForecastNotFoundError,
  };
});

describe('DELETE /api/forecasts/[id]', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no authenticated session', async () => {
    authMock.mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'forecast-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(deleteForecast).not.toHaveBeenCalled();
  });

  it('deletes the forecast for the authenticated user', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    deleteForecastMock.mockResolvedValue(undefined);

    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'forecast-1' }),
    });

    expect(deleteForecast).toHaveBeenCalledWith('user-1', 'forecast-1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns 404 when the forecast is missing or owned by another user', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    deleteForecastMock.mockRejectedValue(new ForecastNotFoundError('forecast-1'));

    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'forecast-1' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Forecast not found' });
  });
});
