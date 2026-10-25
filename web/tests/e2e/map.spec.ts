import { expect, test } from './test.js';

test('opens the map with markers, the data banner and the global card', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Dados históricos até 09/03/2023 · Fonte: API Ninjas')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Brasil:/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Geral' })).toContainText('Total: 1.000.000');
  await expect(page).toHaveTitle('Mapp — COVID-19');
});

test('clicking the Brazil marker opens the country', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /^Brasil:/ }).click();

  await expect(page).toHaveURL(/\/paises\/BRA$/);
  await expect(page.getByRole('region', { name: 'Brasil' })).toContainText('300.000');
  await expect(page.locator('.leaflet-popup-content')).toContainText('Brasil');
});

test('clicking Greenland opens its sovereign country, Denmark', async ({ page }) => {
  await page.goto('/');
  const greenland = page.locator('path[data-iso3="GRL"]');
  await expect(greenland).toHaveAttribute('data-code', 'DNK');

  await greenland.click();

  await expect(page).toHaveURL(/\/paises\/DNK$/);
  await expect(page.getByRole('region', { name: 'Dinamarca' })).toBeVisible();
});

test('a marker can be selected with the keyboard', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /^Índia:/ }).focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/paises\/IND$/);
});
