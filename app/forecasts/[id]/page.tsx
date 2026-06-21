export default async function ForecastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="flex-1 p-6">
      <h1 className="text-2xl font-semibold">Forecast {id}</h1>
    </main>
  );
}
