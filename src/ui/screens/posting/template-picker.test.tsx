/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { TASK_DESCRIPTION_MAX, TASK_TEMPLATES, TASK_TITLE_MAX, type PostTaskHandlers, type TaskDraftInput } from '@/contracts';
import { deskBreakdown, deskDraft, fakeHandler, fakePostTaskHandlers, postTaskFromTemplateData, postTaskPageData, postTaskRepeatData, postTaskResults } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PostTaskScreen, type PostTaskScreenProps } from './post-task-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const copy = messages.postTask.templates as Record<string, unknown> & typeof messages.postTask.templates;
const example = (id: string) => copy[id] as { label: string; title: string; description: string };
/** The copy's sentence about an example, as the screen shows it. */
const about = (sentence: string, id: string) => sentence.replace('{example}', example(id).label);
/** Furniture assembly picked, nothing written yet. */
const blank: TaskDraftInput = { ...deskDraft, title: '', description: '', details: {}, photoIds: [] };

function mount(props: Partial<PostTaskScreenProps> = {}) {
  const handlers: PostTaskHandlers = { ...fakePostTaskHandlers, onQuote: vi.fn(async () => deskBreakdown), onPost: vi.fn(fakeHandler<TaskDraftInput>(postTaskResults.posted, 0)) };
  render(<NextIntlClientProvider locale="en" messages={messages}><PostTaskScreen data={postTaskPageData} handlers={handlers} initialStep="describe" initialValues={blank} persistDraft={false} {...props} /></NextIntlClientProvider>);
  return handlers;
}
const title = () => screen.getByRole('textbox', { name: messages.postTask.describe.title });
const description = () => screen.getByRole('textbox', { name: messages.postTask.describe.description });

describe('Start from an example', () => {
  it("shows only the chosen category's examples and fills an empty draft at once; Undo empties it again", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole('heading', { name: copy.heading })).toBeVisible();
    const chips = screen.getAllByRole('button', { pressed: false }).filter((button) => TASK_TEMPLATES.some((template) => example(template.id).label === button.textContent));
    expect(chips.map((chip) => chip.textContent)).toEqual(TASK_TEMPLATES.filter((template) => template.categorySlug === 'furniture-assembly').map((template) => example(template.id).label));

    await user.click(screen.getByRole('button', { name: example('furniture-desk').label }));
    expect(title()).toHaveValue(example('furniture-desk').title);
    expect(description()).toHaveValue(example('furniture-desk').description);
    expect(screen.getByRole('button', { name: example('furniture-desk').label })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: copy.heading })).getByRole('status')).toHaveTextContent(about(copy.applied, 'furniture-desk'));

    // Another untouched example replaces it without asking; Undo goes back to before any example.
    await user.click(screen.getByRole('button', { name: example('furniture-bed').label }));
    expect(screen.queryByRole('group', { name: /Replace your title/ })).toBeNull();
    expect(title()).toHaveValue(example('furniture-bed').title);
    await user.click(screen.getByRole('button', { name: copy.undo }));
    expect(title()).toHaveValue('');
    expect(description()).toHaveValue('');
    expect(screen.getByText(copy.undone)).toBeVisible();
  });

  it('asks before replacing words the person wrote, keeps them on "Keep what I wrote", and Undo brings them back', async () => {
    const user = userEvent.setup();
    mount();
    await user.type(title(), 'Put together my new desk');
    await user.click(screen.getByRole('button', { name: example('furniture-desk').label }));
    const ask = screen.getByRole('group', { name: about(copy.replaceQuestion, 'furniture-desk') });
    await user.click(screen.getByRole('button', { name: copy.keep }));
    expect(ask).not.toBeInTheDocument();
    expect(title()).toHaveValue('Put together my new desk');

    await user.click(screen.getByRole('button', { name: example('furniture-desk').label }));
    await user.click(screen.getByRole('button', { name: copy.replace }));
    expect(title()).toHaveValue(example('furniture-desk').title);
    // Edited after picking: another example asks again.
    await user.type(title(), ' and a chair');
    await user.click(screen.getByRole('button', { name: example('furniture-wardrobe').label }));
    expect(screen.getByRole('group', { name: /Replace your title/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.keep }));
    await user.click(screen.getByRole('button', { name: copy.undo }));
    expect(title()).toHaveValue('Put together my new desk');
  });

  it("asks before replacing the landing page's words too", async () => {
    const user = userEvent.setup();
    mount({ data: { ...postTaskPageData, initialCategory: 'furniture-assembly', initialDescription: 'A desk from IKEA, still in the box in the hallway.' }, initialValues: undefined });
    await user.click(screen.getByRole('button', { name: example('furniture-desk').label }));
    expect(screen.getByRole('group', { name: /Replace your title/ })).toBeVisible();
    expect(description()).toHaveValue('A desk from IKEA, still in the box in the hallway.');
  });

  it('opens from an example (?template=) on the describe step, filled in and saying so', () => {
    mount({ data: postTaskFromTemplateData, initialStep: undefined, initialValues: undefined });
    expect(screen.getByText(/Step 2 of 7/)).toBeInTheDocument();
    expect(title()).toHaveValue(example('furniture-desk').title);
    expect(description()).toHaveValue(example('furniture-desk').description);
    expect(screen.getByRole('button', { name: example('furniture-desk').label })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(about(copy.applied, 'furniture-desk'))).toBeVisible();
  });

  it('stays out of "Post again", which already brings a whole task', () => {
    mount({ data: postTaskRepeatData, initialStep: 'describe', initialValues: undefined });
    expect(screen.queryByRole('heading', { name: copy.heading })).toBeNull();
  });

  it('keeps every example inside the limits and the categories\' scope (blueprint 01)', () => {
    for (const template of TASK_TEMPLATES) {
      const words = example(template.id);
      expect(words.label.length, template.id).toBeGreaterThan(3);
      expect(words.title.length, template.id).toBeGreaterThanOrEqual(8);
      expect(words.title.length, template.id).toBeLessThanOrEqual(TASK_TITLE_MAX);
      expect(words.description.length, template.id).toBeGreaterThanOrEqual(20);
      expect(words.description.length, template.id).toBeLessThanOrEqual(TASK_DESCRIPTION_MAX);
      // Out of scope at launch, or never: TV mounting, licensed trades, pianos and safes, ladders and tree work,
      // chemicals, haul-away, taking things apart; and no gate codes in public text.
      expect(`${words.title} ${words.description}`, template.id).not.toMatch(/\b(tv|television|mount(ing)?|electric(al|ian)?|plumb(ing|er)?|gas|piano|safes?|ladders?|chainsaws?|trees?|pesticides?|herbicides?|mulch|haul(ing)?|dump|disassembl\w*|take apart|gate codes?)\b/i);
    }
  });

  it('asks in the description only what the details step doesn\'t (brand, floor, stairs, tools, supplies, pets)', () => {
    for (const template of TASK_TEMPLATES) {
      const questions = example(template.id).description.split('\n').slice(1);
      expect(questions.length, template.id).toBeGreaterThanOrEqual(3);
      for (const question of questions) {
        expect(question, template.id).toMatch(/^- .+:$/);
        expect(question, template.id).not.toMatch(/\b(brand|floor and|stairs|elevator|pets at home|supplies on site|tools I have here|rooms\))/i);
      }
    }
  });
});
