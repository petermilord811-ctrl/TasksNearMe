import type { HelperPeekData, PeekData } from '@/contracts';
import { helpArticleWhenCharged, helpCenterData, legalTermsDraft } from './content';
import { PROFILE_NOW, samNeighborsAnswers, samProfilePageData } from './profiles';
import { jordanSparks } from './sparks';

/** Peeks (2026-11-23): what the sheet shows for a helper's profile, the help center, an article and a policy. */

/** Sam, a helper with reviews, Sparks and four services, not yet saved. */
export const samPeekData: HelperPeekData = { profile: { ...samProfilePageData, username: 'sam_k', acceptsMessages: true, sparks: jordanSparks }, saved: false, self: false, now: PROFILE_NOW };
/** Sam looking at their own profile: no Message, Request or Save. */
export const samSelfPeekData: HelperPeekData = { ...samPeekData, self: true };

export const helperPeek: PeekData = { kind: 'helper', data: samPeekData };
export const helperSelfPeek: PeekData = { kind: 'helper', data: samSelfPeekData };
export const helpCenterPeek: PeekData = { kind: 'help', data: { kind: 'center', data: helpCenterData } };
export const helpArticlePeek: PeekData = { kind: 'help', data: { kind: 'article', data: helpArticleWhenCharged } };
export const legalPeek: PeekData = { kind: 'legal', data: legalTermsDraft };

/** Sam's peek with their answers on Neighbors (2026-11-24). */
export const samAnswersPeekData: HelperPeekData = { ...samPeekData, profile: { ...samPeekData.profile, neighborsAnswers: samNeighborsAnswers } };
export const helperAnswersPeek: PeekData = { kind: 'helper', data: samAnswersPeekData };
