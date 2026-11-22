import { expect, test } from '@playwright/test';
import { like } from 'drizzle-orm';
import { communityPosts } from '../../src/modules/community/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * The community (completion plan 7.7–7.8, in the neighborhood portal since 9.10), two people in two browsers: Maya
 * asks her neighbors for a recommendation in the composer; Lee, with the portal open, sees "1 new · Show", opens
 * it, and answers by naming himself;
 * Maya's page shows the answer without a reload, she pins it, and Lee's answer carries the pin. Contact details
 * stay masked, and a crime report is turned away.
 */
test('neighbors ask, answer, recommend a helper and pin the answer, live', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'posts shared data; desktop only');
  test.setTimeout(180_000);
  const mayaContext = await browser.newContext();
  const leeContext = await browser.newContext();
  const maya = await mayaContext.newPage();
  const lee = await leeContext.newPage();
  try {
    await devSignIn(lee, 'lee@example.test');
    await lee.goto('/app/community?area=all&sort=new');
    await expect(lee.getByRole('heading', { level: 1, name: 'All of Austin' })).toBeVisible();

    await devSignIn(maya, 'maya@example.test');
    await maya.goto('/app/community');
    // The composer opens in place on a recommendation request (a tap before the page hydrates opens the same form on
    // its own page instead). Phones show only the prompt; wider screens also show each kind.
    await maya.getByRole('region', { name: 'Start a post' }).getByRole('link', { name: 'Ask your neighbors…' }).click();
    const composer = maya.getByRole('form', { name: /^(Start a post|New post)$/ });
    await expect(composer.getByRole('radio', { name: 'Ask for a recommendation' })).toBeChecked();
    // Crime and safety reports belong with the police.
    await composer.getByLabel('Title').fill('Suspicious person on our street');
    await composer.getByLabel('Details').fill('Saw a suspicious man looking into cars last night on Elm.');
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(composer.getByText(/Crime and safety reports belong with the police/).first()).toBeVisible();

    const title = `Who do you recommend for a bookshelf? (${Date.now()})`;
    await composer.getByLabel('Title').fill(title);
    await composer.getByLabel('Details').fill('A tall flat-pack bookshelf that needs anchoring. Text me at 512-555-0142.');
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(maya.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
    // The post shows the number masked. (The form page stays mounted but hidden after the move, typed text and all,
    // so the check looks inside the post itself.)
    const posted = maya.getByRole('article', { name: title });
    await expect(posted).toContainText('[hidden]');
    await expect(posted).not.toContainText('512-555-0142');
    const postUrl = maya.url();

    // Lee's open portal announces it without moving; Show brings it in.
    const pill = lee.getByRole('button', { name: /^\d+ new · Show$/ });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await pill.click();
    // Exact: the rail's "Waiting for an answer" lists it too, its row named with the service and place after the title.
    await lee.getByRole('link', { name: title, exact: true }).click();
    await expect(lee.getByRole('heading', { level: 1, name: title })).toBeVisible();

    // Lee answers and names himself (a self-tag).
    await lee.getByRole('textbox', { name: 'Your reply' }).fill('I anchor tall shelves most weekends. Saturday works.');
    await lee.getByLabel('Recommend a helper (optional)').selectOption({ label: 'Lee M. (you)' });
    await lee.getByRole('button', { name: 'Reply', exact: true }).click();
    // Inside the reply itself: for a moment the box still holds the words too.
    const leeReply = lee.getByRole('article', { name: 'Lee M.' });
    await expect(leeReply.getByText('I anchor tall shelves most weekends. Saturday works.')).toBeVisible({ timeout: 15_000 });
    await expect(leeReply.getByText('Recommended themself')).toBeVisible();

    // Maya's page shows it without a reload; she pins it.
    await maya.evaluate(() => {
      (window as unknown as { liveMarker: boolean }).liveMarker = true;
    });
    const answer = maya.getByRole('article', { name: 'Lee M.' });
    await expect(answer).toBeVisible({ timeout: 15_000 });
    expect(await maya.evaluate(() => (window as unknown as { liveMarker?: boolean }).liveMarker)).toBe(true);
    await answer.getByRole('button', { name: /^More: Lee M\./ }).click();
    await maya.getByRole('menuitem', { name: 'Pin as the answer' }).click();
    await expect(answer.getByText('Pinned answer')).toBeVisible({ timeout: 15_000 });

    // Lee marks Maya's question Helpful; it counts once.
    await lee.goto(postUrl);
    const helpful = lee.getByRole('group', { name: 'Reactions' }).first().getByRole('button', { name: /Helpful/ });
    // The button answers at once; wait for the server's answer before reloading (a reload cancels the request).
    const saved = lee.waitForResponse((response) => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']));
    await helpful.click();
    await expect(helpful).toHaveAttribute('aria-pressed', 'true');
    await saved;
    await lee.reload();
    await expect(lee.getByRole('group', { name: 'Reactions' }).first().getByRole('button', { name: /Helpful/ })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await mayaContext.close();
    await leeContext.close();
  }
});

/** Old market-wide posts by Ana, so the feed runs past a page; removed again at the end. */
async function withOldPosts<T>(count: number, run: (titles: string[]) => Promise<T>): Promise<T> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '', { max: 1 });
  const prefix = `cpo_e2efeed_${Date.now().toString(36)}_`;
  // A year back: older than anything else in the feed, so they come last in "New".
  const start = Date.now() - 365 * 86_400_000;
  const titles = Array.from({ length: count }, (_, index) => `Feed check ${prefix.slice(12, -1)} #${String(count - index).padStart(2, '0')}`);
  try {
    await db.insert(communityPosts).values(titles.map((title, index) => {
      const at = new Date(start - index * 3_600_000);
      return { id: `${prefix}${String(index).padStart(2, '0')}`, marketId: 'mkt_austin', areaId: null, authorUserId: 'usr_ana', kind: 'tip', title, body: 'An older tip, for the feed check.', lastActivityAt: at, createdAt: at, updatedAt: at };
    }));
    return await run(titles);
  } finally {
    await db.delete(communityPosts).where(like(communityPosts.id, `${prefix}%`));
    await pool.end();
  }
}

test('the feed keeps going: older posts are added as the reader reaches the end, then "You\'re all caught up"', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'adds posts to the shared feed; desktop only');
  test.setTimeout(120_000);
  await withOldPosts(25, async (titles) => {
    await devSignIn(page, 'maya@example.test');
    // Tips across the market, newest first: the old tips come last.
    await page.goto('/app/community?area=all&type=tip&sort=new');
    await expect(page.getByRole('heading', { level: 1, name: 'All of Austin' })).toBeVisible();
    const feed = page.locator('#portal-stream li[data-item]');
    // A page holds 20: the oldest post isn't there until the reader reaches the end.
    await expect(feed).toHaveCount(20);
    const oldest = page.getByRole('link', { name: titles[titles.length - 1]! });
    await expect(oldest).toHaveCount(0);

    // Reaching the end adds the next page by itself, without a tap.
    const more = page.getByRole('link', { name: 'Show more' });
    await more.scrollIntoViewIfNeeded();
    await expect.poll(() => feed.count(), { timeout: 15_000 }).toBeGreaterThan(20);
    // And the rest, scrolling on (after three pages by themselves, "Show more posts" waits for a tap).
    const caughtUp = page.getByText("You're all caught up");
    for (let step = 0; step < 20 && !(await caughtUp.isVisible()); step += 1) {
      if ((await feed.count()) >= 80 && (await more.isVisible())) await more.click();
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(300);
    }
    await expect(caughtUp).toBeVisible({ timeout: 15_000 });
    await expect(oldest).toBeVisible();
    expect(await feed.count()).toBeGreaterThan(20);
    // Each post once.
    const ids = await feed.evaluateAll((items) => items.map((item) => item.querySelector('a[href*="/app/community/"]')?.getAttribute('href')));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
