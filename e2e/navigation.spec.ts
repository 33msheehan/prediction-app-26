import { test, expect } from '@playwright/test';

test('navigates between the stub routes via the nav', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'New forecast' }).click();
  await expect(page).toHaveURL('/forecasts/new');
  await expect(page.getByRole('heading', { name: 'New forecast' })).toBeVisible();

  await page.getByRole('link', { name: 'Calibration' }).click();
  await expect(page).toHaveURL('/calibration');
  await expect(page.getByRole('heading', { name: 'Calibration' })).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL('/');
});

test('renders the dynamic forecast and check-in routes', async ({ page }) => {
  await page.goto('/forecasts/abc123');
  await expect(page.getByRole('heading', { name: 'Forecast abc123' })).toBeVisible();

  await page.goto('/forecasts/abc123/check-in');
  await expect(page.getByRole('heading', { name: 'Check in: forecast abc123' })).toBeVisible();
});
