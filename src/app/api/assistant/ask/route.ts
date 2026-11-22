import type { AskAssistantInput, AskAssistantResult } from '@/contracts';
import { askSupportAssistant } from '@/modules/assist/support-chat';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { readTextUpTo } from '@/platform/http/body';
import { NO_STORE, supportAssistantForRequest } from '../../messages/_shared';

/** A question with its context turns is a few kilobytes; nothing near this. */
const MAX_BYTES = 128 * 1024;

const answer = (result: AskAssistantResult, status = 200) => Response.json(result, { status, headers: NO_STORE });

/**
 * A question to the support assistant (2026-11-22; src/contracts/assistant.ts, AskAssistantResult). A route rather than a
 * Server Action: an answer can take several seconds, and a page's Server Actions run one at a time. JSON only, from this
 * site only (a page elsewhere can't send JSON here without a preflight this route never answers, and its Origin says so).
 */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return answer({ ok: false, code: 'not_allowed' }, 403);
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return answer({ ok: false, code: 'validation_failed' }, 415);
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return answer({ ok: false, code: 'not_allowed' }, 401);
  const text = await readTextUpTo(request, MAX_BYTES);
  if (text === null) return answer({ ok: false, code: 'validation_failed' }, 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return answer({ ok: false, code: 'validation_failed' }, 400);
  }
  const result = await askSupportAssistant({ db, assistant: await supportAssistantForRequest(), now: await requestNow() }, viewer.user.id, input as AskAssistantInput);
  return answer(result);
}
