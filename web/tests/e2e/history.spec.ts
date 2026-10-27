import { expect, test } from './test.js';

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

  // Wait for the selection to be rendered: it reopens the popup if it lands after the Esc.
  await expect(marker).toHaveAttribute('stroke', '#111827');
  // Esc from inside the popup closes it and returns the focus to the marker.
  // A key press first, so the script focus counts as keyboard focus (:focus-visible).
  const close = popup.getByRole('button', { name: 'Fechar' });
  await page.keyboard.press('Shift');
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

test('selecting the open country again reopens its popup', async ({ page }) => {
  await page.goto('/');
  const marker = page.getByRole('button', { name: /^Brasil:/ });
  await marker.click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('Brasil');
  // Close only after the navigation was rendered, or its new selection reopens the popup.
  await expect(marker).toHaveAttribute('stroke', '#111827');

  await marker.focus();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);

  const search = page.getByRole('combobox', { name: 'Buscar país' });
  await search.fill('brasil');
  await search.press('Enter');

  await expect(popup).toContainText('Casos acumulados de 22/01/2020');
});

test('a closed popup does not fetch its series again', async ({ page }) => {
  const weekly: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('granularity=week')) weekly.push(request.url());
  });
  await page.goto('/');
  const marker = page.getByRole('button', { name: /^Brasil:/ });
  await marker.click();
  await expect(page.locator('.leaflet-popup')).toContainText('Casos acumulados de 22/01/2020');
  await expect(marker).toHaveAttribute('stroke', '#111827');
  await marker.focus();
  await page.keyboard.press('Escape');
  const before = weekly.length;

  await page.getByRole('radio', { name: 'Mortes' }).click();
  await expect(page.getByRole('button', { name: /^Brasil:.*mortes/ })).toBeVisible();

  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  expect(weekly).toHaveLength(before);
});

test('switching to the log scale redraws the cumulative axis', async ({ page }) => {
  await page.goto('/paises/BRA');
  const cumulative = page.getByRole('region', { name: 'Crescimento acumulado' });
  const ticks = cumulative.locator(
    '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value',
  );
  await expect(ticks.first()).toBeVisible();
  const before = await ticks.allTextContents();

  await cumulative.getByRole('radio', { name: 'Log' }).click();

  await expect.poll(() => ticks.allTextContents()).not.toEqual(before);
});

test('Back after closing the popup and switching the metric does not reopen it', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Buscar país' });
  await search.fill('brasil');
  await search.press('Enter');
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('Casos acumulados de 22/01/2020');
  await expect(page).toHaveURL(/\/paises\/BRA/);

  await page.getByRole('button', { name: /^Brasil:/ }).focus();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await page.getByRole('radio', { name: 'Mortes' }).click();
  await expect(page.getByRole('radio', { name: 'Mortes' })).toBeChecked();

  await page.goBack();

  await expect(page.getByRole('radio', { name: 'Casos' })).toBeChecked();
  await expect(popup).toHaveCount(0);
});
