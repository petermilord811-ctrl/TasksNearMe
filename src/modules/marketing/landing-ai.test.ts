import { describe, expect, it, vi } from 'vitest';
import type { AiTaskDraft } from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { TaskDrafter } from '@/integrations/ai/task-drafter';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import { LANDING_AI_PER_DAY, LANDING_AI_PER_VISITOR, suggestLandingDraft, type LandingAiDeps } from './landing-ai';

const draft: AiTaskDraft = { title: 'Mount a 55" TV on drywall', description: 'Wall mount is here. Text me at 512-555-0134.', details: {}, openQuestions: [] };

function deps(overrides: Partial<LandingAiDeps> = {}): LandingAiDeps & { drafter: TaskDrafter } {
  return {
    drafter: { name: 'test', draft: vi.fn(async () => draft) },
    enabled: vi.fn(async () => true),
    categoryKeywords: vi.fn(async () => ['weapon']),
    allowVisitor: vi.fn(async () => true),
    allowToday: vi.fn(async () => true),
    onError: vi.fn(),
    ...overrides,
  } as LandingAiDeps & { drafter: TaskDrafter };
}

const ask = { text: 'mount my TV on the wall', category: 'furniture-assembly' };

describe('suggestLandingDraft (the landing page’s "Write it with AI")', () => {
  it('drafts from the words and masks contact details in what comes back', async () => {
    const d = deps();
    const result = await suggestLandingDraft(d, ask);
    expect(result).toEqual({ ok: true, draft: { title: draft.title, description: 'Wall mount is here. Text me at [hidden].' } });
    expect(d.drafter.draft).toHaveBeenCalledWith({ categorySlug: 'furniture-assembly', text: 'mount my TV on the wall' });
  });

  it('checks the category before anything else (an unknown one would break the prompt)', async () => {
    const d = deps();
    expect(await suggestLandingDraft(d, { text: 'mount my TV', category: 'dog-walking' })).toEqual({ ok: false, code: 'unavailable' });
    expect(await suggestLandingDraft(d, { text: 'mount my TV', category: 42 })).toEqual({ ok: false, code: 'unavailable' });
    expect(d.allowVisitor).not.toHaveBeenCalled();
    expect(d.drafter.draft).not.toHaveBeenCalled();
  });

  it('needs at least 3 characters and sends at most 1000', async () => {
    const d = deps();
    expect(await suggestLandingDraft(d, { text: '  hi ', category: 'furniture-assembly' })).toEqual({ ok: false, code: 'too_short' });
    await suggestLandingDraft(d, { text: `x${'y'.repeat(1500)}`, category: 'furniture-assembly' });
    expect((d.drafter.draft as ReturnType<typeof vi.fn>).mock.calls[0]![0].text).toHaveLength(1000);
  });

  it('is unavailable without a drafter (production without a key) or with the market flag off', async () => {
    expect(await suggestLandingDraft(deps({ drafter: null }), ask)).toEqual({ ok: false, code: 'unavailable' });
    const off = deps({ enabled: vi.fn(async () => false) });
    expect(await suggestLandingDraft(off, ask)).toEqual({ ok: false, code: 'unavailable' });
    expect(off.allowVisitor).not.toHaveBeenCalled();
  });

  it("stops at the visitor's hourly limit, and at the daily cap (which only real AI calls count)", async () => {
    const visitor = deps({ allowVisitor: vi.fn(async () => false) });
    expect(await suggestLandingDraft(visitor, ask)).toEqual({ ok: false, code: 'rate_limited' });
    expect(visitor.allowToday).not.toHaveBeenCalled();
    const day = deps({ allowToday: vi.fn(async () => false) });
    expect(await suggestLandingDraft(day, ask)).toEqual({ ok: false, code: 'rate_limited' });
    expect(day.drafter.draft).not.toHaveBeenCalled();
    // Cheap enough to leave a margin on the owner's credit: about $1.20 a day at the cap.
    expect(LANDING_AI_PER_DAY.limit).toBeLessThanOrEqual(100);
    expect(LANDING_AI_PER_VISITOR).toEqual({ limit: 6, windowSeconds: 3600 });
  });

  it('refuses prohibited words (the global list and the category’s own) before the daily cap counts them', async () => {
    const d = deps();
    expect(await suggestLandingDraft(d, { text: `help me with a ${GLOBAL_PROHIBITED_PHRASES[0]}`, category: 'moving-help' })).toEqual({ ok: false, code: 'prohibited' });
    expect(await suggestLandingDraft(d, { text: 'move my weapon collection', category: 'moving-help' })).toEqual({ ok: false, code: 'prohibited' });
    expect(d.allowToday).not.toHaveBeenCalled();
    expect(d.categoryKeywords).toHaveBeenCalledWith('moving-help');
  });

  it('maps a refusal to prohibited, an outage to unavailable, and reports only unexpected errors, never the words', async () => {
    const refused = deps({ drafter: { name: 't', draft: vi.fn(async () => Promise.reject(new AiRefusedError())) } });
    expect(await suggestLandingDraft(refused, ask)).toEqual({ ok: false, code: 'prohibited' });
    const down = deps({ drafter: { name: 't', draft: vi.fn(async () => Promise.reject(new AiUnavailableError('timeout'))) } });
    expect(await suggestLandingDraft(down, ask)).toEqual({ ok: false, code: 'unavailable' });
    expect(down.onError).not.toHaveBeenCalled();
    const broken = deps({ drafter: { name: 't', draft: vi.fn(async () => Promise.reject(new TypeError('bad'))) } });
    expect(await suggestLandingDraft(broken, ask)).toEqual({ ok: false, code: 'unavailable' });
    expect(broken.onError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((broken.onError as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('TV');
  });
});
