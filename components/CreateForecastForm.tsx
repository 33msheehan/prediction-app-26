type CreateForecastFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

const fieldInputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';

export function CreateForecastForm({ action }: CreateForecastFormProps) {
  return (
    <form action={action} className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-fg" htmlFor="title">
          Title
        </label>
        <input
          className={fieldInputClass}
          id="title"
          name="title"
          placeholder="Will the team ship before August?"
          required
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-fg" htmlFor="description">
          Description
        </label>
        <textarea
          className={`min-h-28 ${fieldInputClass}`}
          id="description"
          name="description"
          placeholder="Optional context, scope, and resolution notes."
        />
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-medium text-fg">Review cadence</legend>

        <label className="flex items-center gap-2 text-sm text-fg">
          <input defaultChecked name="cadenceKind" type="radio" value="none" />
          <span>No reminder cadence</span>
        </label>

        <label className="flex items-center gap-2 text-sm text-fg">
          <input name="cadenceKind" type="radio" value="interval" />
          <span>Every</span>
          <input
            className="w-24 rounded-md border border-line bg-surface px-2 py-1 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            min="1"
            name="intervalDays"
            type="number"
          />
          <span>days</span>
        </label>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input name="cadenceKind" type="radio" value="dates" />
            <span>Specific dates</span>
          </label>
          <textarea
            className={`min-h-24 ${fieldInputClass}`}
            name="cadenceDates"
            placeholder="2026-07-01&#10;2026-07-15"
          />
          <p className="text-sm text-muted">Use one date per line or comma-separated.</p>
        </div>
      </fieldset>

      <button
        className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
        type="submit"
      >
        Create forecast
      </button>
    </form>
  );
}
