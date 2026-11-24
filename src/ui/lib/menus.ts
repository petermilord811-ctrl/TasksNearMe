/**
 * Links caught by a page-wide click catch (the chat window's, the peeks') inside a Radix menu item. The catch prevents
 * the click so the page stays, and Radix skips its own select on a click that's already prevented: the menu would stay
 * open, and, being modal, keep the rest of the page hidden from assistive tech (2026-11-23: a conversation's View
 * profile). Escape closes it, as a person would; once it has gone (after its exit animation) it gives focus back to its
 * button, so whatever the link opens opens after that, or it would lose focus at once (a sheet beside the page closes
 * when focus leaves it).
 */

/** Closes the menu around a caught link, then runs `open` once the menu has gone; straight away when there's no menu. */
export function openAfterMenu(element: Element, open: () => void): void {
  const menu = element.closest('[role="menu"], [role="menubar"]');
  if (!menu) {
    open();
    return;
  }
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  const started = performance.now();
  const check = () => {
    // Its focus goes back to its button in a task after it unmounts: this one runs after that.
    if (!menu.isConnected || performance.now() - started > 1000) {
      window.setTimeout(open, 0);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}
