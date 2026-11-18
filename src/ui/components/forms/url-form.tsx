'use client';

import { Fragment, useLayoutEffect, useRef, type ComponentProps } from 'react';

/**
 * A filter form whose fields always show its URL's values (sweep D10): give its fields the URL's values as
 * `defaultValue`. Next keeps up to 3 visited pages alive but hidden (React Activity) and shows one again as it was
 * left, on Back or on a link to the same URL such as Clear, so a field could come back holding text its URL doesn't
 * have, which the next search would quietly apply. This form goes back to its defaults whenever the router hides it,
 * and starts its fields over when the URL changes under it (`urlKey`: the values its fields show). Works before the
 * page hydrates, like any form.
 */
export function UrlForm({ urlKey, children, ...props }: ComponentProps<'form'> & { urlKey: string }) {
  const form = useRef<HTMLFormElement>(null);
  // Layout effects stop when Activity hides the page and start again when it shows it: reset on the way out.
  useLayoutEffect(() => {
    const node = form.current;
    return () => node?.reset();
  }, []);
  return <form {...props} ref={form}><Fragment key={urlKey}>{children}</Fragment></form>;
}
