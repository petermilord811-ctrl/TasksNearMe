import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { ADDRESS_DOCUMENT_TYPES, type AddressDocumentType } from '@/contracts';
import { AiRefusedError, AiUnavailableError, DEFAULT_CLAUDE_MODEL, type ClaudeClient } from './claude';

/**
 * Reads a proof-of-address document once for our trust team (completion plan 4.1): is it readable, does the
 * name match the account's, does the address match the one entered, is it dated within 90 days, and what
 * kind of document is it. Only these answers are kept, never the document's text; staff still decide.
 * With `ANTHROPIC_API_KEY` Claude reads it (images and PDFs, through the official SDK); without one,
 * development and tests use a stand-in that reads nothing and trusts the declared type.
 */

export interface AddressDocumentReading {
  readable: boolean;
  nameMatches?: boolean;
  addressMatches?: boolean;
  recent?: boolean;
  documentType?: AddressDocumentType | 'other';
}

export interface AddressDocumentInput {
  document: { bytes: Buffer; contentType: string };
  expected: { name: string; address: string; declaredType: AddressDocumentType; submittedOn: string };
}

export interface AddressDocumentReader {
  /** Kept with the answers (`claude:<model>`, `stand-in`). */
  readonly name: string;
  read(input: AddressDocumentInput): Promise<AddressDocumentReading>;
}

const IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const answerSchema = z.object({
  readable: z.boolean(),
  documentType: z.enum([...ADDRESS_DOCUMENT_TYPES, 'other']),
  nameMatches: z.boolean().nullable(),
  addressMatches: z.boolean().nullable(),
  datedWithin90Days: z.boolean().nullable(),
});

const SYSTEM = [
  "You help a home-services marketplace's trust and safety team check proof-of-address documents.",
  'Compare the attached document with the expected name and address and answer only the questions asked.',
  'Never copy text, numbers or amounts from the document into your answer.',
  'A name matches when the document is addressed to the same person (middle names, initials and letter case may differ).',
  'An address matches when the street number, street, city and ZIP code are the same (abbreviations such as St and Street are the same; the unit may be missing).',
  'Use null when the document does not show the answer. Mark it unreadable when it is blurred, cut off, or not a document.',
].join(' ');

function promptFor(expected: AddressDocumentInput['expected']): string {
  const clean = (text: string) => text.replace(/[<>]/g, ' ').trim();
  return [
    `Expected name: ${clean(expected.name)}`,
    `Expected address: ${clean(expected.address)}`,
    `The person said it is a: ${expected.declaredType.replaceAll('_', ' ')}`,
    `It was sent on ${expected.submittedOn}; "dated within 90 days" means its issue or statement date is no more than 90 days before that.`,
  ].join('\n');
}

export function createClaudeDocumentReader({ client, model }: { client: ClaudeClient; model: string }): AddressDocumentReader {
  return {
    name: `claude:${model}`,
    async read({ document, expected }) {
      // Uploads are stored as WebP (photos) or PDF; anything else isn't something Claude reads.
      if (document.contentType !== 'application/pdf' && !IMAGE_TYPES.includes(document.contentType as ImageType)) return { readable: false };
      const data = document.bytes.toString('base64');
      const attachment =
        document.contentType === 'application/pdf'
          ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
          : ({ type: 'image', source: { type: 'base64', media_type: document.contentType as ImageType, data } } as const);
      let response;
      try {
        response = await client.messages.parse({
          model,
          // Thinking is always on for this model; low effort keeps it short.
          max_tokens: 4_000,
          system: SYSTEM,
          messages: [{ role: 'user', content: [attachment, { type: 'text', text: promptFor(expected) }] }],
          output_config: { effort: 'low', format: zodOutputFormat(answerSchema) },
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
      return {
        readable: true,
        documentType: answer.documentType,
        ...(answer.nameMatches !== null ? { nameMatches: answer.nameMatches } : {}),
        ...(answer.addressMatches !== null ? { addressMatches: answer.addressMatches } : {}),
        ...(answer.datedWithin90Days !== null ? { recent: answer.datedWithin90Days } : {}),
      };
    },
  };
}

/** Development and tests: reads nothing, trusts the declared type, and says so (staff see "not sure"). */
export function createStandInDocumentReader(): AddressDocumentReader {
  return {
    name: 'stand-in',
    async read({ expected }) {
      return { readable: true, documentType: expected.declaredType };
    },
  };
}

/** The reader for this environment: Claude with a key, the stand-in outside production, none in production without a key. */
export function documentReaderFromEnv(env: Record<string, string | undefined> = process.env): AddressDocumentReader | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
    // The job runner reads in the background, so it can wait longer than a button in a form.
    return createClaudeDocumentReader({ client: new Anthropic({ apiKey: key, timeout: 45_000, maxRetries: 1 }), model });
  }
  return env.NODE_ENV === 'production' ? null : createStandInDocumentReader();
}
