import { Fragment } from 'react';
import { parseRichText, type RichLine } from '@/shared/rich-text';
import { cn } from '@/ui/lib/utils';

/**
 * A formatted task description (src/shared/rich-text.ts): headings, lists, bold and italic drawn as elements, never
 * as HTML, so nothing a poster or an AI types can become markup. Plain descriptions read as before, line breaks kept.
 */
export interface RichTextProps {
  text: string;
  /** The level of the description's own headings: one below the heading of the section it sits in. */
  headingLevel?: 2 | 3 | 4 | 5;
  size?: 'sm' | 'base';
  className?: string;
}

function Line({ line }: { line: RichLine }) {
  return line.map((node, index) => {
    if (node.bold && node.italic) return <strong key={index} className="font-semibold"><em>{node.text}</em></strong>;
    if (node.bold) return <strong key={index} className="font-semibold">{node.text}</strong>;
    if (node.italic) return <em key={index}>{node.text}</em>;
    return <Fragment key={index}>{node.text}</Fragment>;
  });
}

export function RichText({ text, headingLevel = 3, size = 'base', className }: RichTextProps) {
  const blocks = parseRichText(text);
  const Heading = (`h${headingLevel}` as const);
  return <div className={cn('space-y-3 break-words', size === 'sm' ? 'text-sm leading-6' : 'text-base leading-7', className)}>
    {blocks.map((block, index) => {
      if (block.type === 'heading') {
        return <Heading key={index} className={cn('font-semibold tracking-[-0.01em] text-foreground [&:not(:first-child)]:pt-2', size === 'sm' ? 'text-[0.9375rem] leading-6' : 'text-[1.0625rem] leading-7')}><Line line={block.content} /></Heading>;
      }
      if (block.type === 'paragraph') {
        return <p key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}<Line line={line} /></Fragment>)}</p>;
      }
      const List = block.ordered ? 'ol' : 'ul';
      return <List key={index} start={block.start} className={cn('space-y-1.5 pl-5 marker:text-muted-foreground', block.ordered ? 'list-decimal' : 'list-disc')}>
        {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1"><Line line={item} /></li>)}
      </List>;
    })}
  </div>;
}
