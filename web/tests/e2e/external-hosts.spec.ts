import { test } from './test.js';

test('fails when the page calls an external host', async ({ page }) => {
  // The fixture's check runs after the body; this test passes only if that check fails.
  test.fail();
  await page.goto('/sobre');
  await page.evaluate(async () => {
    await fetch('https://example.com/').catch(() => undefined);
  });
});
