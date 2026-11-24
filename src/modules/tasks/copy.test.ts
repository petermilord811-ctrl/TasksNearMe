import { describe, expect, it } from 'vitest';
import { taskCopyFields } from './copy';
import type { tasks } from './schema';

const source: typeof tasks.$inferSelect = {
  id: 'tsk_source',
  slug: 'assemble-a-desk-abc123',
  posterUserId: 'usr_maya',
  marketId: 'mkt_gainesville',
  categoryId: 'cat_furniture',
  title: 'Assemble a desk',
  description: 'A flat-pack desk.',
  searchText: 'Assemble a desk A flat-pack desk.',
  details: { pieces: 40 },
  mode: 'local',
  status: 'completed',
  pricingType: 'fixed',
  budgetCents: 6000,
  hourlyRateCents: null,
  estimatedHours: null,
  hoursCap: null,
  expenseAllowanceCents: 0,
  expenseAllowanceNote: null,
  windowStart: new Date('2026-11-20T15:00:00Z'),
  windowEnd: new Date('2026-11-20T17:00:00Z'),
  flexible: false,
  locationId: 'loc_1',
  publicAreaId: 'area_1',
  publicLat: 29.65,
  publicLng: -82.32,
  helpersNeeded: 1,
  offerCount: 3,
  aiGenerationId: 'aig_1',
  publishedAt: new Date('2026-11-18T15:00:00Z'),
  reopenedAt: new Date('2026-11-19T15:00:00Z'),
  expiresAt: new Date('2026-11-20T15:00:00Z'),
  version: 4,
  hiddenAt: new Date('2026-11-19T16:00:00Z'),
  hiddenByUserId: 'usr_morgan',
  hiddenReason: 'spam',
  requestKey: 'rk_0f6c',
  teamPartOf: 'bkg_lead',
  createdAt: new Date('2026-11-18T15:00:00Z'),
  updatedAt: new Date('2026-11-21T15:00:00Z'),
};

describe('taskCopyFields', () => {
  it("leaves out what belonged to the source post: its request key and team part above all (sweep 2026-11-24, M1)", () => {
    const copy = taskCopyFields(source) as Record<string, unknown>;
    for (const key of ['id', 'slug', 'createdAt', 'updatedAt', 'publishedAt', 'expiresAt', 'aiGenerationId', 'reopenedAt', 'hiddenAt', 'hiddenByUserId', 'hiddenReason', 'requestKey', 'searchText', 'teamPartOf']) {
      expect(copy).not.toHaveProperty(key);
    }
  });

  it('keeps what the new task is made from: who, what, where and how it was priced', () => {
    const copy = taskCopyFields(source);
    expect(copy).toMatchObject({ posterUserId: 'usr_maya', marketId: 'mkt_gainesville', categoryId: 'cat_furniture', title: 'Assemble a desk', details: { pieces: 40 }, mode: 'local', locationId: 'loc_1', publicAreaId: 'area_1', pricingType: 'fixed', budgetCents: 6000 });
  });
});
