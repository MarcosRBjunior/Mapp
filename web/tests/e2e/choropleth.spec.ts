import { expect, test } from './test.js';

const NEUTRAL_FILL = '#e5e7eb';

test('the map switches to the choropleth and keeps it in the URL', async ({ page }) => {
  await page.goto('/?metric=deaths');
  const brazil = page.locator('path[data-iso3="BRA"]');
  await expect(brazil).toHaveAttribute('fill', NEUTRAL_FILL);

  await page.getByRole('radio', { name: 'Cores' }).click();

  await expect(page).toHaveURL(/\?metric=deaths&view=choropleth$/);
  await expect(brazil).not.toHaveAttribute('fill', NEUTRAL_FILL);
  await expect(page.getByRole('group', { name: 'Legenda: Total de mortes' })).toContainText(
    'Sem dados',
  );

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Cores' })).toBeChecked();
  await expect(brazil).not.toHaveAttribute('fill', NEUTRAL_FILL);

  await page.getByRole('radio', { name: 'Marcadores' }).click();
  await expect(page).toHaveURL(/\?metric=deaths$/);
  await expect(brazil).toHaveAttribute('fill', NEUTRAL_FILL);
});

test('in the choropleth a country is still selected from its dot, by keyboard', async ({
  page,
}) => {
  await page.goto('/?view=choropleth');

  await page.getByRole('button', { name: /^Brasil:/ }).focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/paises\/BRA\?view=choropleth$/);
  await expect(page.locator('.leaflet-popup-content')).toContainText('Brasil');
});

test('links back to the map keep the choropleth', async ({ page }) => {
  await page.goto('/paises/BRA?view=choropleth');

  await page.getByRole('link', { name: 'Mapp' }).click();

  await expect(page).toHaveURL(/\/\?view=choropleth$/);
});
