import { notFound, redirect } from 'next/navigation';
import { TreeSchema } from '@/lib/engine/tree';
import { getCurrentUser } from '@/lib/auth/session';
import { getForecastWithCurrentVersion } from '@/lib/db/repository';
import { TreeEditorShell } from '@/components/TreeEditorShell';

export default async function ForecastCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/api/auth/signin');
  }

  const { id } = await params;
  const forecast = await getForecastWithCurrentVersion(user.id, id);

  if (!forecast) {
    notFound();
  }

  if (forecast.currentTree === null) {
    redirect(`/forecasts/${id}`);
  }

  const treeResult = TreeSchema.safeParse(forecast.currentTree);
  if (!treeResult.success) {
    redirect(`/forecasts/${id}`);
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex min-h-[calc(100vh-7rem)] w-full flex-1 flex-col gap-4">
        <div className="shrink-0">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Check-in</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg">{forecast.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Revisit your leaves, adjust anything that&rsquo;s changed, and save to log a new
            check-in version.
          </p>
        </div>

        <TreeEditorShell
          cancelHref={`/forecasts/${id}`}
          forecastId={forecast.id}
          initialTree={treeResult.data}
          mode="checkin"
        />
      </div>
    </main>
  );
}
