'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/ui/primitives/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/primitives/sheet';

export function MobileMenu({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const t = useTranslations('shell');
  const [open, setOpen] = useState(false);
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label={t('openMenu')}><Menu aria-hidden="true" className="size-5" /></Button></SheetTrigger>
    <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      <div className="px-4" onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) setOpen(false); }}>{children}</div>
    </SheetContent>
  </Sheet>;
}
