// Shared setup/teardown for DB-integration tests. We test against the real
// provisioned Neon instance (see T0.3's ephemeral-branch CI step for the
// isolated-DB story); these helpers keep each test's rows scoped to a
// throwaway user and clean them up afterward via the FK cascade.
import { eq } from 'drizzle-orm';
import { db } from './client';
import { users } from './schema';

export async function createTestUser(emailPrefix = 'test') {
  const [user] = await db
    .insert(users)
    .values({ email: `${emailPrefix}-${crypto.randomUUID()}@example.com` })
    .returning();
  return user;
}

export async function deleteTestUsers(userIds: string[]) {
  for (const id of userIds) {
    await db.delete(users).where(eq(users.id, id));
  }
}
