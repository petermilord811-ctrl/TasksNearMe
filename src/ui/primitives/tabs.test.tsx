/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

describe('TabsContent (accessibility pass, WCAG 2.4.7)', () => {
  it('is a Tab stop that shows where focus is', () => {
    render(<Tabs defaultValue="a"><TabsList><TabsTrigger value="a">A</TabsTrigger></TabsList><TabsContent value="a">Panel</TabsContent></Tabs>);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(panel.className).toMatch(/focus-visible:outline-2/);
    expect(panel.className).not.toMatch(/(^|\s)outline-none(\s|$)/);
  });
});
