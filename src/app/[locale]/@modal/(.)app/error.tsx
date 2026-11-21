'use client';

import { RouteDialogError } from '@/ui/components/layout/route-dialog-error';

/** A dialog's page that failed on the server: said in the dialog, with Try again. */
export default function RouteDialogErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteDialogError digest={error.digest} onRetry={retry} />;
}
