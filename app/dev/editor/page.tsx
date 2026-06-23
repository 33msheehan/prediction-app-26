import { notFound } from 'next/navigation';
import { TreeEditorShell } from '@/components/TreeEditorShell';

// Dev-only harness for iterating on the editor UX without auth or a database.
// Returns 404 in production builds, and lives outside the proxy's protected
// path prefixes so it can be opened (and screenshotted) without signing in.
// Starts with no tree so the empty-canvas root chooser can be exercised.
export default function DevEditorPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex min-h-[calc(100vh-7rem)] w-full flex-1 flex-col gap-4">
        <div className="shrink-0">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Dev harness</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg">Editor (no auth / no DB)</h1>
        </div>
        <TreeEditorShell forecastId="dev" initialTree={null} />
      </div>
    </main>
  );
}
