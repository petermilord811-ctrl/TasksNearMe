'use client';

import { previews } from '@/ui/previews/registry';

/** Client boundary so previews can pass plain functions (fake handlers) to components. */
export function PreviewHost({ id }: { id: string }) {
  const entry = previews.find((p) => p.id === id);
  if (!entry) {
    return (
      <p role="alert" style={{ padding: 24 }}>
        Unknown preview: {id}
      </p>
    );
  }
  return (
    <div data-preview-root={entry.id} style={entry.layout === 'fullscreen' ? undefined : { padding: 16 }}>
      {entry.render()}
    </div>
  );
}
