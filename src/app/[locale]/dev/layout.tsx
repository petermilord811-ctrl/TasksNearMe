import { notFound } from 'next/navigation';
import { devHelpersOn } from '@/shared/dev-helpers';

/** Dev-only tooling (UI preview gallery). Never available in production builds. */
export default function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!devHelpersOn()) notFound();
  return children;
}
