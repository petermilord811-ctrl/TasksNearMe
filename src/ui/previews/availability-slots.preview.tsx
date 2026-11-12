import type { PreviewEntry } from '@/contracts';
import { jordanProfileWithSlotsData } from '@/fixtures';
import { AvailabilitySlotList } from '@/ui/components/availability/availability-slot-list';
import copy from '../../../messages/en/ui/availability.json';

export const availabilitySlotPreviews: PreviewEntry[] = [{
  id: 'component-availability-slot-list/default',
  group: copy.openTimes,
  title: copy.previews.slotList,
  render: () => <AvailabilitySlotList slots={jordanProfileWithSlotsData.slots ?? []} handle={jordanProfileWithSlotsData.helper.handle} />,
}];
