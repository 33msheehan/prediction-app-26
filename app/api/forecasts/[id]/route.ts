import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteForecast, ForecastNotFoundError } from '@/lib/db/repository';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await deleteForecast(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ForecastNotFoundError) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Unable to delete forecast' }, { status: 500 });
  }
}
