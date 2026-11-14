/** @vitest-environment jsdom */
import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { Input } from './input';
import { Switch } from './switch';
import { Textarea } from './textarea';

/**
 * Controls that need JavaScript wait for hydration (completion plan 5.19): the server's HTML marks them
 * unavailable, and hydrating lifts it. What works without scripts (links, GET search forms) is never marked.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const serverHtml = (element: ReactElement) => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  return container.firstElementChild as HTMLElement;
};

describe('before hydration', () => {
  it('a button with a click handler is aria-disabled and stays in the focus order', () => {
    const button = serverHtml(<Button type="button" onClick={() => {}}>Disconnect</Button>);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('data-hydrating')).toBe(true);
  });

  it('a submit button is disabled, so Enter in a field doesn’t send the form the browser’s way', () => {
    const button = serverHtml(<Button type="submit">Send</Button>);
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.className).toContain('disabled:opacity-100');
  });

  it('text fields are read-only; a switch is aria-disabled', () => {
    expect(serverHtml(<Input name="email" />).hasAttribute('readonly')).toBe(true);
    expect(serverHtml(<Textarea name="note" />).hasAttribute('readonly')).toBe(true);
    expect(serverHtml(<Switch aria-label="Email" />).getAttribute('aria-disabled')).toBe('true');
  });

  it('links, GET search forms and buttons already disabled are left as they are', () => {
    const link = serverHtml(<Button asChild><a href="#details">Details</a></Button>);
    expect(link.hasAttribute('aria-disabled') || link.hasAttribute('data-hydrating')).toBe(false);
    expect(serverHtml(<Button progressive type="submit">Search</Button>).hasAttribute('disabled')).toBe(false);
    expect(serverHtml(<Input progressive name="q" />).hasAttribute('readonly')).toBe(false);
    const disabled = serverHtml(<Button type="submit" disabled>Send</Button>);
    expect(disabled.className).not.toContain('disabled:opacity-100');
  });
});

describe('after hydration', () => {
  it('the controls work, with nothing left marked', async () => {
    const onClick = vi.fn();
    const tree = (
      <div>
        <Button type="button" onClick={onClick}>Disconnect</Button>
        <Button type="submit">Send</Button>
        <Input name="email" />
      </div>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    expect(container.querySelectorAll('[data-hydrating]')).toHaveLength(3);
    await act(async () => {
      hydrateRoot(container, tree);
    });
    expect(container.querySelectorAll('[data-hydrating], [aria-disabled], [disabled], [readonly]')).toHaveLength(0);
    container.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    expect(onClick).toHaveBeenCalledOnce();
    container.remove();
  });
});
