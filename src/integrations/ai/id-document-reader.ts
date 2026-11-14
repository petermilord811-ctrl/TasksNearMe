import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { IDENTITY_DOCUMENT_TYPES, type IdentityDocumentType } from '@/contracts';
import { AiRefusedError, AiUnavailableError, DEFAULT_CLAUDE_MODEL } from './claude';

/**
 * Reads the photo of an ID's front once for our trust team (our own ID check, stage 1; completion plan
 * 6.1): the name, birth date, expiry date, document type, issuing state and document number, as printed.
 * The app compares them with the account at once and keeps only yes/no answers and the expiry month and
 * year (`deriveIdentityAutoCheck`), plus a keyed hash of the number, state and birth date to spot the same
 * ID on two accounts (6.3); the name, birth date and document number themselves are never stored or logged. Claude is never
 * shown the selfie and never asked to compare faces: staff do that, and the provider double-checks.
 * With `ANTHROPIC_API_KEY` Claude reads it (through the official SDK, with the server-side fallback for a
 * declined request); without one, development and tests use a stand-in that reads nothing.
 */

export interface IdDocumentReading {
  readable: boolean;
  givenNames?: string;
  surname?: string;
  /** YYYY-MM-DD, as printed. */
  dateOfBirth?: string;
  /** YYYY-MM-DD, as printed. */
  expiryDate?: string;
  documentType?: IdentityDocumentType | 'other';
  /** The US state, or the country for a passport, as a code ("TX", "USA"). Read, never stored. */
  issuingState?: string;
  /** The license, ID card or passport number, as printed. Read once for a keyed hash, never stored or logged. */
  documentNumber?: string;
}

export interface IdDocumentInput {
  /** The front of the ID (a re-encoded WebP photo). */
  document: { bytes: Buffer; contentType: string };
  declaredType: IdentityDocumentType;
}

export interface IdDocumentReader {
  /** Kept with the answers (`claude:<model>`, `stand-in`). */
  readonly name: string;
  read(input: IdDocumentInput): Promise<IdDocumentReading>;
}

/** What the reader needs from the SDK client (tests pass a stub). */
export type ClaudeBetaClient = { beta: { messages: Pick<Anthropic['beta']['messages'], 'parse'> } };

const IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const answerSchema = z.object({
  readable: z.boolean(),
  documentType: z.enum([...IDENTITY_DOCUMENT_TYPES, 'other']),
  givenNames: z.string().nullable(),
  surname: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  expiryDate: z.string().nullable(),
  issuingState: z.string().nullable(),
  documentNumber: z.string().nullable(),
});

const SYSTEM = [
  "You help a home-services marketplace's trust and safety team read the government ID a person photographed to verify their identity: a US driver's license, a US state ID card, or a passport's photo page.",
  'Transcribe only the fields asked for, exactly as printed on the document. Write dates as YYYY-MM-DD.',
  'Do not describe the person or their photo, and do not compare faces: people on our team do that.',
  'Use null for a field the document does not show or that you cannot read with confidence.',
  'Mark the image unreadable when it is blurred, cut off, covered by glare, a screen or a copy of a document, or not an ID at all.',
].join(' ');

function promptFor(declaredType: IdentityDocumentType): string {
  return [
    `The person said it is a: ${declaredType.replaceAll('_', ' ')}.`,
    'Read the given names, the surname, the date of birth, the expiry date, the kind of document, the issuing state (a two-letter code) or, for a passport, the issuing country (its three-letter code), and the document number (the license, ID card or passport number, not any other number on it).',
  ].join('\n');
}

const text = (value: string | null) => (value && value.trim() ? value.trim().slice(0, 120) : undefined);

export function createClaudeIdReader({ client, model }: { client: ClaudeBetaClient; model: string }): IdDocumentReader {
  return {
    name: `claude:${model}`,
    async read({ document, declaredType }) {
      // Photos are stored as WebP; anything else isn't something Claude reads.
      if (!IMAGE_TYPES.includes(document.contentType as ImageType)) return { readable: false };
      let response;
      try {
        response = await client.beta.messages.parse({
          model,
          // Thinking is always on for this model; low effort keeps it short.
          max_tokens: 4_000,
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: document.contentType as ImageType, data: document.bytes.toString('base64') } },
                { type: 'text', text: promptFor(declaredType) },
              ],
            },
          ],
          output_config: { effort: 'low', format: betaZodOutputFormat(answerSchema) },
          // A declined request is tried again on the model's default fallback, inside the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? ` (HTTP ${error.status ?? 'none'})` : '';
        throw new AiUnavailableError(`Claude didn't answer${status}`, { cause: error });
      }
      if (response.stop_reason === 'refusal') throw new AiRefusedError();
      if (response.stop_reason === 'max_tokens') throw new AiUnavailableError('Claude ran out of room for the answer');
      const answer = response.parsed_output;
      if (!answer) throw new AiUnavailableError("Claude's answer didn't fit the expected shape");
      if (!answer.readable) return { readable: false };
      const read = {
        givenNames: text(answer.givenNames),
        surname: text(answer.surname),
        dateOfBirth: text(answer.dateOfBirth),
        expiryDate: text(answer.expiryDate),
        issuingState: text(answer.issuingState)?.toUpperCase(),
        documentNumber: text(answer.documentNumber),
      };
      return {
        readable: true,
        documentType: answer.documentType,
        ...Object.fromEntries(Object.entries(read).filter(([, value]) => value !== undefined)),
      };
    },
  };
}

/** Development and tests: reads nothing, trusts the declared type, and says so (staff see "not sure"). */
export function createStandInIdReader(): IdDocumentReader {
  return {
    name: 'stand-in',
    async read({ declaredType }) {
      return { readable: true, documentType: declaredType };
    },
  };
}

/** The reader for this environment: Claude with a key, the stand-in outside production, none in production without a key. */
export function idReaderFromEnv(env: Record<string, string | undefined> = process.env): IdDocumentReader | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
    // The job runner reads in the background, so it can wait longer than a button in a form.
    return createClaudeIdReader({ client: new Anthropic({ apiKey: key, timeout: 45_000, maxRetries: 1 }), model });
  }
  return env.NODE_ENV === 'production' ? null : createStandInIdReader();
}
