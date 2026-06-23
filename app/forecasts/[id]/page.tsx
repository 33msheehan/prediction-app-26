import { notFound, redirect } from 'next/navigation';
import { TreeSchema } from '@/lib/engine/tree';
import { getCurrentUser } from '@/lib/auth/session';
import { getForecastWithCurrentVersion } from '@/lib/db/repository';
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
  if (treeResult && !treeResult.success) {
    notFound();
  }
  const initialTree = treeResult?.success ? treeResult.data : null;

  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">Forecast editor</p>
            <h1 className="mt-2 text-2xl font-semibold text-fg">{forecast.title}</h1>
            {forecast.description ? (
              <p className="mt-2 max-w-3xl text-sm text-muted">{forecast.description}</p>
            ) : null}
          </div>
          <span className="rounded-full bg-panel px-3 py-1 text-xs font-medium text-muted capitalize">
            {forecast.status}
          </span>
        </div>

        <TreeEditorShell forecastId={forecast.id} initialTree={initialTree} />
      </div>
    </main>
  );
}
