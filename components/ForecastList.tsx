import Link from 'next/link';

export type ForecastListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  headlineP: number | null;
  dueForReview: boolean;
};

type ForecastListProps = {
  forecasts: ForecastListItem[];
};

function formatHeadline(headlineP: number | null) {
  if (headlineP === null) {
    return 'No headline yet';
  }

  return `${Math.round(headlineP * 100)}%`;
}

export function ForecastList({ forecasts }: ForecastListProps) {
  if (forecasts.length === 0) {
    return (
      <div className="rounded border border-dashed border-black/15 p-6">
        <p className="font-medium">No forecasts yet.</p>
        <p className="mt-1 text-sm text-black/65">
          Create your first binary forecast to start tracking your calls.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {forecasts.map((forecast) => (
        <li key={forecast.id}>
          <Link
            className="block rounded border border-black/10 p-4 transition hover:border-black/25"
            href={`/forecasts/${forecast.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{forecast.title}</h2>
                  {forecast.dueForReview ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                      Due for review
                    </span>
                  ) : null}
                </div>
                {forecast.description ? (
                  <p className="text-sm text-black/70">{forecast.description}</p>
                ) : null}
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{formatHeadline(forecast.headlineP)}</p>
                <p className="text-black/65">{forecast.status}</p>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
