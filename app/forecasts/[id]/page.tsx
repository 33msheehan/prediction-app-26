import { notFound, redirect } from 'next/navigation';
import { TreeSchema } from '@/lib/engine/tree';
import { getCurrentUser } from '@/lib/auth/session';
import { getForecastWithCurrentVersion } from '@/lib/db/repository';
import { DeleteForecastButton } from '@/components/DeleteForecastButton';
import { TreeEditorShell } from '@/components/TreeEditorShell';

export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/api/auth/signin');
  }

  const { id } = await params;
  const forecast = await getForecastWithCurrentVersion(user.id, id);

  if (!forecast) {
    notFound();
  }

  // A forecast can exist with no version yet (created from the dashboard but
  // not built/saved). In that case there is no tree — open the editor empty.
  const treeResult =
    forecast.currentTree === null ? null : TreeSchema.safeParse(forecast.currentTree);
  const initialTree = treeResult?.success ? treeResult.data : null;
  const initialTreeError =
    treeResult && !treeResult.success
      ? 'The saved tree uses an older or invalid structure. Start a replacement tree here, or delete the forecast.'
      : undefined;

  return (
    <main className="flex flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex min-h-[calc(100vh-7rem)] w-full flex-1 flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">Forecast editor</p>
            <h1 className="mt-2 text-2xl font-semibold text-fg">{forecast.title}</h1>
            {forecast.description ? (
              <p className="mt-2 max-w-3xl text-sm text-muted">{forecast.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <span className="rounded-full bg-panel px-3 py-1 text-xs font-medium text-muted capitalize">
              {forecast.status}
            </span>
            <DeleteForecastButton forecastId={forecast.id} />
          </div>
        </div>

        <TreeEditorShell
          forecastId={forecast.id}
          initialTree={initialTree}
          initialTreeError={initialTreeError}
        />
      </div>
    </main>
  );
}
