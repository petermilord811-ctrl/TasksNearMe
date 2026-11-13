import type { MetadataRoute } from 'next';

/**
 * The installable app (completion plan 3.6): phones and desktops can add TasksNearMe to the home screen and
 * open it in its own window, straight into the app. On iPhones, web push only works from an app added to the
 * Home Screen, so this is also what makes push possible there. Icons are in public/icons (the brand mark: the
 * rounded tile for "any", full bleed with a safe zone for "maskable").
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'TasksNearMe',
    short_name: 'TasksNearMe',
    description: 'Book trusted local help for everyday tasks in Austin.',
    lang: 'en-US',
    dir: 'ltr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#FBF7F2',
    theme_color: '#FBF7F2',
    categories: ['lifestyle', 'productivity', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Post a task', short_name: 'Post', url: '/app/tasks/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Find work', short_name: 'Find work', url: '/app/find-work', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Messages', short_name: 'Messages', url: '/app/messages', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
