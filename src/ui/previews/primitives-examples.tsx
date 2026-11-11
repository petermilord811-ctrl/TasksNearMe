'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Check, Grid2X2, Info, List, Search } from 'lucide-react';
import { toast } from 'sonner';
import { MARKET_TIME_ZONE, routes } from '@/contracts';
import { DESK_TIMES, jordan, sam } from '@/fixtures';
import { formatDate } from '@/shared/format';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/primitives/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/ui/primitives/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Avatar, AvatarFallback } from '@/ui/primitives/avatar';
import { Badge } from '@/ui/primitives/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/ui/primitives/breadcrumb';
import { Button } from '@/ui/primitives/button';
import { Calendar } from '@/ui/primitives/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/primitives/card';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/ui/primitives/command';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/ui/primitives/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/primitives/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/primitives/input-group';
import { Label } from '@/ui/primitives/label';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/ui/primitives/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Progress } from '@/ui/primitives/progress';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { ScrollArea } from '@/ui/primitives/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/primitives/select';
import { Separator } from '@/ui/primitives/separator';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/primitives/sheet';
import { Skeleton } from '@/ui/primitives/skeleton';
import { Toaster } from '@/ui/primitives/sonner';
import { Spinner } from '@/ui/primitives/spinner';
import { Switch } from '@/ui/primitives/switch';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/ui/primitives/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';
import { Textarea } from '@/ui/primitives/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/ui/primitives/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/primitives/tooltip';
import messages from '../../../messages/en/ui/primitives.json';

type PreviewKind = keyof typeof messages.titles;

function PrimitiveFrame({ kind, children }: { kind: PreviewKind; children: ReactNode }) {
  const t = useTranslations('primitives');
  return (
    <main className="mx-auto max-w-180 space-y-6 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-8">{t(`titles.${kind}`)}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      {children}
    </main>
  );
}

export function ButtonsPreview() {
  const t = useTranslations('primitives');
  const [selected, setSelected] = useState(false);
  return (
    <PrimitiveFrame kind="buttons">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setSelected(!selected)} aria-pressed={selected}>{selected ? t('selected') : t('primary')}</Button>
        <Button variant="secondary" onClick={() => setSelected(!selected)}>{t('secondary')}</Button>
        <Button variant="outline" onClick={() => setSelected(!selected)}>{t('outline')}</Button>
        <Button variant="ghost" onClick={() => setSelected(!selected)}>{t('ghost')}</Button>
        <Button variant="destructive" onClick={() => setSelected(false)}>{t('destructive')}</Button>
        <Button disabled>{t('disabled')}</Button>
      </div>
      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{t('selected')}</Badge>
        <Badge variant="secondary">{t('neutral')}</Badge>
        <Badge variant="outline">{t('outline')}</Badge>
        <Badge variant="destructive">{t('attention')}</Badge>
        <Avatar className="size-12" aria-label={jordan.displayName}><AvatarFallback>{jordan.initials}</AvatarFallback></Avatar>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="outline"><Info aria-hidden="true" className="size-4" />{t('tooltipTrigger')}</Button></TooltipTrigger>
          <TooltipContent className="max-w-64"><p>{t('tooltipBody')}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </PrimitiveFrame>
  );
}

export function FormsPreview() {
  const t = useTranslations('primitives');
  const id = useId();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<{ label: string; notes: string }>();
  return (
    <PrimitiveFrame kind="forms">
      <form className="space-y-6" onSubmit={handleSubmit(() => setSaved(true))}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.label)}>
            <FieldLabel htmlFor={`${id}-label`}>{t('exampleLabel')}</FieldLabel>
            <Input id={`${id}-label`} aria-describedby={errors.label ? `${id}-hint ${id}-error` : `${id}-hint`} aria-invalid={Boolean(errors.label)} {...register('label', { required: t('labelRequired') })} />
            <FieldDescription id={`${id}-hint`}>{t('labelHint')}</FieldDescription>
            <FieldError id={`${id}-error`}>{errors.label?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-notes`}>{t('notes')}</FieldLabel>
            <Textarea id={`${id}-notes`} placeholder={t('notesPlaceholder')} {...register('notes')} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-search`}>{t('search')}</FieldLabel>
            <InputGroup>
              <InputGroupInput id={`${id}-search`} placeholder={t('searchPlaceholder')} />
              <InputGroupAddon><Search aria-hidden="true" className="size-4" /></InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox id={`${id}-check`} /><Label htmlFor={`${id}-check`} className="min-h-11 flex-1">{t('checkbox')}</Label>
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Switch id={`${id}-switch`} /><Label htmlFor={`${id}-switch`} className="min-h-11 flex-1">{t('switch')}</Label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('preference')}</legend>
          <RadioGroup defaultValue="morning">
            {(['morning', 'afternoon'] as const).map((value) => (
              <div key={value} className="flex min-h-11 items-center gap-3">
                <RadioGroupItem value={value} id={`${id}-${value}`} /><Label htmlFor={`${id}-${value}`} className="min-h-11 flex-1">{t(value)}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor={`${id}-category`}>{t('category')}</Label>
          <Select><SelectTrigger id={`${id}-category`} className="min-h-11 w-full"><SelectValue placeholder={t('chooseCategory')} /></SelectTrigger>
            <SelectContent><SelectItem value="assembly" className="min-h-11">{t('assembly')}</SelectItem><SelectItem value="yard" className="min-h-11">{t('yard')}</SelectItem></SelectContent>
          </Select>
        </div>
        <Button type="submit">{t('save')}</Button>
        <p role="status" aria-live="polite" className="text-sm">{saved ? t('saved') : null}</p>
      </form>
    </PrimitiveFrame>
  );
}

export function CalendarPreview() {
  const t = useTranslations('primitives');
  const [date, setDate] = useState<Date | undefined>(new Date(DESK_TIMES.agreedStart));
  const [view, setView] = useState('list');
  const [progress, setProgress] = useState(40);
  return (
    <PrimitiveFrame kind="calendar">
      <div className="max-[359px]:-mx-4">
      <Calendar
        mode="single"
        selected={date}
        defaultMonth={new Date(DESK_TIMES.agreedStart)}
        today={new Date(DESK_TIMES.agreedStart)}
        timeZone={MARKET_TIME_ZONE}
        onSelect={setDate}
        aria-label={t('calendarLabel')}
        labels={{ labelPrevious: () => t('previousMonth'), labelNext: () => t('nextMonth') }}
        className="w-full rounded-xl border p-1 [--cell-size:2.75rem]"
      />
      </div>
      <p aria-live="polite" className="text-sm tabular-nums">{date ? t('selectedDate', { date: formatDate(date) }) : t('noDate')}</p>
      <ToggleGroup type="single" value={view} onValueChange={(value) => { if (value) setView(value); }} aria-label={t('view')}>
        <ToggleGroupItem value="list" className="min-h-11 min-w-11"><List aria-hidden="true" className="size-4" />{t('list')}</ToggleGroupItem>
        <ToggleGroupItem value="grid" className="min-h-11 min-w-11"><Grid2X2 aria-hidden="true" className="size-4" />{t('grid')}</ToggleGroupItem>
      </ToggleGroup>
      <div className="space-y-3">
        <Progress value={progress} aria-label={t('progress')} />
        <p className="text-sm tabular-nums" aria-live="polite">{t('progressValue', { value: progress })}</p>
        <Button variant="outline" onClick={() => setProgress(progress >= 100 ? 0 : progress + 20)}>{t('increaseProgress')}</Button>
      </div>
    </PrimitiveFrame>
  );
}

export function OverlaysPreview() {
  const t = useTranslations('primitives');
  const [feedback, setFeedback] = useState('');
  return (
    <PrimitiveFrame kind="overlays">
      <div className="flex flex-wrap gap-3">
        <Dialog><DialogTrigger asChild><Button variant="outline">{t('dialog')}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{t('dialogTitle')}</DialogTitle><DialogDescription>{t('dialogDescription')}</DialogDescription></DialogHeader>
            <DialogFooter><DialogClose asChild><Button>{t('close')}</Button></DialogClose></DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet><SheetTrigger asChild><Button variant="outline">{t('sheet')}</Button></SheetTrigger>
          <SheetContent side="bottom"><SheetHeader><SheetTitle>{t('sheetTitle')}</SheetTitle><SheetDescription>{t('sheetDescription')}</SheetDescription></SheetHeader>
            <SheetFooter><SheetClose asChild><Button>{t('close')}</Button></SheetClose></SheetFooter>
          </SheetContent>
        </Sheet>
        <Drawer><DrawerTrigger asChild><Button variant="outline">{t('drawer')}</Button></DrawerTrigger>
          <DrawerContent><div className="mx-auto w-full max-w-180"><DrawerHeader><DrawerTitle>{t('drawerTitle')}</DrawerTitle><DrawerDescription>{t('drawerDescription')}</DrawerDescription></DrawerHeader>
            <DrawerFooter><DrawerClose asChild><Button>{t('close')}</Button></DrawerClose></DrawerFooter>
          </div></DrawerContent>
        </Drawer>
        <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive">{t('alertDialog')}</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => setFeedback(t('confirmed'))}>{t('confirm')}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Popover><PopoverTrigger asChild><Button variant="outline">{t('popover')}</Button></PopoverTrigger>
          <PopoverContent className="max-w-[calc(100vw-2rem)]"><h2 className="font-semibold">{t('popoverTitle')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('popoverDescription')}</p></PopoverContent>
        </Popover>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">{t('menu')}</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuLabel>{t('menuLabel')}</DropdownMenuLabel><DropdownMenuSeparator />
            {(['menuFirst', 'menuSecond'] as const).map((key) => <DropdownMenuItem key={key} className="min-h-11" onSelect={() => setFeedback(t('menuResult', { label: t(key) }))}>{t(key)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p role="status" aria-live="polite" className="text-sm">{feedback}</p>
    </PrimitiveFrame>
  );
}

export function NavigationPreview() {
  const t = useTranslations('primitives');
  const [page, setPage] = useState(1);
  return (
    <PrimitiveFrame kind="navigation">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href={routes.dev.ui()} className="inline-flex min-h-11 items-center">{t('home')}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{t('current')}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <Tabs defaultValue="overview">
        <TabsList className="h-auto"><TabsTrigger value="overview" className="min-h-11">{t('tabOverview')}</TabsTrigger><TabsTrigger value="details" className="min-h-11">{t('tabDetails')}</TabsTrigger></TabsList>
        <TabsContent value="overview" className="rounded-lg border p-4">{t('overviewContent')}</TabsContent>
        <TabsContent value="details" className="rounded-lg border p-4">{t('detailsContent')}</TabsContent>
      </Tabs>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('accordionHeading')}</h2>
        <Accordion type="single" collapsible defaultValue="first">
          <AccordionItem value="first"><AccordionTrigger className="min-h-11">{t('accordionTitle')}</AccordionTrigger><AccordionContent>{t('accordionBody')}</AccordionContent></AccordionItem>
          <AccordionItem value="second"><AccordionTrigger className="min-h-11">{t('accordionSecond')}</AccordionTrigger><AccordionContent>{t('accordionSecondBody')}</AccordionContent></AccordionItem>
        </Accordion>
      </section>
      <Pagination aria-label={t('paginationLabel')}><PaginationContent>
        {[1, 2, 3].map((number) => <PaginationItem key={number}><PaginationLink href={routes.dev.preview('primitives/navigation')} aria-label={t('page', { page: number })} className="min-h-11 min-w-11" isActive={page === number} onClick={(event) => { event.preventDefault(); setPage(number); }}>{number}</PaginationLink></PaginationItem>)}
      </PaginationContent></Pagination>
      <p aria-live="polite" className="text-sm">{t('currentPage', { page })}</p>
    </PrimitiveFrame>
  );
}

export function DataPreview() {
  const t = useTranslations('primitives');
  const [selected, setSelected] = useState('');
  return (
    <PrimitiveFrame kind="data">
      <Card><CardHeader><CardTitle>{t('cardTitle')}</CardTitle><CardDescription>{t('cardDescription')}</CardDescription></CardHeader><CardContent><p>{t('cardBody')}</p></CardContent><CardFooter><Button onClick={() => setSelected(t('saved'))}>{t('save')}</Button></CardFooter></Card>
      <Table><TableCaption>{t('tableCaption')}</TableCaption><TableHeader><TableRow><TableHead scope="col">{t('person')}</TableHead><TableHead scope="col">{t('area')}</TableHead></TableRow></TableHeader><TableBody>
        {[jordan, sam].map((person) => <TableRow key={person.id}><TableCell className="font-medium">{person.displayName}</TableCell><TableCell className="whitespace-normal">{person.areaName}</TableCell></TableRow>)}
      </TableBody></Table>
      <ScrollArea className="h-44 rounded-xl border" aria-label={t('scrollLabel')} tabIndex={0}>
        <ul className="divide-y px-4">{Array.from({ length: 12 }, (_, index) => <li key={index} className="py-3 text-sm">{t('scrollItem', { number: index + 1 })}</li>)}</ul>
      </ScrollArea>
      <Command className="rounded-xl border" label={t('commandLabel')}>
        <CommandInput aria-label={t('search')} placeholder={t('searchPlaceholder')} />
        <CommandList><CommandEmpty>{t('commandEmpty')}</CommandEmpty><CommandGroup heading={t('commandGroup')}>
          {(['commandButtons', 'commandFields', 'commandFeedback'] as const).map((key) => <CommandItem key={key} className="min-h-11" value={t(key)} onSelect={() => setSelected(t('menuResult', { label: t(key) }))}>{t(key)}</CommandItem>)}
        </CommandGroup></CommandList>
      </Command>
      <p role="status" aria-live="polite" className="text-sm">{selected}</p>
    </PrimitiveFrame>
  );
}

export function FeedbackPreview() {
  const t = useTranslations('primitives');
  const [added, setAdded] = useState(false);
  return (
    <PrimitiveFrame kind="feedback">
      <Alert><Check aria-hidden="true" className="size-4" /><AlertTitle>{t('alertTitle')}</AlertTitle><AlertDescription>{t('alertBody')}</AlertDescription></Alert>
      <Alert variant="destructive"><Info aria-hidden="true" className="size-4" /><AlertTitle>{t('errorTitle')}</AlertTitle><AlertDescription>{t('errorBody')}</AlertDescription></Alert>
      <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><List aria-hidden="true" /></EmptyMedia><EmptyTitle>{t('emptyTitle')}</EmptyTitle><EmptyDescription>{t('emptyBody')}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={() => setAdded(true)}>{t('addExample')}</Button><p aria-live="polite">{added ? t('exampleAdded') : null}</p></EmptyContent></Empty>
      <div role="status" aria-label={t('loading')} className="space-y-3 rounded-xl border p-4">
        <div aria-hidden="true" className="flex items-center gap-3"><Skeleton className="size-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></div>
        <p className="flex items-center gap-2 text-sm"><Spinner aria-hidden="true" className="size-4" />{t('loading')}</p>
      </div>
      <Button variant="outline" onClick={() => toast.success(t('toastMessage'))}>{t('toast')}</Button>
      <Toaster theme="system" containerAriaLabel={t('notifications')} />
    </PrimitiveFrame>
  );
}

