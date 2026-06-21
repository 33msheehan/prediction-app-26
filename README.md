This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database setup (T0.2)

This project uses Vercel Postgres (Neon-backed). To connect a database:

1. Run `npx vercel login` and `npx vercel link` to connect this folder to a Vercel project.
2. In the Vercel dashboard, add a Postgres (Neon) store to the project under Storage.
3. Run `npx vercel env pull .env.local` to pull the generated `POSTGRES_URL` (and related vars) into `.env.local` — see [`.env.example`](.env.example) for the full list.
4. `GET /api/health` ([app/api/health/route.ts](app/api/health/route.ts)) runs a trivial `SELECT 1` and returns `{ ok: true, db: 'connected' }` once `POSTGRES_URL` is set.

The integration test in [app/api/health/route.test.ts](app/api/health/route.test.ts) skips automatically when `POSTGRES_URL` is unset, and runs for real once it is — including in CI against a Neon branch (T0.3).

## Migrations (T0.3)

[Drizzle](https://orm.drizzle.team) manages schema migrations against the database from [§ Database setup](#database-setup-t02). The schema itself ([lib/db/schema.ts](lib/db/schema.ts)) is still a placeholder — real tables land in T1.2.

- `npm run db:generate` — diff `lib/db/schema.ts` against the last migration and generate a new SQL migration file under [drizzle/](drizzle). Use `npx drizzle-kit generate --custom --name <name>` for a hand-written migration when there's no schema diff to auto-generate from.
- `npm run db:migrate` — apply any pending migrations in [drizzle/](drizzle) to the database at `POSTGRES_URL`. Safe to re-run: already-applied migrations are tracked in `drizzle.__drizzle_migrations` and skipped.
- `npm run db:studio` — browse the database with Drizzle Studio.

[lib/db/migrations.test.ts](lib/db/migrations.test.ts) asserts the migration history is exactly what's expected after `db:migrate` runs; like the health check test, it skips without `POSTGRES_URL`.

## CI (T0.4)

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every pull request and push to `main`: `npm ci`, then `lint`, `typecheck`, `test`, and `build` in sequence — any failing step fails the job. `test:e2e` (Playwright) runs separately on a daily schedule and via manual dispatch, since it needs a running dev server and browser binaries.

To gate merges on this, the repo needs **branch protection** requiring the `build-and-test` check to pass before merging — set that up once this is pushed to GitHub (Settings → Branches → Branch protection rules).
