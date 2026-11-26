import { CORS_HEADERS, resolveApi } from './api-routes.js';
import { expect, test } from './test.js';

const NEUTRAL_FILL = '#e5e7eb';
const NO_DATA_FILL = '#d1d5db';
const LOWEST_CASES_FILL = '#fee2e2';

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

test('a country with a total of 0 is painted and still reachable by keyboard', async ({ page }) => {
  // Registered after the fixture's catch-all, so this handler answers the list first.
  await page.route('http://api.test/api/v1/countries?*', async (route) => {
    const { body } = resolveApi(new URL(route.request().url())) as {
      body: { countries: { code: string; total: number | null }[] };
    };
    for (const country of body.countries) if (country.code === 'BRA') country.total = 0;
    await route.fulfill({ status: 200, headers: CORS_HEADERS, json: body });
  });
  await page.goto('/?view=choropleth');

  await expect(page.locator('path[data-iso3="BRA"]')).toHaveAttribute('fill', LOWEST_CASES_FILL);
  await expect(page.getByRole('button', { name: /^Brasil:/ })).toBeAttached();

  await page.getByRole('radio', { name: 'Marcadores' }).click();
  await expect(page.getByRole('button', { name: /^Brasil:/ })).toHaveCount(0);
});

test('polygons outside the base use the no-data fill of the legend', async ({ page }) => {
  await page.goto('/?view=choropleth');

  await expect(page.locator('path[data-iso3="TKM"]')).toHaveAttribute('fill', NO_DATA_FILL);
  await expect(page.locator('path[data-iso3="ZWE"]')).toHaveAttribute('fill', NO_DATA_FILL);
});

test('without the outlines the choropleth falls back to the sized markers', async ({ page }) => {
  await page.route('**/geo/countries-110m.geojson', (route) => route.fulfill({ status: 500 }));
  await page.goto('/?view=choropleth');

  await expect(page.getByText('Contornos indisponíveis')).toBeVisible();
  const legend = page.getByRole('group', { name: 'Legenda: Total de casos' });
  await expect(legend.locator('circle').first()).toBeAttached();
  await expect(legend).not.toContainText('Sem dados');
});
