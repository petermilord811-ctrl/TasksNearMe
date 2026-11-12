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
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    const watch = (scope: ParentNode) => scope.querySelectorAll(REVEAL).forEach((element) => observer.observe(element));
    watch(document);
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
      if (root.dataset.motion === 'on') root.dataset.motion = 'ready';
    };
  }, []);
  return null;
}
