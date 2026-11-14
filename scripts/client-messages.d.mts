// Types for client-messages.mjs (the analyzer behind src/i18n/client-namespaces.generated.ts).
export const OUTPUT: string;
export const DYNAMIC: Record<string, string[]>;
export function clientNamespaces(entry: string): { namespaces: string[]; problems: string[] };
export function minimal(namespaces: string[]): string[];
export function generate(): { routes: Record<string, string[]>; problems: string[] };
export function serialize(routes: Record<string, string[]>): string;
