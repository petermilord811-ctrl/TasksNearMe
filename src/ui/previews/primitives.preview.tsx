import type { PreviewEntry } from "@/contracts/preview";
import messages from "../../../messages/en/ui/primitives.json";
import { ButtonsPreview, FormsPreview, CalendarPreview, OverlaysPreview, NavigationPreview, DataPreview, FeedbackPreview } from "./primitives-examples";

export const primitivePreviews: PreviewEntry[] = [
  { id: 'primitives/buttons-badges', group: messages.group, title: messages.titles.buttons, render: () => <ButtonsPreview /> },
  { id: 'primitives/forms', group: messages.group, title: messages.titles.forms, render: () => <FormsPreview /> },
  { id: 'primitives/calendar-controls', group: messages.group, title: messages.titles.calendar, render: () => <CalendarPreview /> },
  { id: 'primitives/overlays', group: messages.group, title: messages.titles.overlays, render: () => <OverlaysPreview /> },
  { id: 'primitives/navigation', group: messages.group, title: messages.titles.navigation, render: () => <NavigationPreview /> },
  { id: 'primitives/data', group: messages.group, title: messages.titles.data, render: () => <DataPreview /> },
  { id: 'primitives/feedback', group: messages.group, title: messages.titles.feedback, render: () => <FeedbackPreview /> },
];
