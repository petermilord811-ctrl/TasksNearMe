'use client';

import { useEffect } from 'react';

const REVEAL = '[data-reveal]:not([data-revealed])';

/**
 * Turns on scroll reveals for the page it's mounted on. Before this runs (no JavaScript, or still
 * hydrating) every [data-reveal] element is visible. On mount, anything already on screen is marked
 * revealed first (no flash), then `data-motion="on"` lets the rest start hidden until it scrolls in.
 * Under reduced motion it does nothing. On unmount the document goes back to "ready".
 */
export function MotionRoot() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.motion === 'off' || !('IntersectionObserver' in window)) return;

    const reveal = (element: Element) => element.setAttribute('data-revealed', '');
    const fold = window.innerHeight * 0.92;
    for (const element of document.querySelectorAll(REVEAL)) {
      if (element.getBoundingClientRect().top < fold) reveal(element);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      },
      // A quarter-screen ahead: a section is already showing when it arrives, after a fling or a jump too (audit M7).
      { rootMargin: '0px 0px 25% 0px', threshold: 0 },
    );
    const watch = (scope: ParentNode) => scope.querySelectorAll(REVEAL).forEach((element) => observer.observe(element));
    watch(document);
    // Whatever a fling or a jump (the footer's "On this page", find in page) carried past shows at once when the
    // scroll settles, so going back up never lands on blank paper (audit M7).
    const revealPassed = () => {
      for (const element of document.querySelectorAll(REVEAL)) {
        if (element.getBoundingClientRect().bottom > 0) continue;
        reveal(element);
        observer.unobserve(element);
      }
    };
    window.addEventListener('scrollend', revealPassed, { passive: true });
    // Client islands that mount later (the map, lists) bring their own reveals.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(REVEAL)) observer.observe(node);
          watch(node);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    root.dataset.motion = 'on';

    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('scrollend', revealPassed);
      if (root.dataset.motion === 'on') root.dataset.motion = 'ready';
    };
  }, []);
  return null;
}
