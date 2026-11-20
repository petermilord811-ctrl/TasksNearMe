import type { MarketView, TaskPublicView } from '@/contracts';
import { isRealRecordId } from '@/shared/sample-data';
import type { SearchIndexing } from '@/shared/search-indexing';
import type { JsonLdNode } from './structured-data';

/**
 * Google Jobs for real tasks (docs/seo/PLAN.md S6): a task page can carry JobPosting markup so it can show in Google's
 * job results for searches like "tasks near me" and "odd jobs austin", and be crawled within minutes through the
 * Indexing API. Google's rules (developers.google.com/search/docs/appearance/structured-data/job-posting) allow gig
 * tasks posted on a platform by private people: the hirer is "confidential", the location city-level, the job a
 * contractor's. What breaks them: fake jobs (so never sample data), a location that doesn't match, an incomplete
 * description, expired postings left up, details behind a login, any payment to apply.
 *
 * Off until launch. Before switching it on, all of these must hold (the owner's part in PLAN.md §8):
 * - LIVE_SITE_INDEXING is `on` and the sample marketplace is gone from public pages;
 * - the task page shows the full description (contact details masked), since the markup may only say what the page does;
 * - posters are told when posting that an open task may appear in Google's job search (posting flow and privacy policy);
 * - applying stays free for helpers (no offer fees; background checks not paid by helpers).
 */
export const JOB_POSTINGS_ENABLED = false;

/** Whether this task page carries JobPosting markup: real, open, in an indexed market, with the switch on. */
export function jobPostingEligible(input: {
  enabled: boolean;
  mode: SearchIndexing;
  marketIndexable: boolean;
  acceptingOffers: boolean;
  taskId: string;
}): boolean {
  return input.enabled && input.mode === 'on' && input.marketIndexable && input.acceptingOffers && isRealRecordId(input.taskId);
}

export interface JobPostingFacts {
  /** The task page's canonical address (the English one: one copy carries the markup). */
  url: string;
  task: TaskPublicView;
  market: MarketView;
  /** The task's full public description, contact details masked, as the page shows it. */
  description: string;
  /** The page's own fact lines, in order: where (or "100% remote"), when, pay, category, how to make an offer. */
  facts: readonly string[];
  /** The market state's full name, for remote tasks' applicant location (e.g. "Texas"). */
  stateName: string;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);

/**
 * The JobPosting node. Never the poster's name, an address or a point: the hirer is "confidential" and the location
 * is the market's city. A fixed price has no time unit Google accepts, so it stays in the description; an hourly
 * rate is the base salary per HOUR.
 */
export function jobPostingNode(input: JobPostingFacts): JsonLdNode {
  const { task, market } = input;
  const description =
    `<p>${escapeHtml(input.description)}</p>` +
    (input.facts.length > 0 ? `<ul>${input.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>` : '');
  return {
    '@type': 'JobPosting',
    title: task.title,
    description,
    datePosted: task.postedAt,
    // Offers close when the window starts (blueprint 03), and the task leaves the board then (sweep 2026-11-20).
    validThrough: task.schedule.windowStart,
    employmentType: 'CONTRACTOR',
    hiringOrganization: { '@type': 'Organization', name: 'confidential' },
    directApply: false,
    identifier: { '@type': 'PropertyValue', name: 'TasksNearMe', value: task.id },
    url: input.url,
    ...(task.location.kind === 'local'
      ? {
          jobLocation: {
            '@type': 'Place',
            address: { '@type': 'PostalAddress', addressLocality: market.name, addressRegion: market.state, addressCountry: 'US' },
          },
        }
      : { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'State', name: input.stateName } }),
    ...(task.budget.type === 'hourly'
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'USD',
            value: { '@type': 'QuantitativeValue', value: task.budget.rateCents / 100, unitText: 'HOUR' },
          },
        }
      : {}),
  };
}
