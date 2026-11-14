import { describe, expect, it } from 'vitest';
import { austinMarket, deskPublicTask, remoteComputerPublicTask } from '@/fixtures/marketing';
import { serializeJsonLd } from './json-ld';
import { JOB_POSTINGS_ENABLED, jobPostingEligible, jobPostingNode } from './job-posting';

const REAL_ID = 'tsk_0f4c9a1b2c3d4e5f60718293a4b5c6d7';
const open = { enabled: true, mode: 'on' as const, marketIndexable: true, acceptingOffers: true, taskId: REAL_ID };

describe('jobPostingEligible', () => {
  it('is off until launch (the owner switches it on with its preconditions)', () => {
    expect(JOB_POSTINGS_ENABLED).toBe(false);
  });

  it('marks up a real open task in an indexed market, with everything switched on', () => {
    expect(jobPostingEligible(open)).toBe(true);
  });

  it('never marks up sample tasks, closed tasks, unindexed markets, or before launch', () => {
    expect(jobPostingEligible({ ...open, taskId: 'tsk_demo_007' })).toBe(false);
    expect(jobPostingEligible({ ...open, taskId: 'tsk_desk' })).toBe(false);
    expect(jobPostingEligible({ ...open, acceptingOffers: false })).toBe(false);
    expect(jobPostingEligible({ ...open, marketIndexable: false })).toBe(false);
    expect(jobPostingEligible({ ...open, mode: 'site' })).toBe(false);
    expect(jobPostingEligible({ ...open, enabled: false })).toBe(false);
  });
});

describe('jobPostingNode', () => {
  const facts = {
    url: 'https://tasksnearme.com/tasks/assemble-a-desk-mueller-7f3k',
    market: austinMarket,
    description: 'Flat-pack desk, about 40 parts <still in the box>. 2nd floor with an elevator.',
    facts: ['Mueller, Austin, TX (general area; the address is shared after booking)', 'Nov 21, 2026, 9:00 AM – 1:00 PM', '$60.00 for the task', 'Make an offer on TasksNearMe'],
    stateName: 'Texas',
  };

  it('describes a local fixed-price task: confidential hirer, the city only, the price in the description', () => {
    const node = jobPostingNode({ ...facts, task: deskPublicTask });
    expect(node).toMatchObject({
      '@type': 'JobPosting',
      title: 'Assemble a desk (flat-pack, 1 item)',
      datePosted: deskPublicTask.postedAt,
      validThrough: deskPublicTask.schedule.windowEnd,
      employmentType: 'CONTRACTOR',
      hiringOrganization: { '@type': 'Organization', name: 'confidential' },
      directApply: false,
      url: facts.url,
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' } },
    });
    expect(node).not.toHaveProperty('baseSalary');
    expect(node.description).toBe(
      '<p>Flat-pack desk, about 40 parts &lt;still in the box&gt;. 2nd floor with an elevator.</p><ul>' +
        facts.facts.map((fact) => `<li>${fact}</li>`).join('') +
        '</ul>',
    );
  });

  it('gives an hourly task its rate per hour', () => {
    const hourly = { ...deskPublicTask, budget: { type: 'hourly' as const, rateCents: 3500, estimatedHours: 3, hoursCap: 4 } };
    expect(jobPostingNode({ ...facts, task: hourly })).toMatchObject({
      baseSalary: { '@type': 'MonetaryAmount', currency: 'USD', value: { '@type': 'QuantitativeValue', value: 35, unitText: 'HOUR' } },
    });
  });

  it('marks a remote task as telecommute, open to applicants in the state', () => {
    const node = jobPostingNode({ ...facts, task: remoteComputerPublicTask });
    expect(node).toMatchObject({ jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'State', name: 'Texas' } });
    expect(node).not.toHaveProperty('jobLocation');
  });

  it("never carries the poster's name, a street, coordinates or the area's point", () => {
    const text = serializeJsonLd(jobPostingNode({ ...facts, task: deskPublicTask }));
    expect(text).not.toContain(deskPublicTask.poster.displayName);
    for (const field of ['streetAddress', 'geo', 'latitude', 'longitude', 'telephone', 'email']) expect(text).not.toContain(`"${field}"`);
  });
});
