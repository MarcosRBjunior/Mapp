import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './test.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((violation) => ({
    rule: violation.id,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  expect(violations).toEqual([]);
}

test('the world view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Crescimento acumulado' })).toContainText(
    'Casos acumulados de',
  );
  await expect(page.getByRole('button', { name: /^Brasil:/ })).toBeVisible();
  await expectNoViolations(page);
});

test('a country', async ({ page }) => {
  await page.goto('/paises/BRA');
  await expect(page.getByRole('region', { name: 'Novos por dia' })).toContainText(
    'Novos casos (Brasil)',
  );
  await expect(page.getByRole('region', { name: 'Brasil' })).toContainText('300.000');
  await expectNoViolations(page);
});

test('a country with the marker popup open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Brasil:/ }).click();
  await expect(page.locator('.leaflet-popup')).toContainText('Casos acumulados de 22/01/2020');
  await expectNoViolations(page);
});

test('the about page', async ({ page }) => {
  await page.goto('/sobre');
  await expect(page.getByText(/Natural Earth — contornos/)).toBeVisible();
  await expectNoViolations(page);
});

test('the 404 page', async ({ page }) => {
  await page.goto('/nada-aqui');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expectNoViolations(page);
});

test('an unknown country', async ({ page }) => {
  await page.goto('/paises/XYZ');
  await expect(page.getByText('País não encontrado: XYZ')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Crescimento acumulado' })).toContainText(
    'Casos acumulados de',
  );
  await expectNoViolations(page);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the open menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Alternar menu lateral' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    await expectNoViolations(page);
  });
});
