import { useTranslations } from 'next-intl';
import type { MessageSegment, PreviewEntry } from '@/contracts';
import { maskedEmailMessage, maskedPhoneMessage, unmaskedMessage } from '@/fixtures';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import locationMessages from '../../../messages/en/ui/location.json';

function MessagePreview({ segments, variant }: { segments: MessageSegment[]; variant: 'phone' | 'email' | 'unmasked' }) {
  const t = useTranslations('location');
  return (
    <main className="mx-auto max-w-180 space-y-6 py-4">
      <h1 className="text-2xl font-bold leading-8">{t(`previews.${variant}Title`)}</h1>
      <p className="rounded-xl border bg-card p-4 leading-7 sm:p-6">
        <MaskedText segments={segments} />
      </p>
    </main>
  );
}

export const messagingPreviews: PreviewEntry[] = [
  {
    id: 'masked-text/phone',
    group: locationMessages.previews.messagingGroup,
    title: locationMessages.previews.phoneTitle,
    render: () => <MessagePreview segments={maskedPhoneMessage} variant="phone" />,
  },
  {
    id: 'masked-text/email',
    group: locationMessages.previews.messagingGroup,
    title: locationMessages.previews.emailTitle,
    render: () => <MessagePreview segments={maskedEmailMessage} variant="email" />,
  },
  {
    id: 'masked-text/unmasked',
    group: locationMessages.previews.messagingGroup,
    title: locationMessages.previews.unmaskedTitle,
    render: () => <MessagePreview segments={unmaskedMessage} variant="unmasked" />,
  },
];
