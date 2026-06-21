'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { createForecastWithInitialVersion } from '@/lib/db/repository';
import type { CreateForecastInput } from '@/lib/validation/forecast';

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function parseCreateForecastInput(formData: FormData): CreateForecastInput {
  const cadenceKind = stringValue(formData, 'cadenceKind');

  if (cadenceKind === 'interval') {
    return {
      title: stringValue(formData, 'title'),
      description: stringValue(formData, 'description') || undefined,
      cadence: {
        kind: 'interval',
        intervalDays: Number(stringValue(formData, 'intervalDays')),
      },
    };
  }

  if (cadenceKind === 'dates') {
    return {
      title: stringValue(formData, 'title'),
      description: stringValue(formData, 'description') || undefined,
      cadence: {
        kind: 'dates',
        dates: stringValue(formData, 'cadenceDates')
          .split(/\s*,\s*|\s*\n\s*/)
          .map((value) => value.trim())
          .filter(Boolean),
      },
    };
  }

  return {
    title: stringValue(formData, 'title'),
    description: stringValue(formData, 'description') || undefined,
    cadence: { kind: 'none' },
  };
}

export async function createForecastAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const { forecast } = await createForecastWithInitialVersion(
    session.user.id,
    parseCreateForecastInput(formData),
  );

  revalidatePath('/');
  redirect(`/forecasts/${forecast.id}`);
}
