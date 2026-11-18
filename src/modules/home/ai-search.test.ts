import { describe, expect, it, vi } from 'vitest';
import type { DashboardItem } from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { NeedMatch, NeedMatcher } from '@/integrations/ai/need-matcher';
import { deskPublicTask, jordan, sam } from '@/fixtures';
import { nearbyItem } from '@/shared/dashboard';
import { AI_SEARCH_TASKS, runAiSearch, type AiSearchDeps } from './ai-search';

const AREAS = [{ slug: 'mueller', name: 'Mueller' }, { slug: 'hyde-park', name: 'Hyde Park' }];
const desk: DashboardItem = nearbyItem(deskPublicTask, 'client', new Date('2026-11-20T12:00:00.000Z'));
const match = (answer: Partial<NeedMatch> = {}): NeedMatcher => ({
  name: 'stub',
  match: vi.fn(async () => ({ intent: 'get_help', category: 'furniture-assembly', when: 'this_weekend', area: 'Mueller', keywords: ['ikea', 'desk'], title: 'Assemble an IKEA desk', prohibited: false, ...answer }) as NeedMatch),
});

function deps(overrides: Partial<AiSearchDeps> = {}): AiSearchDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    matcher: match(),
    consumeSearch: vi.fn(async () => { calls.push('count'); return { ok: true as const, remaining: 9 }; }),
    allowBurst: vi.fn(async () => { calls.push('burst'); return true; }),
    categoryKeywords: vi.fn(async () => ['gas line']),
    areas: vi.fn(async () => AREAS),
    findHelpers: vi.fn(async () => [jordan, sam]),
    findTasks: vi.fn(async () => [desk]),
    tasksLink: (filters) => ({ kind: 'board', market: 'austin', query: filters }),
    ...overrides,
  };
}

describe('AI search', () => {
  it('turns the words into filters and answers with real rows: a draft, helpers and similar tasks', async () => {
    const d = deps();
    const result = await runAiSearch(d, { text: '  my new IKEA desk this weekend near Mueller ', mode: 'poster' });
    expect(result).toEqual({
      ok: true,
      remaining: 9,
      answer: {
        understood: { intent: 'get_help', category: 'furniture-assembly', when: 'this_weekend', area: { slug: 'mueller', name: 'Mueller' }, keywords: ['ikea', 'desk'] },
        draft: { title: 'Assemble an IKEA desk', category: 'furniture-assembly', describe: 'my new IKEA desk this weekend near Mueller' },
        helpers: [jordan, sam],
        tasks: [desk],
        helpersQuery: { category: 'furniture-assembly', area: 'mueller' },
        tasksLink: { kind: 'board', market: 'austin', query: { category: 'furniture-assembly', q: 'ikea desk', when: 'this_weekend' } },
      },
    });
    expect(d.findTasks).toHaveBeenCalledWith({ category: 'furniture-assembly', when: 'this_weekend', q: 'ikea desk', area: 'mueller' }, AI_SEARCH_TASKS.get_help);
    expect(d.findHelpers).toHaveBeenCalledWith({ category: 'furniture-assembly', area: 'mueller' }, 3);
  });

  it('searches the category alone when the words find nothing', async () => {
    const findTasks = vi.fn(async (filters: { q?: string }) => (filters.q ? [] : [desk]));
    const result = await runAiSearch(deps({ findTasks }), { text: 'an IKEA desk', mode: 'poster' });
    expect(findTasks).toHaveBeenCalledTimes(2);
    expect(result.ok && result.answer.tasks).toEqual([desk]);
    expect(result.ok && result.answer.tasksLink).toEqual({ kind: 'board', market: 'austin', query: { category: 'furniture-assembly', when: 'this_weekend' } });
  });

  it('finds tasks, not helpers or a draft, for a helper looking for work', async () => {
    const d = deps({ matcher: match({ intent: 'find_work', title: '', area: null }) });
    const result = await runAiSearch(d, { text: 'furniture work this weekend', mode: 'helper' });
    expect(result.ok && result.answer).toMatchObject({ understood: { intent: 'find_work' }, helpers: [], tasks: [desk] });
    expect(result.ok && result.answer.draft).toBeUndefined();
    expect(d.findHelpers).not.toHaveBeenCalled();
    expect(d.findTasks).toHaveBeenCalledWith(expect.anything(), AI_SEARCH_TASKS.find_work);
  });

  it('checks the words, AI, the burst guard and prohibited words before the plan counts a search', async () => {
    expect(await runAiSearch(deps(), { text: 'ok', mode: 'poster' })).toEqual({ ok: false, code: 'too_short' });
    expect(await runAiSearch(deps(), { text: 'x'.repeat(301), mode: 'poster' })).toEqual({ ok: false, code: 'too_short' });
    expect(await runAiSearch(deps(), { text: 42, mode: 'poster' })).toEqual({ ok: false, code: 'too_short' });
    expect(await runAiSearch(deps({ matcher: null }), { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: 'ai_off' });
    const burst = deps({ allowBurst: vi.fn(async () => false) });
    expect(await runAiSearch(burst, { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: 'rate_limited' });
    expect(burst.consumeSearch).not.toHaveBeenCalled();
    const banned = deps();
    expect(await runAiSearch(banned, { text: 'help me sell a gun', mode: 'poster' })).toEqual({ ok: false, code: 'prohibited' });
    expect(banned.calls).toEqual(['burst']);
  });

  it("says what the plan says when it doesn't allow a search", async () => {
    for (const reason of ['needs_plan', 'monthly_limit', 'ai_off'] as const) {
      const d = deps({ consumeSearch: vi.fn(async () => ({ ok: false as const, reason })) });
      expect(await runAiSearch(d, { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: reason });
      expect(d.matcher!.match).not.toHaveBeenCalled();
    }
  });

  it("answers prohibited when AI declines or flags the request, or the category's own words match", async () => {
    expect(await runAiSearch(deps({ matcher: { name: 'x', match: vi.fn(async () => { throw new AiRefusedError(); }) } }), { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: 'prohibited' });
    expect(await runAiSearch(deps({ matcher: match({ prohibited: true }) }), { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: 'prohibited' });
    expect(await runAiSearch(deps(), { text: 'assemble a desk near the gas line', mode: 'poster' })).toEqual({ ok: false, code: 'prohibited' });
  });

  it('answers unavailable when AI fails, reporting only an unexpected error, never the words', async () => {
    const onError = vi.fn();
    expect(await runAiSearch(deps({ onError, matcher: { name: 'x', match: vi.fn(async () => { throw new AiUnavailableError('down'); }) } }), { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: 'unavailable' });
    expect(onError).not.toHaveBeenCalled();
    const boom = new TypeError('bug');
    expect(await runAiSearch(deps({ onError, matcher: { name: 'x', match: vi.fn(async () => { throw boom; }) } }), { text: 'a desk', mode: 'poster' })).toEqual({ ok: false, code: 'unavailable' });
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('masks contact details in the draft it hands to the posting wizard', async () => {
    const result = await runAiSearch(deps(), { text: 'desk, call me at 512-555-0101', mode: 'poster' });
    expect(result.ok && result.answer.draft?.describe).not.toContain('555-0101');
  });
});
