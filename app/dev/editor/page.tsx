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
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Dev harness</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg">Editor (no auth / no DB)</h1>
        </div>
        <TreeEditorShell forecastId="dev" initialTree={null} />
      </div>
    </main>
  );
}
