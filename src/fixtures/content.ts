import type { HelpArticleData, HelpArticleSummary, HelpCenterData, LegalDocData } from '@/contracts';
import { routes } from '@/contracts';

/** Help center and legal documents, shaped as the app's content loader returns them. */

const whenCharged: HelpArticleSummary = {
  slug: 'when-am-i-charged',
  title: 'When am I charged?',
  summary: 'You pay when you book. Your helper is paid after the task is done.',
};
const cancelBooking: HelpArticleSummary = {
  slug: 'cancel-a-booking',
  title: 'Canceling a booking',
  summary: 'Cancel free until 24 hours before the start. After that, a late fee applies.',
};
const addressPrivacy: HelpArticleSummary = {
  slug: 'who-sees-my-address',
  title: 'Who sees my address?',
  summary: 'Only the helper you book, and only after you confirm.',
};
const getVerified: HelpArticleSummary = {
  slug: 'getting-verified',
  title: 'Getting verified as a helper',
  summary: 'ID check, payout setup, and a background check for in-home help.',
};
const payoutTiming: HelpArticleSummary = {
  slug: 'when-do-i-get-paid',
  title: 'When do I get paid?',
  summary: 'After the task is approved. Your first payout can take about 7 days.',
};
const reportProblem: HelpArticleSummary = {
  slug: 'report-a-problem',
  title: 'Reporting a problem with a task',
  summary: 'Report within 72 hours of completion and we pause the payment while we look.',
};
const postTask: HelpArticleSummary = {
  slug: 'post-your-first-task',
  title: 'Posting your first task',
  summary: 'What to include so helpers can make a clear offer.',
};

export const helpCenterData: HelpCenterData = {
  topics: [
    {
      slug: 'getting-started',
      title: 'Getting started',
      description: 'Posting a task and choosing a helper.',
      articles: [postTask, addressPrivacy],
    },
    {
      slug: 'payments',
      title: 'Payments and fees',
      description: 'Charges, refunds, and service fees.',
      articles: [whenCharged, cancelBooking],
    },
    {
      slug: 'helpers',
      title: 'For helpers',
      description: 'Verification, offers, and payouts.',
      articles: [getVerified, payoutTiming],
    },
    {
      slug: 'safety',
      title: 'Safety and problems',
      description: 'Reporting problems and staying safe.',
      articles: [reportProblem],
    },
  ],
};

/** Uses every block type and both link kinds. */
export const helpArticleWhenCharged: HelpArticleData = {
  ...whenCharged,
  topic: { slug: 'payments', title: 'Payments and fees' },
  updatedAt: '2026-11-02T16:00:00.000Z',
  blocks: [
    {
      type: 'paragraph',
      content: [
        'You pay when you book. We place the charge for the task price and the service fee, and your helper is paid ',
        { text: 'after the task is done', strong: true },
        '.',
      ],
    },
    { type: 'heading', text: 'What you pay' },
    {
      type: 'list',
      ordered: false,
      items: [
        ['The task price you agreed with your helper.'],
        ['A service fee of 10% (at least $3.00).'],
        ['Any expense allowance you agreed on. Unused allowance is refunded.'],
      ],
    },
    { type: 'heading', text: 'After the task' },
    {
      type: 'list',
      ordered: true,
      items: [
        ['Your helper marks the task as done.'],
        ['You approve it, or it is approved automatically after 72 hours.'],
        ['Your helper is paid. Hourly tasks are adjusted to the approved hours.'],
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      content: [
        'See the full examples on our ',
        { text: 'pricing page', href: routes.pricing() },
        '.',
      ],
    },
    {
      type: 'callout',
      tone: 'warning',
      content: [
        'Never pay a helper in cash or through another app. Payments outside TasksNearMe aren’t covered if something goes wrong.',
      ],
    },
    {
      type: 'paragraph',
      content: [
        'Card payments are processed by ',
        { text: 'Stripe', href: 'https://stripe.com' },
        '.',
      ],
    },
  ],
  related: [cancelBooking, reportProblem],
};

const otherDocs: LegalDocData['otherDocs'] = [
  { doc: 'privacy', title: 'Privacy policy' },
  { doc: 'helper-agreement', title: 'Helper agreement' },
  { doc: 'cancellation-policy', title: 'Cancellation policy' },
  { doc: 'rewards-terms', title: 'Rewards terms' },
  { doc: 'community-guidelines', title: 'Community guidelines' },
  { doc: 'prohibited-tasks', title: 'Prohibited tasks' },
];

export const legalTermsDraft: LegalDocData = {
  doc: 'terms',
  title: 'Terms of service',
  version: 'Draft 0.1',
  status: 'draft',
  updatedAt: '2026-11-02T16:00:00.000Z',
  summary:
    'TasksNearMe connects people who need everyday help with local helpers. These terms explain how bookings, payments, and cancellations work.',
  sections: [
    {
      id: 'who-we-are',
      title: '1. Who we are',
      blocks: [
        {
          type: 'paragraph',
          content: [
            'TasksNearMe is a marketplace. Helpers are independent and choose which tasks to take. We are not a party to the agreement between a poster and a helper.',
          ],
        },
      ],
    },
    {
      id: 'accounts',
      title: '2. Your account',
      blocks: [
        {
          type: 'list',
          ordered: false,
          items: [
            ['You must be 18 or older.'],
            ['Posting, making offers, and booking need a verified phone number.'],
            ['Keep your account to yourself. You are responsible for what happens in it.'],
          ],
        },
      ],
    },
    {
      id: 'payments',
      title: '3. Payments',
      blocks: [
        {
          type: 'paragraph',
          content: [
            'You pay when you book. Fees and examples are on the ',
            { text: 'pricing page', href: routes.pricing() },
            '.',
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          content: [
            'Cancellations follow the ',
            { text: 'cancellation policy', href: routes.legal('cancellation-policy') },
            '.',
          ],
        },
      ],
    },
  ],
  otherDocs,
};
