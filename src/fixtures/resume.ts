import type { HelperExperienceInput, HelperPreferencesInput, ResumeReadResult, ResumeSuggestions } from '@/contracts';

/**
 * "Import from resume" (2026-11-27): what Sam's resume suggests (canonical for previews and tests), and the skills,
 * preferences and experience his profile keeps.
 */

export const samExperience: HelperExperienceInput = {
  experience: [
    { title: 'Furniture assembler', organization: 'Hyde Park Home Goods', startYear: 2022, current: true, summary: 'Assemble beds, desks and shelving for delivery customers; about 15 pieces a week.' },
    { title: 'Mover', organization: 'Two Brothers Moving', startYear: 2019, endYear: 2022, summary: 'Packed, loaded and unloaded trucks for local moves.' },
  ],
};

export const samPreferences: HelperPreferencesInput = {
  skills: ['Flat-pack assembly', 'Furniture moving', 'Wall mounting', 'Packing'],
  likes: ['Big assembly jobs', 'Weekend moves'],
  excludes: ['Pianos and safes', 'Electrical wiring'],
};

export const samResumeSuggestions: ResumeSuggestions = {
  headline: 'Careful furniture assembly and moving help in Hyde Park',
  bio: "I've assembled furniture for Hyde Park Home Goods since 2022 and moved homes with Two Brothers Moving for three years before that. I bring my own drill, bits and straps, and I leave the room tidy.",
  services: [
    { categorySlug: 'furniture-assembly', description: 'Beds, desks, shelving and wardrobes, with my own tools.', reason: 'Assembler at Hyde Park Home Goods since 2022', alreadyOffered: true },
    { categorySlug: 'moving-help', description: 'Loading, unloading and careful carrying.', reason: 'Mover at Two Brothers Moving, 2019 to 2022', alreadyOffered: true },
    { categorySlug: 'light-cleaning', description: 'Move-out cleaning after a move.', reason: 'Move-out cleaning listed under skills', alreadyOffered: false },
  ],
  skills: ['Flat-pack assembly', 'Furniture moving', 'Wall mounting', 'Packing', 'Truck loading'],
  tools: ['Cordless drill', 'Moving straps', 'Furniture dolly'],
  languages: ['en', 'es'],
  likes: ['Big assembly jobs', 'Weekend moves'],
  excludes: ['Pianos and safes', 'Electrical wiring'],
  experience: samExperience.experience,
};

export const samResumeRead: ResumeReadResult = { ok: true, suggestions: samResumeSuggestions, by: 'ai' };

/** Without AI: keyword suggestions only (no headline or About text). */
export const samResumeReadBasic: ResumeReadResult = {
  ok: true,
  by: 'basic',
  suggestions: { ...samResumeSuggestions, headline: undefined, bio: undefined, likes: [], excludes: [], experience: [] },
};
