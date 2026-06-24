export type VersionHistoryItem = {
  id: string;
  versionNo: number;
  headlineP: number;
  headlineSE: number;
  trials: number;
  source: string;
  rationale: string | null;
  createdAt: Date;
};

type VersionHistoryProps = {
  versions: VersionHistoryItem[];
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function VersionHistory({ versions }: VersionHistoryProps) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted">No saved versions yet.</p>;
  }

  const ordered = [...versions].sort((a, b) => b.versionNo - a.versionNo);

  return (
    <ol className="space-y-2">
      {ordered.map((version) => (
        <li
          className="rounded-lg border border-line bg-surface p-3 text-sm"
          key={version.id}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-fg">
              v{version.versionNo} — {formatPercent(version.headlineP)}
            </span>
            <span className="text-xs text-subtle capitalize">{version.source}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{formatDate(version.createdAt)}</p>
          {version.rationale ? (
            <p className="mt-2 text-sm text-fg">{version.rationale}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
