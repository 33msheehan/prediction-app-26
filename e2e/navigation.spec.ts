import { test, expect } from '@playwright/test';

// T1.1 made /forecasts/* and /calibration auth-gated (proxy.ts), so an
// unauthenticated visitor can no longer reach those stub pages directly --
// they land on the sign-in page instead, with a callbackUrl back to where
// they were headed. The dashboard ('/') stays public and renders its own
// signed-out state.
test('the dashboard renders for a signed-out visitor and nav links redirect to sign-in', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'New forecast' }).click();
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=.*forecasts%2Fnew/);

  await page.goto('/');
  await page.getByRole('link', { name: 'Calibration' }).click();
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=.*calibration/);
});

test('protected dynamic forecast and check-in routes redirect a signed-out visitor to sign-in', async ({
  page,
}) => {
  await page.goto('/forecasts/abc123');
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=.*forecasts%2Fabc123/);

  await page.goto('/forecasts/abc123/check-in');
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=.*forecasts%2Fabc123%2Fcheck-in/);
});
