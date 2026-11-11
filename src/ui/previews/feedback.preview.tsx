import type { PreviewEntry } from "@/contracts/preview";
import copy from "../../../messages/en/ui/common.json";
import { FeedbackPreview } from "./feedback-examples";

export const feedbackPreviews: PreviewEntry[] = [
  { id: 'feedback/empty', group: copy.emptyPreview, title: copy.emptyPreview, render: () => <FeedbackPreview variant="empty" /> },
  { id: 'feedback/error', group: copy.emptyPreview, title: copy.errorPreview, render: () => <FeedbackPreview variant="error" /> },
  { id: 'feedback/skeletons', group: copy.emptyPreview, title: copy.skeletonsPreview, render: () => <FeedbackPreview variant="skeletons" /> },
  { id: 'feedback/demo-badge', group: copy.emptyPreview, title: copy.demoPreview, render: () => <FeedbackPreview variant="demo" /> },
];
