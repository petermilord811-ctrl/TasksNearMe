import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { aiProviderOrder, aiWriterFromEnv, createBalancedWriter, type ModelHealth } from './balancer';
import { aiReadingSetUp, aiWritingSetUp } from './index';
import { createTaskDrafter } from './task-drafter';
import { AiRateLimitedError, AiRefusedError, AiUnavailableError, type AiWriter } from './writer';

const input = { system: 'Be brief.', prompt: 'Say hi.', schema: z.object({ text: z.string() }) };
const slow = new AiUnavailableError("Kimi didn't answer (nothing within 90 s)");
const overloaded = new AiUnavailableError("Gemini didn't answer (HTTP 503)");
const atLimit = (ms?: number) => new AiRateLimitedError('Gemini is at its free limit (HTTP 429)', ms);

/** A model that answers with the outcomes given, one call at a time; the last one repeats. */
function model(name: string, ...outcomes: (string | Error)[]) {
  const write = vi.fn(async (_input: { system: string; prompt: string }) => {
    const outcome = outcomes.length > 1 ? outcomes.shift()! : outcomes[0]!;
    if (outcome instanceof Error) throw outcome;
    return { text: outcome };
  });
  return { name, write } as unknown as AiWriter & { write: typeof write };
}

/** A balancer with its own clock, health record and log. */
function balancer(...writers: AiWriter[]) {
  let clock = 1_000_000;
  const health = new Map<string, ModelHealth>();
  const log = vi.fn();
  return {
    writer: createBalancedWriter(writers, { health, now: () => clock, log }),
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

describe('the load balancer over free models', () => {
  it('asks the first model and leaves the rest alone while it answers', async () => {
    const gemini = model('gemini:a', 'from Gemini');
    const kimi = model('kimi:k', 'from Kimi');
    const groq = model('groq:g', 'from Groq');
    const { writer } = balancer(gemini, kimi, groq);
    expect(writer.name).toBe('gemini:a then kimi:k then groq:g');
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Gemini' });
    expect(kimi.write).not.toHaveBeenCalled();
    expect(groq.write).not.toHaveBeenCalled();
  });

  it('skips a model at its free limit until the time it gave, without counting a failure, and takes it back after', async () => {
    const gemini = model('gemini:a', atLimit(45_000), 'from Gemini');
    const groq = model('groq:g', 'from Groq');
    const { writer, health, log, advance } = balancer(gemini, groq);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Groq' });
    expect(health.get('gemini:a')).toMatchObject({ failures: 0, limitedUntil: 1_045_000 });
    expect(log).toHaveBeenCalledWith('[ai] gemini:a is at its free limit: skipped for 45 s');
    advance(44_000);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Groq' });
    expect(gemini.write).toHaveBeenCalledTimes(1);
    advance(1_000);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Gemini' });
  });

  it('waits a minute when a 429 says nothing, and a day at most', async () => {
    const { writer, health } = balancer(model('gemini:a', atLimit()), model('groq:g', 'from Groq'));
    await writer.write(input);
    expect(health.get('gemini:a')!.limitedUntil).toBe(1_000_000 + 60_000);
    const long = balancer(model('gemini:a', atLimit(9 * 24 * 3_600_000)), model('groq:g', 'from Groq'));
    await long.writer.write(input);
    expect(long.health.get('gemini:a')!.limitedUntil).toBe(1_000_000 + 24 * 3_600_000);
  });

  it('fails at once when every model is at its limit, saying when the first frees up', async () => {
    const gemini = model('gemini:a', atLimit(30_000));
    const groq = model('groq:g', new AiRateLimitedError('Groq is at its free limit (HTTP 429)', 90_000));
    const { writer, advance } = balancer(gemini, groq);
    await expect(writer.write(input)).rejects.toThrow('Groq is at its free limit (HTTP 429)');
    advance(10_000);
    const nobody = writer.write(input);
    await expect(nobody).rejects.toBeInstanceOf(AiRateLimitedError);
    await expect(nobody).rejects.toMatchObject({ message: 'Every model is at its free limit', retryAfterMs: 20_000 });
    expect(gemini.write).toHaveBeenCalledTimes(1);
    expect(groq.write).toHaveBeenCalledTimes(1);
  });

  it('treats each model as its own bucket: the next model of the same provider answers when one is full', async () => {
    const lite = model('gemini:lite', atLimit(60_000));
    const flash = model('gemini:flash', 'from Flash');
    const groq = model('groq:g', 'from Groq');
    const { writer } = balancer(lite, flash, groq);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Flash' });
    expect(groq.write).not.toHaveBeenCalled();
  });

  it('sends the request on when a model fails, then skips it for a minute so nobody waits on it', async () => {
    const gemini = model('gemini:a', overloaded);
    const kimi = model('kimi:k', 'from Kimi');
    const { writer, log, advance } = balancer(gemini, kimi);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
    expect(gemini.write).toHaveBeenCalledWith(input);
    expect(kimi.write).toHaveBeenCalledWith(input);
    expect(log).toHaveBeenCalledWith("[ai] gemini:a isn't working (Gemini didn't answer (HTTP 503)): paused for 1 min");
    advance(59_000);
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
    expect(gemini.write).toHaveBeenCalledTimes(1);
  });

  it('keeps asking a paused model while nothing after it works: a slow answer beats none', async () => {
    const kimi = model('kimi:k', slow, 'from Kimi');
    const groq = model('groq:g', new AiUnavailableError("Groq didn't answer (HTTP 500)"));
    const { writer, health } = balancer(kimi, groq);
    await expect(writer.write(input)).rejects.toThrow('HTTP 500');
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
    expect(groq.write).toHaveBeenCalledTimes(1);
    expect(health.get('kimi:k')).toMatchObject({ failures: 0 });
  });

  it('counts a model behind its limit as not working when deciding whether to skip a paused one', async () => {
    const kimi = model('kimi:k', slow, 'from Kimi');
    const groq = model('groq:g', atLimit(600_000));
    const { writer } = balancer(kimi, groq);
    await expect(writer.write(input)).rejects.toThrow('Gemini is at its free limit');
    // Groq is parked, so the paused Kimi is asked rather than skipped.
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Kimi' });
  });

  it('checks a paused model in the background once its pause is over, and puts it back in line when the check works', async () => {
    const gemini = model('gemini:a', overloaded, 'from Gemini');
    const groq = model('groq:g', 'from Groq');
    const { writer, log, advance, settle } = balancer(gemini, groq);
    await writer.write(input);
    advance(60_000);
    // This request still goes on at once; the check runs beside it, with a fixed question.
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Groq' });
    expect(gemini.write).toHaveBeenCalledTimes(2);
    expect(gemini.write.mock.calls[1]![0]).toMatchObject({ prompt: 'Is this working? Answer with ok set to true.' });
    await settle();
    expect(log).toHaveBeenLastCalledWith('[ai] gemini:a works again');
    await expect(writer.write(input)).resolves.toEqual({ text: 'from Gemini' });
  });

  it('parks a model whose check hits its free limit instead of counting a failure', async () => {
    const gemini = model('gemini:a', overloaded, atLimit(120_000));
    const { writer, health, advance, settle } = balancer(gemini, model('groq:g', 'from Groq'));
    await writer.write(input);
    advance(60_000);
    await writer.write(input);
    await settle();
    expect(health.get('gemini:a')).toMatchObject({ failures: 0, limitedUntil: 1_060_000 + 120_000 });
  });

  it('pauses a failing model longer after each failed check, 30 minutes at most', async () => {
    const gemini = model('gemini:a', overloaded);
    const groq = model('groq:g', 'from Groq');
    const { writer, health, clock, advance, settle } = balancer(gemini, groq);
    await writer.write(input);
    const minutes: number[] = [];
    for (let round = 0; round < 7; round++) {
      const pause = health.get('gemini:a')!.pausedUntil - clock();
      minutes.push(pause / 60_000);
      advance(pause);
      await writer.write(input);
      await settle();
    }
    expect(minutes).toEqual([1, 2, 4, 8, 16, 30, 30]);
    expect(groq.write).toHaveBeenCalledTimes(8);
  });

  it('takes a refusal as final: the model works, and no other model is asked', async () => {
    const gemini = model('gemini:a', new AiRefusedError('Gemini declined the request'));
    const groq = model('groq:g', 'from Groq');
    const { writer, health } = balancer(gemini, groq);
    await expect(writer.write(input)).rejects.toThrow('Gemini declined the request');
    expect(groq.write).not.toHaveBeenCalled();
    expect(health.get('gemini:a')).toMatchObject({ failures: 0, pausedUntil: 0 });
  });

  it('passes the last error on when every model fails, and lets a bug surface at once', async () => {
    const { writer } = balancer(model('gemini:a', overloaded), model('groq:g', new AiUnavailableError("Groq didn't answer (HTTP 500)")));
    await expect(writer.write(input)).rejects.toThrow('HTTP 500');
    const buggy = balancer(model('gemini:a', new TypeError('boom')), model('groq:g', 'from Groq'));
    await expect(buggy.writer.write(input)).rejects.toThrow('boom');
  });

  it('shares what it learned across the whole process', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gemini = model('gemini:shared-test', atLimit(60_000));
    const groq = model('groq:shared-test', 'from Groq');
    await createBalancedWriter([gemini, groq]).write(input);
    // Another copy (another bundle, the job runner) skips the full model too.
    await createBalancedWriter([gemini, groq]).write(input);
    expect(gemini.write).toHaveBeenCalledTimes(1);
    expect(groq.write).toHaveBeenCalledTimes(2);
  });
});

describe('the balancer for this environment', () => {
  const keys = { GEMINI_API_KEY: 'a', KIMI_API_KEY: 'k', GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'c' };

  it('lines up the free models with keys, Gemini first and Groq last, and leaves paid Claude out', () => {
    expect(aiWriterFromEnv(keys)?.name).toBe(
      'gemini:gemini-3.5-flash-lite then gemini:gemini-3-flash-preview then kimi:moonshotai/kimi-k3.1-pro then groq:openai/gpt-oss-120b then groq:openai/gpt-oss-20b',
    );
    expect(aiWriterFromEnv({ GROQ_API_KEY: 'g', GROQ_MODEL: 'openai/gpt-oss-20b' })?.name).toBe('groq:openai/gpt-oss-20b');
    expect(aiWriterFromEnv({ ANTHROPIC_API_KEY: 'c' })).toBeNull();
    expect(aiWriterFromEnv({})).toBeNull();
    expect(createTaskDrafter({ GROQ_API_KEY: 'g', GROQ_MODEL: 'openai/gpt-oss-20b' })?.name).toBe('groq:openai/gpt-oss-20b');
  });

  it('follows AI_PROVIDERS: its order, Claude only when named, unknown names left out', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(aiProviderOrder({})).toEqual(['gemini', 'kimi', 'groq']);
    expect(aiProviderOrder({ AI_PROVIDERS: '' })).toEqual(['gemini', 'kimi', 'groq']);
    expect(aiProviderOrder({ AI_PROVIDERS: ' Groq , gemini,openai' })).toEqual(['groq', 'gemini']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AI_PROVIDERS names openai'));
    expect(aiWriterFromEnv({ ...keys, AI_PROVIDERS: 'gemini,claude', GEMINI_MODEL: 'gemini-3.5-flash-lite' })?.name).toBe('gemini:gemini-3.5-flash-lite then claude:claude-opus-5-5');
  });

  it('leaves Kimi out of a production build without KIMI_IN_PRODUCTION=yes; Gemini and Groq run there', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(aiWriterFromEnv({ ...keys, NODE_ENV: 'production', GEMINI_MODEL: 'gemini-3.5-flash-lite', GROQ_MODEL: 'openai/gpt-oss-120b' })?.name).toBe(
      'gemini:gemini-3.5-flash-lite then groq:openai/gpt-oss-120b',
    );
    expect(aiWritingSetUp({ NODE_ENV: 'production', KIMI_API_KEY: 'k' })).toBe(false);
    expect(aiWritingSetUp({ NODE_ENV: 'production', GROQ_API_KEY: 'g' })).toBe(true);
    expect(aiWritingSetUp({ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'c' })).toBe(false);
  });

  it('reads documents on our own server everywhere, keys or not: a model key sets up the writing only', () => {
    expect(aiReadingSetUp({ NODE_ENV: 'production' })).toBe(true);
    expect(aiReadingSetUp({ NODE_ENV: 'development' })).toBe(true);
    expect(aiWritingSetUp({ NODE_ENV: 'production' })).toBe(false);
  });
});
