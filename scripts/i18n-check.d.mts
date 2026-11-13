export interface NamespaceReport {
  errors: string[];
  missing: string[];
  absent?: boolean;
}

export const ENGLISH_ONLY: RegExp;
export function namespaceFiles(locale: string): Record<string, string>;
export function checkNamespace(englishTree: object, translatedTree: unknown): { errors: string[]; missing: string[] };
export function checkCatalogs(options?: { locales?: string[]; only?: string[] }): Record<string, Record<string, NamespaceReport>>;
