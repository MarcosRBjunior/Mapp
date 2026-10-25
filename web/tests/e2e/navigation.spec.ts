import { expect, test } from './test.js';

test('a direct link opens the country with the metric from the URL', async ({ page }) => {
  await page.goto('/paises/BRA?metric=deaths');

  await expect(page.getByRole('region', { name: 'Brasil' })).toContainText('6.000');
  await expect(page.getByRole('radio', { name: 'Mortes' })).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveTitle('Brasil — Mapp');
});

test('an unknown country shows a warning and the world view', async ({ page }) => {
  await page.goto('/paises/XYZ');

  await expect(page.getByText('País não encontrado: XYZ')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Por país' })).toContainText(
    'Selecione um país no mapa ou na busca',
  );
  await expect(page.getByRole('button', { name: /^Brasil:/ })).toBeVisible();
});

test('searching opens the country', async ({ page }) => {
  await page.goto('/');

  const search = page.getByRole('combobox', { name: 'Buscar país' });
  await search.fill('india');
  await search.press('Enter');

  await expect(page).toHaveURL(/\/paises\/IND$/);
});

test('the about page shows the attributions', async ({ page }) => {
  await page.goto('/sobre');

  await expect(page.getByText(/Natural Earth — contornos/)).toBeVisible();
  await expect(page.getByText('Navio Diamond Princess')).toBeVisible();
});

test('an unknown route shows the 404 page', async ({ page }) => {
  await page.goto('/nada-aqui');

  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the menu opens, navigates and closes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Alternar menu lateral' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });

    await menu.getByRole('link', { name: 'Sobre' }).click();

    await expect(page).toHaveURL(/\/sobre$/);
    await expect(menu).toBeHidden();
  });
});
