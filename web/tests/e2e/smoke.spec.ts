import { expect, test } from '@playwright/test';

test('home page shows the Mapp heading', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Mapp' })).toBeVisible();
  await expect(page).toHaveTitle('Mapp — COVID-19');
});
