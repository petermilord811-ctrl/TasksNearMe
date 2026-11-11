import { describe, expect, it } from 'vitest';
import { createReviewInputSchema, reviewTagsFor } from './reviews';

describe('review schema', () => {
  it('needs 1 to 5 stars and tags for the right direction', () => {
    const client = createReviewInputSchema('client_to_helper');
    expect(client.safeParse({ rating: 5, tags: ['on_time'], body: '' }).success).toBe(true);
    expect(client.safeParse({ rating: 0, tags: [], body: '' }).success).toBe(false);
    expect(client.safeParse({ rating: 6, tags: [], body: '' }).success).toBe(false);
    expect(client.safeParse({ rating: 4, tags: ['ready_on_time'], body: '' }).success).toBe(false);
    const helper = createReviewInputSchema('helper_to_client');
    expect(helper.safeParse({ rating: 4, tags: ['ready_on_time'], body: '' }).success).toBe(true);
    expect(reviewTagsFor('helper_to_client')).toContain('easy_access');
  });
});
