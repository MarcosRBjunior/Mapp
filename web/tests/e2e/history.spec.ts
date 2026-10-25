import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('a country shows its history and the period updates the charts', async ({ page }) => {
  await page.goto('/paises/BRA');
  const cumulative = page.getByRole('region', { name: 'Crescimento acumulado' });
  const daily = page.getByRole('region', { name: 'Novos por dia' });

  await expect(cumulative).toContainText(
    'Casos acumulados de 08/02/2023 a 09/03/2023 — Brasil: de 133.680 para 137.160; Mundo: de 1.336.800 para 1.371.600.',
  );
  await expect(daily).toContainText(
    'Novos casos (Brasil) de 08/02/2023 a 09/03/2023: pico de 120 em 08/02/2023; média de 7 dias no último dia: 120.',
  );
  await expect(cumulative.locator('svg.recharts-surface').first()).toBeVisible();
  await expect(daily.locator('svg.recharts-surface').first()).toBeVisible();
  // The charts sit inside aria-hidden containers: no focusable SVG may be left there.
  await expect(page.locator('svg.recharts-surface[tabindex]')).toHaveCount(0);

  await page.getByRole('radio', { name: '7 dias' }).click();

  await expect(page).toHaveURL(/\/paises\/BRA\?period=7d$/);
  await expect(cumulative).toContainText(
    'Casos acumulados de 03/03/2023 a 09/03/2023 — Brasil: de 136.440 para 137.160; Mundo: de 1.364.400 para 1.371.600.',
  );
  await expect(daily).toContainText('Novos casos (Brasil) de 03/03/2023 a 09/03/2023');
});

test('clicking a marker opens the popup with the country history', async ({ page }) => {
  const weekly: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('granularity=week')) weekly.push(request.url());
  });
  await page.goto('/');
  const marker = page.getByRole('button', { name: /^Brasil:/ });
  await expect(marker).toBeVisible();
  // The popup content (and its fetch) only exists while the popup is open.
  expect(weekly).toHaveLength(0);

  await marker.click();

  await expect(page).toHaveURL(/\/paises\/BRA$/);
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText(
    'Casos acumulados de 22/01/2020 a 09/03/2023 — Brasil: de 600 para 137.160.',
  );
  expect(weekly.length).toBeGreaterThan(0);
  await expect(popup.locator('svg.recharts-surface').first()).toBeVisible();
  await expect(popup.locator('svg.recharts-surface[tabindex]')).toHaveCount(0);

  // Esc from inside the popup closes it and returns the focus to the marker.
  const close = popup.getByRole('button', { name: 'Fechar' });
  await close.focus();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(marker).toBeFocused();

  // Reopen from the keyboard and close with the button.
  await page.keyboard.press('Enter');
  await expect(popup).toContainText('Casos acumulados');
  await popup.getByRole('button', { name: 'Fechar' }).click();
  await expect(popup).toHaveCount(0);
});
