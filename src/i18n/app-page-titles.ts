/** The signed-in pages' own titles, `server.meta.app.<key>` in each language (sweep J-E9). */
export const APP_PAGE_TITLES = [
  'home', 'myTasks', 'task', 'postTask', 'offer', 'confirmAndPay', 'bookings', 'booking', 'complete', 'review', 'reportProblem',
  'proposeChange', 'changeRequest', 'rebook', 'proposal', 'messages', 'conversation', 'helpChat', 'notifications', 'account', 'payments',
  'receipt', 'support', 'supportCase', 'findHelpers', 'savedHelpers', 'requestHelper', 'savedSearch', 'series', 'report',
  'verifyIdentity', 'findWork', 'findWorkTask', 'myOffers', 'availability', 'myClients', 'earnings', 'rewards', 'helperProfile',
  'becomeHelper', 'newMessage', 'sparks',
] as const;
export type AppPageTitle = (typeof APP_PAGE_TITLES)[number];
