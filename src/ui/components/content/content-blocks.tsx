import Link from 'next/link';
import { Info, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ContentBlock, RichText } from '@/contracts';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { cn } from '@/ui/lib/utils';

function InlineContent({ content }: { content: RichText }) {
  const t = useTranslations('help');
  return content.map((node, index) => {
    if (typeof node === 'string') return node;
    if ('strong' in node) return <strong key={index}>{node.text}</strong>;
    const className = 'rounded-sm text-primary underline decoration-1 underline-offset-4 hover:decoration-2';
    if (node.href.startsWith('/')) return <Link key={index} href={node.href} className={className}>{node.text}</Link>;
    return <a key={index} href={node.href} rel="noopener noreferrer" className={className}>{node.text} <span className="sr-only">{t('externalLink')}</span></a>;
  });
}

export function ContentBlocks({ blocks, headingLevel = 2 }: { blocks: ContentBlock[]; headingLevel?: 2 | 3 }) {
  const t = useTranslations('help');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <div className="space-y-5 break-words text-base leading-7">
    {blocks.map((block, index) => {
      switch (block.type) {
        case 'paragraph':
          return <p key={index}><InlineContent content={block.content} /></p>;
        case 'heading':
          return <Heading key={index} className={cn('pt-3 font-display font-semibold tracking-[-0.015em]', headingLevel === 2 ? 'text-xl leading-7 lg:text-[22px] lg:leading-[30px]' : 'text-[17px] leading-6 lg:text-lg lg:leading-[26px]')}>{block.text}</Heading>;
        case 'list': {
          const List = block.ordered ? 'ol' : 'ul';
          return <List key={index} className={cn('space-y-2 pl-6 marker:text-muted-foreground', block.ordered ? 'list-decimal' : 'list-disc')}>
            {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1"><InlineContent content={item} /></li>)}
          </List>;
        }
        case 'callout': {
          const Icon = block.tone === 'warning' ? TriangleAlert : Info;
          return <Alert key={index} role="note" aria-label={t(block.tone === 'warning' ? 'calloutWarning' : 'calloutInfo')} className={cn('border-transparent', block.tone === 'warning' ? 'bg-badge-warning text-badge-warning-foreground' : 'bg-badge-info text-badge-info-foreground')}>
            <Icon aria-hidden="true" />
            <AlertDescription className="block text-base leading-6 text-inherit [&_a]:text-inherit"><InlineContent content={block.content} /></AlertDescription>
          </Alert>;
        }
      }
    })}
  </div>;
}
