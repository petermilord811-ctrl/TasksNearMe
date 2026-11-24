'use client';

import { useState } from 'react';
import { FollowersDialog, type FollowersDialogProps } from '@/ui/components/family/followers-dialog';

/** The followers dialog, open, for the preview gallery (it's controlled by its trigger in the app). */
export function OpenFollowersDialog(props: Omit<FollowersDialogProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(true);
  return <FollowersDialog open={open} onOpenChange={setOpen} {...props} />;
}
