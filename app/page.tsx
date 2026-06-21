import Link from 'next/link';
import { ForecastList } from '@/components/ForecastList';
import { getCurrentUser } from '@/lib/auth/session';
import { listForecastSummaries } from '@/lib/db/repository';
import { cadenceFromRecord, isDueForReview } from '@/lib/forecasts/cadence';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-3xl rounded border border-dashed border-black/15 p-8">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-3 max-w-2xl text-sm text-black/70">
            Sign in to create forecasts, track your current probabilities, and see what is due for
            review.
          </p>
          <Link
            className="mt-6 inline-flex rounded bg-black px-4 py-2 font-medium text-white"
            href="/forecasts/new"
          >
            Create your first forecast
          </Link>
        </div>
      </main>
    );
  }

  const summaries = await listForecastSummaries(user.id);
  const forecasts = summaries.map((forecast) => {
    const lastVersionAt = forecast.currentVersionCreatedAt ?? forecast.updatedAt;
    const cadence = cadenceFromRecord({
      cadenceKind: forecast.cadenceKind as 'none' | 'interval' | 'dates',
      cadenceInterval: forecast.cadenceInterval,
      cadenceDates: forecast.cadenceDates,
    });

    return {
      id: forecast.id,
      title: forecast.title,
      description: forecast.description,
      status: forecast.status,
      headlineP: forecast.headlineP,
      dueForReview: isDueForReview(cadence, lastVersionAt),
    };
  });

  return (
    <main className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-sm text-black/65">
              Your open forecasts, latest headline probabilities, and what needs a fresh review.
            </p>
          </div>
          <Link className="rounded bg-black px-4 py-2 font-medium text-white" href="/forecasts/new">
            New forecast
          </Link>
        </div>

        <ForecastList forecasts={forecasts} />
      </div>
    </main>
  );
}
