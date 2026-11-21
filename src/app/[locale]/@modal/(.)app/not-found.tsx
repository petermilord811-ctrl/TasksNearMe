import { withClientMessages } from '@/i18n/client-messages';
import { RouteDialogNotFound } from '@/ui/components/layout/route-dialog-frame';

/** A dialog's page that isn't there, or isn't this person's: said in the dialog, which still closes as usual. */
function RouteDialogNotFoundPage() {
  return <RouteDialogNotFound />;
}

export default withClientMessages('[locale]/@modal/(.)app/not-found.tsx', RouteDialogNotFoundPage);
