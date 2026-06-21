import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  appendVersion,
  ForecastNotFoundError,
  TreeValidationFailedError,
} from '@/lib/db/repository';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { tree?: unknown };
    const version = await appendVersion(session.user.id, id, {
      tree: body.tree,
      source: 'edit',
    });

    return NextResponse.json({
      id: version.id,
      versionNo: version.versionNo,
      headlineP: version.headlineP,
      headlineSE: version.headlineSE,
      trials: version.trials,
      createdAt: version.createdAt,
    });
  } catch (error) {
    if (error instanceof ForecastNotFoundError) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 });
    }

    if (error instanceof TreeValidationFailedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Unable to save forecast version' }, { status: 500 });
  }
}
