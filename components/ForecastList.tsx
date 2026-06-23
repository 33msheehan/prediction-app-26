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
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="font-medium text-fg">No forecasts yet.</p>
        <p className="mt-1 text-sm text-muted">
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
            className="block rounded-xl border border-line bg-surface p-4 transition hover:border-line-strong"
            href={`/forecasts/${forecast.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-fg">{forecast.title}</h2>
                  {forecast.dueForReview ? (
                    <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn-soft-fg">
                      Due for review
                    </span>
                  ) : null}
                </div>
                {forecast.description ? (
                  <p className="text-sm text-muted">{forecast.description}</p>
                ) : null}
              </div>
              <div className="text-right text-sm">
                <p className="text-lg font-medium text-fg">{formatHeadline(forecast.headlineP)}</p>
                <p className="text-subtle">{forecast.status}</p>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
