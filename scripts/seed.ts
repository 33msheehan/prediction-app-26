import { config } from 'dotenv';

// tsx doesn't auto-load .env.local the way `next dev` does.
config({ path: '.env.local' });

async function main() {
  const { seedDemoData } = await import('../lib/db/seed');
  const { user, forecast } = await seedDemoData();
  console.log(
    `Seeded demo user ${user.email} (${user.id}) with forecast "${forecast.title}" (${forecast.id}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
