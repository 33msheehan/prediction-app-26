import { test, expect } from '@playwright/test';

// Golden-path E2E lands in T8.4. This smoke test just proves the home page
// loads through the Playwright + dev-server harness.
test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
