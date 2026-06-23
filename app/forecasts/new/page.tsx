import { CreateForecastForm } from '@/components/CreateForecastForm';
import { createForecastAction } from './actions';

export default function NewForecastPage() {
  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-fg">New forecast</h1>
        <p className="mt-2 text-sm text-muted">
          Start with a binary question and an initial 50/50 placeholder tree so you can iterate in
          the editor.
        </p>
      </div>

      <CreateForecastForm action={createForecastAction} />
    </main>
  );
}
