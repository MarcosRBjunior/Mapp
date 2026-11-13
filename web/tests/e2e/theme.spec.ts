import { expect, test } from './test.js';

test('the toggle switches to the dark theme and keeps it after a reload', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  await expect(root).not.toHaveClass(/\bdark\b/);

  await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
  await expect(root).toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(root).toHaveClass(/\bdark\b/);
  await expect(page.getByRole('button', { name: 'Ativar tema claro' })).toBeVisible();
});

test.describe('with a dark system preference', () => {
  test.use({ colorScheme: 'dark' });

  test('opens dark without a saved choice and lets the toggle override it', async ({ page }) => {
    await page.goto('/sobre');
    const root = page.locator('html');
    await expect(root).toHaveClass(/\bdark\b/);

    await page.getByRole('button', { name: 'Ativar tema claro' }).click();
    await expect(root).not.toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(root).not.toHaveClass(/\bdark\b/);
  });
});
