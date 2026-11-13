import { routes } from '@/contracts/routes';
import { previews } from '@/ui/previews/registry';

export const metadata = { title: 'UI previews' };

/** Lists every registered preview. The test harness reads the data-preview-id links. */
export default function PreviewIndexPage() {
  const groups = new Map<string, typeof previews>();
  for (const entry of previews) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 960 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>UI previews ({previews.length})</h1>
      {previews.length === 0 && <p>No previews registered yet (src/ui/previews/registry.ts).</p>}
      {[...groups.entries()].map(([group, entries]) => (
        <section key={group} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{group}</h2>
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <a href={routes.dev.preview(entry.id)} data-preview-id={entry.id}>
                  {entry.title}
                </a>
                {entry.notes ? <span> — {entry.notes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
