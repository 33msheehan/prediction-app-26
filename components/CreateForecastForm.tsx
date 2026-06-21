type CreateForecastFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function CreateForecastForm({ action }: CreateForecastFormProps) {
  return (
    <form action={action} className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="title">
          Title
        </label>
        <input
          className="w-full rounded border border-black/15 px-3 py-2"
          id="title"
          name="title"
          placeholder="Will the team ship before August?"
          required
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="description">
          Description
        </label>
        <textarea
          className="min-h-28 w-full rounded border border-black/15 px-3 py-2"
          id="description"
          name="description"
          placeholder="Optional context, scope, and resolution notes."
        />
      </div>

      <fieldset className="space-y-3 rounded border border-black/10 p-4">
        <legend className="px-1 text-sm font-medium">Review cadence</legend>

        <label className="flex items-center gap-2">
          <input defaultChecked name="cadenceKind" type="radio" value="none" />
          <span>No reminder cadence</span>
        </label>

        <label className="flex items-center gap-2">
          <input name="cadenceKind" type="radio" value="interval" />
          <span>Every</span>
          <input
            className="w-24 rounded border border-black/15 px-2 py-1"
            min="1"
            name="intervalDays"
            type="number"
          />
          <span>days</span>
        </label>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input name="cadenceKind" type="radio" value="dates" />
            <span>Specific dates</span>
          </label>
          <textarea
            className="min-h-24 w-full rounded border border-black/15 px-3 py-2"
            name="cadenceDates"
            placeholder="2026-07-01&#10;2026-07-15"
          />
          <p className="text-sm text-black/65">Use one date per line or comma-separated.</p>
        </div>
      </fieldset>

      <button className="w-fit rounded bg-black px-4 py-2 font-medium text-white" type="submit">
        Create forecast
      </button>
    </form>
  );
}
