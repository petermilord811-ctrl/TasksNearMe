import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** The signed-in home (UI-023), read-only: the client's and the helper's dashboards on the seeded data. */

test("the client's home: attention, upcoming bookings, open tasks", async ({ page }) => {
  await devSignIn(page, 'ben@example.test');
  await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening), Ben/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  // Ben's TV booking is coming up.
  await expect(page.getByRole('link', { name: /Anchor a tall bookshelf to the wall/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Post a task' }).first()).toHaveAttribute('href', '/app/tasks/new');
});

test("the helper's home: earnings, upcoming bookings, offers", async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening), Jordan/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Earnings at a glance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active offers' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Anchor a tall bookshelf to the wall/ }).first()).toBeVisible();
});
