import { describe, expect, it } from 'vitest';
import { verificationNotificationFor } from './verification-plan';

describe('verification notifications', () => {
  it('tells the helper a step passed or needs them, linking to that step', () => {
    expect(verificationNotificationFor({ userId: 'usr_priya', track: 'address', outcome: 'passed' })).toEqual({
      userId: 'usr_priya',
      type: 'verification_passed',
      target: { kind: 'onboarding', step: 'address' },
      params: { track: 'address' },
    });
    expect(verificationNotificationFor({ userId: 'usr_priya', track: 'identity', outcome: 'action_needed' })).toEqual({
      userId: 'usr_priya',
      type: 'verification_action_needed',
      target: { kind: 'onboarding', step: 'identity' },
      params: { track: 'identity' },
    });
  });

  it('warns before the background check runs out, and when it has', () => {
    expect(verificationNotificationFor({ userId: 'usr_lee', track: 'background', outcome: 'expiring', days: 30 })).toMatchObject({ type: 'background_check_expiring', params: { days: 30 } });
    expect(verificationNotificationFor({ userId: 'usr_lee', track: 'background', outcome: 'expired', days: 4 })).toMatchObject({ type: 'background_check_expiring', params: { days: 0 } });
  });

  it('warns before the ID a helper verified with runs out, and when it has (plan 6.3)', () => {
    expect(verificationNotificationFor({ userId: 'usr_jordan', track: 'identity', outcome: 'expiring', days: 30 })).toEqual({ userId: 'usr_jordan', type: 'id_expiring', target: { kind: 'onboarding', step: 'identity' }, params: { days: 30 } });
    expect(verificationNotificationFor({ userId: 'usr_jordan', track: 'identity', outcome: 'expired' })).toMatchObject({ type: 'id_expiring', params: { days: 0 } });
  });

  it('says when onboarding is done', () => {
    expect(verificationNotificationFor({ userId: 'usr_jordan', track: 'helper', outcome: 'ready' })).toEqual({ userId: 'usr_jordan', type: 'helper_ready', target: { kind: 'onboarding', step: 'done' } });
  });

  it('tells a helper who waited that their city opened, leading to the area step (national, 2026-11-14)', () => {
    expect(verificationNotificationFor({ userId: 'usr_priya', track: 'helper', outcome: 'city_open', city: 'Dallas' })).toEqual({ userId: 'usr_priya', type: 'city_open', target: { kind: 'onboarding', step: 'area' }, title: 'Dallas' });
    expect(verificationNotificationFor({ userId: 'usr_priya', track: 'helper', outcome: 'city_open' })).toBeNull();
  });

  it('ignores anything else', () => {
    expect(verificationNotificationFor({ userId: 'usr_x', track: 'selfie', outcome: 'passed' })).toBeNull();
    expect(verificationNotificationFor({ userId: 'usr_x', track: 'address', outcome: 'expiring' })).toBeNull();
    expect(verificationNotificationFor({ track: 'identity', outcome: 'passed' })).toBeNull();
    expect(verificationNotificationFor({ userId: 'usr_x', track: 'helper', outcome: 'passed' })).toBeNull();
  });
});
