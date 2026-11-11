import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Owned by Claude. Renders every preview registered in src/ui/previews/registry.ts,
 * fails on runtime errors or serious/critical axe violations, and saves a full-page
 * screenshot per preview and viewport to artifacts/ui-previews/<project>/<id>.png.
 */
test('every UI preview renders, passes axe, and is captured', async ({ page }, testInfo) => {
  await page.goto('/dev/ui');
  const ids = await page
    .locator('[data-preview-id]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('data-preview-id') ?? ''));
  test.skip(ids.length === 0, 'No previews registered yet');

  let errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });

  for (const id of ids) {
    await test.step(id, async () => {
      errors = [];
      const path = `/dev/ui/${id.split('/').map(encodeURIComponent).join('/')}`;
      await page.goto(path);
      const root = page.locator(`[data-preview-root="${id}"]`);
      await expect(root, `preview ${id} should render`).toBeVisible();

      const results = await new AxeBuilder({ page }).include(`[data-preview-root="${id}"]`).analyze();
      const serious = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`);
      expect(serious, `axe violations in ${id}`).toEqual([]);

      await page.screenshot({
        path: `artifacts/ui-previews/${testInfo.project.name}/${id.replaceAll('/', '__')}.png`,
        fullPage: true,
      });
      expect(errors, `runtime errors in ${id}`).toEqual([]);
    });
  }
});
