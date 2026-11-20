import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { aiWriterFromEnv, createFallbackWriter, type ProviderHealth } from './fallback';
import { aiReadingSetUp, aiWritingSetUp } from './index';
import { createTaskDrafter } from './task-drafter';
import { AiRefusedError, AiUnavailableError, type AiWriter } from './writer';

const input = { system: 'Be brief.', prompt: 'Say hi.', schema: z.object({ text: z.string() }) };
const slow = new AiUnavailableError("Kimi didn't answer (nothing within 90 s)");
const noCredits = new AiUnavailableError("Claude didn't answer (HTTP 400)");

/** A provider that answers with the outcomes given, one call at a time; the last one repeats. */
function provider(name: string, ...outcomes: (string | Error)[]) {
  const write = vi.fn(async (_input: { system: string; prompt: string }) => {
    const outcome = outcomes.length > 1 ? outcomes.shift()! : outcomes[0]!;
    if (outcome instanceof Error) throw outcome;
    return { text: outcome };
  });
  return { name, write } as unknown as AiWriter & { write: typeof write };
}

/** A chain with its own clock, health record and log. */
function chain(...writers: AiWriter[]) {
  let clock = 1_000_000;
  const health = new Map<string, ProviderHealth>();
  const log = vi.fn();
  return {
    writer: createFallbackWriter(writers, { health, now: () => clock, log }),
    health,
    log,
    clock: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    /** Waits for any background check to finish. */
    settle: async () => {
      for (const record of health.values()) await record.checking;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Kimi first, Claude when Kimi isn’t working', () => {
  it('asks Kimi first and leaves Claude alone while Kimi answers', async () => {
    const kimi = provider('kimi:k', 'from Kimi');
    const claude = provider('claude:c', 'from Claude');
    const { writer } = chain(kimi, claude);
    expect(writer.name).toBe('kimi:k then claude:c');
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
    expect(claude.write).not.toHaveBeenCalled();
  });

  it('sends the same request to Claude when Kimi fails, then skips Kimi for a minute so nobody waits on it', async () => {
    const kimi = provider('kimi:k', slow);
    const claude = provider('claude:c', 'from Claude');
    const { writer, log, advance } = chain(kimi, claude);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Claude' });
    expect(kimi.write).toHaveBeenCalledWith(input);
    expect(claude.write).toHaveBeenCalledWith(input);
    expect(log).toHaveBeenCalledWith("[ai] kimi:k isn't working (Kimi didn't answer (nothing within 90 s)): paused for 1 min");
    advance(59_000);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Claude' });
    expect(kimi.write).toHaveBeenCalledTimes(1);
    expect(claude.write).toHaveBeenCalledTimes(2);
  });

  it('keeps asking a paused Kimi while Claude isn’t working either (no credits, say): a slow answer beats none', async () => {
    const kimi = provider('kimi:k', slow, 'from Kimi');
    const claude = provider('claude:c', noCredits);
    const { writer, health } = chain(kimi, claude);
    await expect(writer.write(input)).rejects.toThrow('HTTP 400');
    // Both failed, and neither is skipped for the other: Kimi is asked again at once, and answers.
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
    expect(claude.write).toHaveBeenCalledTimes(1);
    expect(health.get('kimi:k')).toMatchObject({ failures: 0 });
    // Kimi works, so Claude isn't asked until Kimi fails again.
    await writer.write(input);
    expect(claude.write).toHaveBeenCalledTimes(1);
  });

  it('checks Kimi in the background once its pause is over, and puts it first again when the check works', async () => {
    const kimi = provider('kimi:k', slow, 'from Kimi');
    const claude = provider('claude:c', 'from Claude');
    const { writer, log, advance, settle } = chain(kimi, claude);
    await writer.write(input);
    advance(60_000);
    // This request still goes to Claude at once; the check runs beside it, with a fixed question.
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Claude' });
    expect(kimi.write).toHaveBeenCalledTimes(2);
    expect(kimi.write.mock.calls[1]![0]).toMatchObject({ prompt: 'Is this working? Answer with ok set to true.' });
    await settle();
    expect(log).toHaveBeenLastCalledWith('[ai] kimi:k works again');
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
    expect(claude.write).toHaveBeenCalledTimes(2);
  });

  it('pauses Kimi longer after each failed check, 30 minutes at most', async () => {
    const kimi = provider('kimi:k', slow);
    const claude = provider('claude:c', 'from Claude');
    const { writer, health, clock, advance, settle } = chain(kimi, claude);
    await writer.write(input);
    const minutes: number[] = [];
    for (let round = 0; round < 7; round++) {
      const pause = health.get('kimi:k')!.pausedUntil - clock();
      minutes.push(pause / 60_000);
      advance(pause);
      await writer.write(input);
      await settle();
    }
    expect(minutes).toEqual([1, 2, 4, 8, 16, 30, 30]);
    expect(claude.write).toHaveBeenCalledTimes(8);
  });

  it('takes a refusal as final: the provider works, so Claude isn’t asked after Kimi declines', async () => {
    const kimi = provider('kimi:k', new AiRefusedError('Kimi declined the request'));
    const claude = provider('claude:c', 'from Claude');
    const { writer, health } = chain(kimi, claude);
    await expect(writer.write(input)).rejects.toThrow('Kimi declined the request');
    expect(claude.write).not.toHaveBeenCalled();
    expect(health.get('kimi:k')).toMatchObject({ failures: 0, pausedUntil: 0 });
    // A paused Kimi asked while Claude fails too: declining shows it works again.
    const both = chain(provider('kimi:k', slow, new AiRefusedError('Kimi declined the request')), provider('claude:c', noCredits));
    await expect(both.writer.write(input)).rejects.toThrow('HTTP 400');
    await expect(both.writer.write(input)).rejects.toThrow('Kimi declined the request');
    expect(both.health.get('kimi:k')).toMatchObject({ failures: 0, pausedUntil: 0 });
    expect(both.log).toHaveBeenCalledWith('[ai] kimi:k works again');
    // Claude answering for a failed Kimi: its refusal is the answer.
    const covering = chain(provider('kimi:k', slow), provider('claude:c', new AiRefusedError('Claude declined the request')));
    await expect(covering.writer.write(input)).rejects.toThrow('Claude declined the request');
  });

  it('asks both again while both fail, passes the last error on, and lets a bug surface at once', async () => {
    const kimi = provider('kimi:k', slow);
    const claude = provider('claude:c', new AiUnavailableError("Claude didn't answer (HTTP 529)"));
    const { writer } = chain(kimi, claude);
    await expect(writer.write(input)).rejects.toThrow('HTTP 529');
    await expect(writer.write(input)).rejects.toThrow('HTTP 529');
    expect(kimi.write).toHaveBeenCalledTimes(2);
    expect(claude.write).toHaveBeenCalledTimes(2);
    const buggy = chain(provider('kimi:k', new TypeError('boom')), provider('claude:c', 'from Claude'));
    await expect(buggy.writer.write(input)).rejects.toThrow('boom');
  });

  it('shares what it learned across the whole process', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kimi = provider('kimi:shared-test', slow);
    const claude = provider('claude:shared-test', 'from Claude');
    await createFallbackWriter([kimi, claude]).write(input);
    // Another copy of the chain (another bundle, the job runner) skips Kimi too.
    await createFallbackWriter([kimi, claude]).write(input);
    expect(kimi.write).toHaveBeenCalledTimes(1);
  });
});

describe('the writer for this environment', () => {
  it('is Kimi then Claude with both keys, either one alone, or none', () => {
    expect(aiWriterFromEnv({ KIMI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })?.name).toBe('kimi:moonshotai/kimi-k3.1-pro then claude:claude-opus-5-5');
    expect(aiWriterFromEnv({ ANTHROPIC_API_KEY: 'a' })?.name).toBe('claude:claude-opus-5-5');
    expect(aiWriterFromEnv({ KIMI_API_KEY: 'k' })?.name).toBe('kimi:moonshotai/kimi-k3.1-pro');
    expect(aiWriterFromEnv({})).toBeNull();
    expect(createTaskDrafter({ KIMI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })?.name).toBe('kimi:moonshotai/kimi-k3.1-pro then claude:claude-opus-5-5');
  });

  it('leaves Kimi out of a production build without KIMI_IN_PRODUCTION=yes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(aiWriterFromEnv({ NODE_ENV: 'production', KIMI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })?.name).toBe('claude:claude-opus-5-5');
    expect(aiWritingSetUp({ NODE_ENV: 'production', KIMI_API_KEY: 'k' })).toBe(false);
    expect(aiWritingSetUp({ NODE_ENV: 'production', KIMI_API_KEY: 'k', KIMI_IN_PRODUCTION: 'yes' })).toBe(true);
  });

  it('reads documents with Claude only: a Kimi key alone sets up the writing, not the reading', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kimiOnly = { NODE_ENV: 'production', KIMI_API_KEY: 'k', KIMI_IN_PRODUCTION: 'yes' };
    expect(aiWritingSetUp(kimiOnly)).toBe(true);
    expect(aiReadingSetUp(kimiOnly)).toBe(false);
    expect(aiReadingSetUp({ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'a' })).toBe(true);
    expect(aiReadingSetUp({ NODE_ENV: 'development' })).toBe(true);
  });
});
