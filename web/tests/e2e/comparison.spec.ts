import { expect, test } from './test.js';

test('clicking a ranking item opens the country with its rank and share', async ({ page }) => {
  await page.goto('/');
  const ranking = page.getByRole('region', { name: 'Top 10 — casos em 09/03/2023' });

  await ranking.getByRole('link', { name: 'Brasil' }).click();

  await expect(page).toHaveURL(/\/paises\/BRA$/);
  const card = page.getByRole('region', { name: 'Brasil' });
  await expect(card).toContainText('nº 2 de 4');
  await expect(card).toContainText('30,0%');
  await expect(ranking.getByRole('link', { name: 'Brasil' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('changing the period updates the time card and the URL', async ({ page }) => {
  await page.goto('/paises/BRA');
  const card = page.getByRole('region', { name: 'Por tempo' });
  await expect(card).toContainText('3.600');

  await page.getByRole('radio', { name: '7 dias' }).click();

  await expect(page).toHaveURL(/\/paises\/BRA\?period=7d$/);
  await expect(card).toContainText('840');
  await expect(card).toContainText('De 03/03/2023 a 09/03/2023');
});
