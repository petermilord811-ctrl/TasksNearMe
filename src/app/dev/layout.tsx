import { notFound } from 'next/navigation';

/** Dev-only tooling (UI preview gallery). Never available in production builds. */
export default function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
