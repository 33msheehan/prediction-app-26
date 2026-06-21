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

  const treeResult = TreeSchema.safeParse(forecast.currentTree);
  if (!treeResult.success) {
    notFound();
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm tracking-wide text-black/50 uppercase">Forecast editor</p>
          <h1 className="mt-2 text-3xl font-semibold">{forecast.title}</h1>
          {forecast.description ? (
            <p className="mt-2 max-w-3xl text-sm text-black/70">{forecast.description}</p>
          ) : null}
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-black/10 p-4">
            <p className="text-sm text-black/60">Headline</p>
            <p className="mt-2 text-2xl font-semibold">
              {forecast.headlineP === null
                ? 'No headline yet'
                : `${Math.round(forecast.headlineP * 100)}%`}
            </p>
          </div>
          <div className="rounded border border-black/10 p-4">
            <p className="text-sm text-black/60">Status</p>
            <p className="mt-2 text-2xl font-semibold capitalize">{forecast.status}</p>
          </div>
          <div className="rounded border border-black/10 p-4">
            <p className="text-sm text-black/60">Current version</p>
            <p className="mt-2 text-2xl font-semibold">
              {forecast.currentVersionId ? 'Loaded' : 'Missing'}
            </p>
          </div>
        </section>

        <TreeEditorShell initialTree={treeResult.data} />
      </div>
    </main>
  );
}
