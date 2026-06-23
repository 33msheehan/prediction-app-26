'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type DeleteForecastButtonProps = {
  forecastId: string;
};

export function DeleteForecastButton({ forecastId }: DeleteForecastButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'deleting' | 'error'>('idle');

  async function handleDelete() {
    if (status === 'deleting') {
      return;
    }

    const confirmed = window.confirm(
      'Delete this forecast and all saved versions? This cannot be undone.',
    );
    if (!confirmed) {
      return;
    }

    setStatus('deleting');

    try {
      const response = await fetch(`/api/forecasts/${forecastId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Delete failed.');
      }

      router.push('/');
      router.refresh();
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="rounded-md border border-bad/40 bg-surface px-3 py-1.5 text-sm font-medium text-bad transition hover:bg-bad-soft disabled:cursor-not-allowed disabled:opacity-50"
        disabled={status === 'deleting'}
        onClick={handleDelete}
        type="button"
      >
        {status === 'deleting' ? 'Deleting...' : 'Delete forecast'}
      </button>
      {status === 'error' ? (
        <p className="max-w-48 text-right text-xs text-bad">Delete failed. Try again.</p>
      ) : null}
    </div>
  );
}
