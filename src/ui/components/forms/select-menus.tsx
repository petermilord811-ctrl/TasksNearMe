'use client';

import { useEffect } from 'react';
import { startSelectMenus } from './select-menu-engine';
import './select-menus.css';

/**
 * Branded dropdown lists for every <select> (owner, 2026-11-25: "dropdown item is classic one, you didn't
 * customize"), mounted once in the root layout. The CSS styles the browser's own list where it can
 * (`appearance: base-select`); the engine draws one in the same look elsewhere, for a mouse (select-menus.css).
 */
export function SelectMenus() {
  useEffect(() => startSelectMenus(), []);
  return null;
}
