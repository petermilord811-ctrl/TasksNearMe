import { NotFoundScreen } from '@/ui/screens/not-found/not-found-screen';

/** A signed-in page that isn't there, or isn't this person's: in the app's shell, with the app's ways on. */
export default function AppNotFound() {
  return <NotFoundScreen place="app" />;
}
