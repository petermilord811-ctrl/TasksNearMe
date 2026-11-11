/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/** Signed-in area. The shell comes from the (main) and (flow) group layouts. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
