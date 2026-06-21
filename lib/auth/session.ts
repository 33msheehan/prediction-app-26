import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export async function getCurrentUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
}
