import { useTranslations } from 'next-intl';
import type { SavedHelperHandlers, SavedHelpersPageData } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { SavedHelpersList, type SavedHelpersPreviewState } from './saved-helpers-list';

export interface SavedHelpersScreenProps {
  data: SavedHelpersPageData;
  handlers: SavedHelperHandlers;
}

export function SavedHelpersScreen(props: SavedHelpersScreenProps) {
  return <SavedHelpersContent {...props} />;
}

/** Static gallery states are separate from the screen's route-facing contract. */
export function SavedHelpersContent({ data, handlers, preview }: SavedHelpersScreenProps & { preview?: SavedHelpersPreviewState }) {
  const t = useTranslations('savedHelpers');
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    <SavedHelpersList data={data} handlers={handlers} preview={preview} />
  </div>;
}
