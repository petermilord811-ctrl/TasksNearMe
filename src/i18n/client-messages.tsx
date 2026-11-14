import type { ReactNode } from 'react';
import type { AbstractIntlMessages } from 'next-intl';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import { pickMessages } from './catalog';
import { CLIENT_NAMESPACES, type ClientRoute } from './client-namespaces.generated';
import { IntlClientProvider } from './client-provider';

/**
 * Per-page message catalogs (completion plan 5.7). A client component reads its copy from the nearest provider,
 * and what a provider holds travels with the page, so each route file gives its client components only the
 * namespaces they use (scripts/client-messages.mjs works them out from the imports). A layout's provider covers
 * its own shell; the page inside it has its own. Server components read the whole catalog on the server.
 */
const picked = new WeakMap<object, Map<ClientRoute, AbstractIntlMessages>>();

function messagesFor(messages: object, route: ClientRoute): AbstractIntlMessages {
  let byRoute = picked.get(messages);
  if (!byRoute) picked.set(messages, (byRoute = new Map()));
  let result = byRoute.get(route);
  if (!result) byRoute.set(route, (result = pickMessages(messages, CLIENT_NAMESPACES[route])));
  return result;
}

/** A provider with the namespaces of one route file (the root layout uses this; the rest `withClientMessages`). */
export async function ClientMessages({ route, children }: { route: ClientRoute; children: ReactNode }) {
  const [locale, timeZone, messages] = await Promise.all([getLocale(), getTimeZone(), getMessages()]);
  return <IntlClientProvider locale={locale} timeZone={timeZone} messages={messagesFor(messages, route)}>{children}</IntlClientProvider>;
}

/** A page or layout whose client components get their route file's namespaces: `export default withClientMessages('[locale]/…/page.tsx', Page)`. */
export function withClientMessages<Props extends object>(route: ClientRoute, Component: (props: Props) => ReactNode | Promise<ReactNode>) {
  async function WithClientMessages(props: Props) {
    return <ClientMessages route={route}><Component {...props} /></ClientMessages>;
  }
  WithClientMessages.displayName = `WithClientMessages(${Component.name || 'Route'})`;
  return WithClientMessages;
}
