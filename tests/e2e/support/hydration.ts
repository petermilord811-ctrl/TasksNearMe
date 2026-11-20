import { expect, type Locator, type Page, type Route } from '@playwright/test';

/** The page's own scripts (Next's chunks): held back, the server's HTML shows and nothing hydrates. */
const pageScripts = (url: URL) => url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js');

/** Where `target` sits in the page's layout: offsets, which a hover lift or a pressed look's scale don't change. */
const layoutTop = (target: Locator) =>
  target.evaluate((element) => {
    let top = 0;
    for (let node = element as HTMLElement | null; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
    return top;
  });

/**
 * A press made before the page has hydrated and released after it, as on a slow phone or laptop: reloads with the
 * page's scripts held back, presses `target` in the server's HTML, lets the scripts through, waits until the page has
 * hydrated under the pointer, and releases. Whatever the browser draws differently from the server moves `target`
 * from under the pointer, and the release lands beside it: the Ship run at eb8cba5 lost "Download my data" that way,
 * when the passkeys section above it grew by its add form. Fails, saying so, if `target` moved.
 */
export async function pressWhileHydrating(page: Page, target: Locator): Promise<void> {
  const held: Route[] = [];
  let holding = true;
  let pressed = false;
  const release = async () => {
    holding = false;
    for (const route of held.splice(0)) await route.continue().catch(() => undefined);
  };
  await page.route(pageScripts, async (route) => {
    if (holding) held.push(route);
    else await route.continue();
  });
  try {
    // Once loaded, the browser would scroll back to where the page was at the reload, under the pressed pointer
    // (Playwright's scrolling doesn't count as the person's): this press is about hydration, so the page stays put.
    await page.evaluate(() => {
      history.scrollRestoration = 'manual';
    });
    await page.reload({ waitUntil: 'commit' });
    await target.scrollIntoViewIfNeeded();
    // Fonts swapping in move text too: measure once they're in (the page's own scripts aren't needed for that).
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const box = await target.boundingBox();
    if (!box) throw new Error('Nothing to press: the target has no box.');
    const before = await layoutTop(target);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    pressed = true;
    await release();
    await expect(page.locator('[data-hydrating]')).toHaveCount(0, { timeout: 30_000 });
    // What the browser draws differently from the server lands in React's render right after hydrating.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await layoutTop(target), 'the pressed target moved while the page hydrated').toBe(before);
    expect(await target.evaluate((element, { x, y }) => element.contains(document.elementFromPoint(x, y)), point), 'the pressed target is still under the pointer').toBe(true);
    await page.mouse.up();
    pressed = false;
  } finally {
    await release();
    if (pressed) await page.mouse.up();
    await page.unroute(pageScripts);
    await page.evaluate(() => {
      history.scrollRestoration = 'auto';
    }).catch(() => undefined);
  }
}
