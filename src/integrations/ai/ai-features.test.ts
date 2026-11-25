import { describe, expect, it } from 'vitest';
import { createAiBookingPrepper, createBookingPrepper, createFakeBookingPrepper, tidyChecklist } from './booking-prepper';
import { createAiCaseSummarizer, createCaseSummarizer, createFakeCaseSummarizer, tidyCaseSummary } from './case-summarizer';
import { createAiNeighborsWriter, createFakeNeighborsWriter, createNeighborsWriter, tidyPolish } from './neighbors-writer';
import { cutAt, plainLines, plainParagraphs } from './plain-text';
import { createAiJobSizer, createFakeJobSizer, createJobSizer, tidyJobSize } from './price-sizer';
import { createAiProfileWriter } from './profile-writer';
import { createAiReviewSummarizer, createFakeReviewSummarizer, createReviewSummarizer, tidySummary } from './review-summarizer';
import { createAiReviewWriter, createFakeReviewWriter, createReviewWriter } from './review-writer';
import { AiUnavailableError, type AiWriter } from './writer';

/**
 * The AI features of 2026-11-24 (docs/automation/ai-plan-2026-11-24.md): what reaches a model (masked, inside tags,
 * in the page's language) and what comes back (plain text, limited, masked again). A recording stand-in answers;
 * no model is ever called.
 */

function recording(answer: unknown) {
  const calls: { system: string; prompt: string }[] = [];
  const writer: AiWriter = {
    name: 'stub',
    write: async ({ system, prompt }) => {
      calls.push({ system, prompt });
      return answer as never;
    },
  };
  return { writer, calls };
}

const PHONE = '512-555-0142';
const EMAIL = 'maya@example.test';
const STREET = '1240 Example Lane';

describe('plain text from a model', () => {
  it('drops markup, masks contact details and addresses, and keeps whole sentences within the length', () => {
    expect(plainParagraphs(`**Great** job!\n\nCall me at ${PHONE} or visit [my site](https://example.test). <b>Bye</b>`, 400)).toBe('Great job!\n\nCall me at [hidden] or visit my site. Bye');
    expect(plainLines(['- One', '2) Two', '- One', '', `* Write to ${EMAIL}`], { max: 5, length: 100, dropMasked: true })).toEqual(['One', 'Two']);
    expect(cutAt('First sentence here. Second sentence that is long.', 30)).toBe('First sentence here.');
  });
});

describe('Write it with AI on a review', () => {
  it('sends the stars, tags and their words masked, in the page language, and tidies what comes back', async () => {
    const { writer, calls } = recording({ review: `## Review\n\n**Jordan** was great. Text him at ${PHONE}!` });
    const text = await createAiReviewWriter(writer).draft({
      direction: 'client_to_helper', subjectFirstName: 'Jordan', task: { title: 'Assemble a desk', categorySlug: 'furniture-assembly' },
      rating: 5, tags: ['on_time', 'not_a_tag'], notes: `He came to ${STREET} on time. ${EMAIL}`, locale: 'es',
    });
    expect(text).toBe('Review\n\nJordan was great. Text him at [hidden]!');
    const prompt = calls[0]!.prompt;
    expect(prompt).toContain('Write in Spanish');
    expect(prompt).toContain('Stars: 5 of 5');
    expect(prompt).toContain('Tags they chose: on time');
    expect(prompt).not.toContain('not_a_tag');
    expect(prompt).not.toContain(EMAIL);
    expect(prompt).not.toContain('1240 Example');
    expect(prompt).toMatch(/<their_words>\n.*\[hidden\].*\n<\/their_words>/);
  });

  it('refuses an empty answer, and has a stand-in that follows the rating', async () => {
    await expect(createAiReviewWriter(recording({ review: ' ' }).writer).draft({ direction: 'helper_to_client', subjectFirstName: 'Maya', task: { title: 'Desk', categorySlug: 'furniture-assembly' }, rating: 4, tags: [], notes: '', locale: 'en' })).rejects.toBeInstanceOf(AiUnavailableError);
    const fake = createFakeReviewWriter();
    await expect(fake.draft({ direction: 'client_to_helper', subjectFirstName: 'Jordan', task: { title: 'Desk', categorySlug: 'furniture-assembly' }, rating: 5, tags: ['careful'], notes: 'Fast.', locale: 'en' })).resolves.toBe('Jordan did a great job with "Desk". What stood out: careful with my things. Fast.');
    await expect(fake.draft({ direction: 'client_to_helper', subjectFirstName: 'Jordan', task: { title: 'Desk', categorySlug: 'furniture-assembly' }, rating: 2, tags: [], notes: '', locale: 'es' })).resolves.toBe('"Desk" no salió como esperaba.');
    expect(createReviewWriter({ NODE_ENV: 'development' })?.name).toBe('stand-in');
    expect(createReviewWriter({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('What neighbors say', () => {
  it('sends the reviews without their authors, masked, and keeps the points in both languages', async () => {
    const { writer, calls } = recording({ en: ['- Fast and tidy.', `Call ${PHONE} to book.`, 'Fast and tidy.'], es: ['Rápido y ordenado.'] });
    const points = await createAiReviewSummarizer(writer).summarize({
      helperFirstName: 'Sam',
      reviews: [{ rating: 5, tags: ['tidy'], body: `Great! He lives near ${STREET}`, categorySlug: 'furniture-assembly' }],
    });
    // A point that needed masking carried a contact detail: it isn't shown.
    expect(points).toEqual({ en: ['Fast and tidy.'], es: ['Rápido y ordenado.'] });
    expect(calls[0]!.prompt).toContain('5 of 5 stars, Furniture assembly, tags: tidy');
    expect(calls[0]!.prompt).not.toContain('1240 Example');
    expect(() => tidySummary({ en: ['ok'], es: [] })).toThrow(AiUnavailableError);
  });

  it('has a counting stand-in, used by the e2e build too, and nothing in production without a model', async () => {
    const points = await createFakeReviewSummarizer().summarize({
      helperFirstName: 'Sam',
      reviews: [{ rating: 5, tags: ['tidy', 'on_time'], body: 'a', categorySlug: 'moving-help' }, { rating: 4, tags: ['tidy'], body: 'b', categorySlug: 'moving-help' }],
    });
    expect(points.en).toEqual(['1 of 2 reviewers gave 5 stars.', 'Reviewers often mention: tidy, on time.']);
    expect(points.es[0]).toBe('1 de 2 reseñas dan 5 estrellas.');
    expect(createReviewSummarizer({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('Get ready on a booking', () => {
  it("writes for the viewer's role from the scope and the category's rules, masked, never the address", async () => {
    const { writer, calls } = recording({ steps: ['1. Unbox the parts.', '2. Clear the room.', `3. Text ${PHONE} when you arrive.`] });
    const steps = await createAiBookingPrepper(writer).checklist({
      role: 'poster', categorySlug: 'moving-help', title: 'Load a truck', scope: `Two rooms. Gate code 4417 at ${STREET}.`, details: ['rooms: 2'],
      startLabel: 'Saturday, November 28 at 10:00 AM', hours: 3, remote: false, otherFirstName: 'Jordan', locale: 'en',
    });
    expect(steps).toEqual(['Unbox the parts.', 'Clear the room.']);
    const prompt = calls[0]!.prompt;
    expect(prompt).toContain('The checklist is for the client. Their helper is Jordan.');
    expect(prompt).toContain("It never includes transport in the helper's vehicle");
    expect(prompt).toContain('about 3 hours, in person');
    expect(prompt).not.toContain('1240 Example');
    expect(() => tidyChecklist(['Only one'])).toThrow(AiUnavailableError);
  });

  it('has a stand-in for each role and language', async () => {
    const facts = { categorySlug: 'computer-help' as const, title: 'Printer', scope: 'Set up a printer', details: [], startLabel: 'sábado', remote: true, otherFirstName: 'Lee', locale: 'es' as const };
    await expect(createFakeBookingPrepper().checklist({ ...facts, role: 'poster' })).resolves.toEqual([
      'Carga el equipo y ten tus contraseñas listas para escribirlas tú.',
      'Confirma los detalles con Lee en el chat.',
      'Planea estar listo para sábado.',
    ]);
    expect(createBookingPrepper({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('Check my price with AI', () => {
  it('asks only for a size and reasons, never a price, and keeps the size within a day', async () => {
    const { writer, calls } = recording({ units: 2.3, effort: 'heavy', reasons: ['Two pieces.', `Call ${PHONE}`] });
    const size = await createAiJobSizer(writer).size({ categorySlug: 'moving-help', unit: 'hour', title: 'Load a truck', description: `From ${STREET}`, details: ['stairFlights: 2'], locale: 'en' });
    expect(size).toEqual({ units: 2.5, effort: 'heavy', reasons: ['Two pieces.'] });
    expect(calls[0]!.system).toContain('You never name prices or amounts of money.');
    expect(calls[0]!.prompt).toContain('Unit: hour');
    expect(calls[0]!.prompt).not.toContain('1240 Example');
    expect(tidyJobSize('item', { units: 99, effort: 'typical', reasons: [] }).units).toBe(20);
    expect(tidyJobSize('task', { units: 7, effort: 'light', reasons: [] }).units).toBe(1);
    expect(tidyJobSize('hour', { units: Number.NaN, effort: 'odd' as never, reasons: [] })).toEqual({ units: 1, effort: 'typical', reasons: [] });
  });

  it('has a rule-based stand-in that reads counts and stairs', async () => {
    const size = await createFakeJobSizer().size({ categorySlug: 'furniture-assembly', unit: 'item', title: 'Desks', description: 'Two desks, 3rd floor, no elevator', details: ['itemCount: 2'], locale: 'en' });
    expect(size).toEqual({ units: 2, effort: 'heavy', reasons: ['About 2 items of work from what you wrote.', 'Stairs without an elevator make it heavier work.'] });
    expect(createJobSizer({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('Neighbors: Make it clearer and Draft an answer', () => {
  it('rewrites a titled post masked, and keeps the old title when the new one is too short', async () => {
    const { writer, calls } = recording({ title: 'Who', body: `Need help with a desk. Email ${EMAIL}` });
    const polished = await createAiNeighborsWriter(writer).polish({ kind: 'question', title: `desk help ${PHONE}`, body: 'need desk help', locale: 'en' });
    expect(polished).toEqual({ title: `desk help ${PHONE}`, body: 'Need help with a desk. Email [hidden]' });
    expect(calls[0]!.prompt).toContain('Title: desk help [hidden]');
    // A general post has no title, whatever comes back.
    expect(tidyPolish({ kind: 'general' }, { title: 'A title', body: 'Hello neighbors' })).toEqual({ body: 'Hello neighbors' });
  });

  it("drafts an answer from the post and the helper's profile, inside tags, with the category's limits", async () => {
    const { writer, calls } = recording({ answer: 'Plan about two hours and anchor the bookshelf. I assemble furniture on TasksNearMe.' });
    const answer = await createAiNeighborsWriter(writer).answer({
      post: { kind: 'recommendation', title: 'Who can build a desk?', body: `I'm at ${STREET}`, categorySlug: 'furniture-assembly' },
      helper: { firstName: 'Lee', headline: 'Careful assembly', services: ['furniture-assembly', 'computer-help'], tools: ['Drill'] },
      notes: 'I did three last month', locale: 'en',
    });
    expect(answer).toContain('anchor the bookshelf');
    const prompt = calls[0]!.prompt;
    expect(prompt).toContain('Services they offer: Furniture assembly, Computer and phone help');
    expect(prompt).toContain('It never includes anything electrical');
    expect(prompt).toContain('<notes>\nI did three last month\n</notes>');
    expect(prompt).not.toContain('1240 Example');
  });

  it('has stand-ins, and nothing in production without a model', async () => {
    const fake = createFakeNeighborsWriter();
    await expect(fake.polish({ kind: 'question', title: 'best plumber', body: 'anyone know one', locale: 'en' })).resolves.toEqual({ title: 'Best plumber?', body: 'Anyone know one.' });
    await expect(fake.answer({ post: { kind: 'question', title: 't', body: 'b', categorySlug: 'yard-cleanup' }, helper: { firstName: 'Sam', services: ['yard-cleanup'], tools: [] }, notes: '', locale: 'en' })).resolves.toContain('I offer yard cleanup on TasksNearMe');
    expect(createNeighborsWriter({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('Summarize with AI on a case', () => {
  it('reads the case inside tags, masked, and keeps points and what is open', async () => {
    const { writer, calls } = recording({ points: ['- Maya says a drawer sticks.', `Call ${PHONE}.`], open: ['Waiting on photos.'] });
    const summary = await createAiCaseSummarizer(writer).summarize({
      type: 'dispute', reason: 'not_done', subject: 'Assemble a dresser', status: 'open', description: `Drawers stick. ${EMAIL}`,
      parties: ['client: Ana P.', 'helper: Jordan K.'], events: ['Ana P. wrote to support: please help', `support (Alex) wrote to client Ana P.: send a photo to ${EMAIL}`],
    });
    expect(summary).toEqual({ points: ['Maya says a drawer sticks.', 'Call [hidden].'], open: ['Waiting on photos.'] });
    expect(calls[0]!.prompt).toMatch(/^<case>\n/);
    expect(calls[0]!.prompt).not.toContain(EMAIL);
    expect(() => tidyCaseSummary({ points: [], open: [] })).toThrow(AiUnavailableError);
    await expect(createFakeCaseSummarizer().summarize({ type: 'dispute', subject: 'Desk', status: 'open', description: 'Wobbly', parties: [], events: [] })).resolves.toEqual({ points: ['dispute case about Desk: Wobbly.', '0 events so far.'], open: ['The case is open.'] });
    expect(createCaseSummarizer({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('Write it for me on a profile, with reviews', () => {
  it("adds what clients wrote, masked, as information only", async () => {
    const { writer, calls } = recording({ headline: 'Careful furniture assembly in Mueller', bio: 'I build flat-pack furniture and leave the room tidy. Clients often mention that I clean up after.' });
    await createAiProfileWriter(writer).draft({ firstName: 'Sam', services: [{ categorySlug: 'furniture-assembly' }], tools: [], languages: ['English'], notes: '', reviews: [`Tidy and fast. Call ${PHONE}`] });
    expect(calls[0]!.prompt).toContain('<reviews>\n- Tidy and fast. Call [hidden]\n</reviews>');
    expect(calls[0]!.system).toContain('never quoting a review or naming anyone');
  });
});
