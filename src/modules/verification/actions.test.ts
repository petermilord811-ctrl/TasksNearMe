import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelperAreaInput, HelperProfileInput, HelperServicesInput } from '@/contracts';
import { editorSaveArea, editorSaveProfile, editorSaveServices, onboardingSaveArea, onboardingSaveProfile, onboardingSaveServices } from './actions';

/**
 * The private beta's helper invite guards every save that can start a draft helper profile (aa's sweep S9). Setup's
 * services and area saves start one since plan 9.11 (decisions.md, 9.11: "the beta helper invite now guards those saves
 * too"), and the profile editor's saves reach the same code: an action is a public endpoint, so the editor page sending
 * people without a profile to setup isn't enough.
 */

// Modules read these when they load; test values only.
vi.hoisted(() => {
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-the-verification-actions';
});

const { invite, saves, db } = vi.hoisted(() => ({
  invite: vi.fn(),
  saves: { profile: vi.fn(), services: vi.fn(), area: vi.fn() },
  db: { test: 'db' },
}));

vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('@/platform/auth/auth', () => ({ auth: { api: {} } }));
vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => ({ kind: 'user', user: { id: 'usr_new_helper' } }) }));
vi.mock('@/platform/clock', () => ({ requestNow: async () => new Date('2026-11-18T12:00:00.000Z') }));
vi.mock('@/modules/beta/server', () => ({ helperInviteFor: invite }));
vi.mock('./service', () => ({ saveHelperProfile: saves.profile, saveHelperServices: saves.services, saveHelperArea: saves.area }));
vi.mock('next/cache', () => ({ refresh: () => undefined, updateTag: () => undefined, revalidatePath: () => undefined, revalidateTag: () => undefined, cacheTag: () => undefined, cacheLife: () => undefined }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'app.example.test' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
}));

const services: HelperServicesInput = { services: [{ categorySlug: 'yard-cleanup', pricingType: 'fixed', fromPriceCents: 6000, description: '' }] };
const area: HelperAreaInput = { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false };
const profile: HelperProfileInput = { headline: 'Careful yard help in Mueller', bio: 'Leaves, weeding and light hand pruning, done carefully and tidily.', languages: ['en'] };
// A save turned down: the action hands it back without refreshing any page (nothing here reads the database).
const turnedDown = { ok: false, code: 'validation_failed' } as const;

beforeEach(() => {
  invite.mockReset();
  for (const save of Object.values(saves)) save.mockReset().mockResolvedValue(turnedDown);
});

describe('saves that can start a draft helper profile, in the private beta (aa’s sweep S9)', () => {
  it('wait for a helper invite in the profile editor, as in setup', async () => {
    invite.mockResolvedValue({ marketName: 'Austin' });
    expect(await editorSaveServices(services)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await editorSaveArea(area)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await editorSaveProfile(profile)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await onboardingSaveServices(services)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await onboardingSaveArea(area)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await onboardingSaveProfile(profile)).toEqual({ ok: false, code: 'not_allowed' });
    expect(saves.services).not.toHaveBeenCalled();
    expect(saves.area).not.toHaveBeenCalled();
    expect(saves.profile).not.toHaveBeenCalled();
    expect(invite).toHaveBeenCalledWith(db, 'usr_new_helper');
  });

  it('go ahead when no invite is needed (no beta, or a profile already)', async () => {
    invite.mockResolvedValue(null);
    expect(await editorSaveServices(services)).toEqual(turnedDown);
    expect(await editorSaveArea(area)).toEqual(turnedDown);
    expect(await editorSaveProfile(profile)).toEqual(turnedDown);
    expect(saves.services).toHaveBeenCalledWith(db, 'usr_new_helper', services, expect.any(Date));
    expect(saves.area).toHaveBeenCalledWith(db, 'usr_new_helper', area, expect.any(Date));
    expect(saves.profile).toHaveBeenCalledWith(db, 'usr_new_helper', profile, expect.any(Date));
  });
});
