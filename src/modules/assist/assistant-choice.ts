import 'server-only';
import { cookies } from 'next/headers';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createFakeSupportAssistant, createSupportAssistant, type SupportAssistant } from '@/integrations/ai/support-assistant';

const assistant = createSupportAssistant();

/**
 * The support assistant for this request (2026-11-22): the free models through the balancer, or the rule-based stand-in
 * in development. Tests ask for the stand-in with the `tnm_ai_stand_in` cookie (never in production), so they never
 * reach a model.
 */
export async function supportAssistantForRequest(): Promise<SupportAssistant | null> {
  return wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value) ? createFakeSupportAssistant() : assistant;
}
