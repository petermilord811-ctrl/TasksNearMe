import { expect, type BrowserContext } from '@playwright/test';

/**
 * The newest code sent to `to` (an email address, lower case as the app stores it, or a phone number), read from the
 * dev outbox. The outbox page doesn't refresh itself, and a code can land a moment after the step that sent it, so
 * this reloads until the message is there: a single read flaked 8 to 12 times in 20 repeats (post-before-account,
 * 2026-11-21). It waits for the message to be attached, not visible: an email with a designed version keeps its plain
 * text folded. Welcome emails are skipped. `newerThan`: a code that doesn't count (one already used), to wait for the
 * next.
 */
export async function latestCode(context: BrowserContext, to: string, options: { newerThan?: string; timeout?: number } = {}): Promise<string> {
  const outbox = await context.newPage();
  try {
    const message = outbox.locator(`[data-testid="outbox-message"][data-to="${to}"]:not([data-tag="welcome"]) pre`).first();
    let code: string | undefined;
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
      await expect(message).toBeAttached({ timeout: 2_000 });
      code = (await message.textContent())?.match(/\b(\d{6})\b/)?.[1];
      expect(code, `a code sent to ${to}`).toBeDefined();
      if (options.newerThan) expect(code, `a code newer than ${options.newerThan}`).not.toBe(options.newerThan);
    }).toPass({ timeout: options.timeout ?? 60_000 });
    return code!;
  } finally {
    await outbox.close();
  }
}
