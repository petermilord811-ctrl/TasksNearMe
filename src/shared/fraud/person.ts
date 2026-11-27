import type { AdminAccountView, AdminDetectedIp, AdminFraudArea, AdminFraudView, AdminPersonVerification, FraudScore } from '@/contracts';
import { accountFraud, backgroundFraud, combineFraud, ipsAreaFraud, payoutFraud } from './score';

/**
 * The person's fraud score for the staff person page (owner, 2026-11-27: "By all that scores, finalized the user's
 * fraud score"): the addresses they used, their ID check, their proofs of address, payouts, the background check and
 * the account itself, each scored (score.ts), and the final score combining them.
 */
export function personFraudView(input: {
  verification: AdminPersonVerification;
  ips: { ips: AdminDetectedIp[]; total: number; recent: number };
  account?: AdminAccountView;
  memberSince: string;
  phoneVerified: boolean;
  strikes: number;
  now: Date;
}): AdminFraudView {
  const { verification } = input;
  const latestCapture = verification.identity.captures[0];
  const latestProof = verification.address.proofs[0];
  const areas: AdminFraudArea[] = [
    { area: 'ips', fraud: ipsAreaFraud(input.ips.ips.map((ip) => ip.fraud).filter((score): score is FraudScore => score !== undefined)) },
    { area: 'identity', fraud: latestCapture?.fraud ?? null },
    { area: 'address', fraud: latestProof?.fraud ?? null },
    { area: 'payout', fraud: payoutFraud(verification.payout.status) },
    { area: 'background', fraud: backgroundFraud(verification.background) },
    {
      area: 'account',
      fraud: accountFraud({
        createdAt: new Date(input.memberSince),
        now: input.now,
        ...(input.account ? { status: input.account.status, contactHold: input.account.contactHold !== undefined } : {}),
        strikes: input.strikes,
        phoneVerified: input.phoneVerified,
        recentIps: input.ips.recent,
      }),
    },
  ];
  return { fraud: combineFraud(areas.map((area) => area.fraud)), areas, ips: input.ips.ips, ipsTotal: input.ips.total };
}
