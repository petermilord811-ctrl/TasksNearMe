/**
 * The account page's groups, in order (audit M37). A plain module, not the client one (account-groups.tsx): the
 * server-rendered AccountScreen maps over it, and a server component importing a value from a 'use client' module
 * gets a reference to it, not the array.
 */
export const ACCOUNT_GROUPS = ['profile', 'security', 'notifications', 'helping', 'privacy'] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];
