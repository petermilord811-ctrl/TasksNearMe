# UI-036 — The landing page, v2: smart motion, a live map of nearby tasks, and the tasksnearme brand

**Status:** ready for Codex · **Branch:** `ui/UI-036-landing-v2-motion-map` (starts from `ui/UI-035-brand-and-landing-page`, which already has a first brand and landing page) · **Plan first:** no (unattended) · **Depends on:** UI-035's work on this branch

## Goal
The owner reviewed the first landing page (UI-035) and wants something far more alive. Build a **new landing page** for **tasksnearme** that is:
1. **Animated, but smart (the most important point).** Motion explains and guides; nothing moves without a reason; it feels calm, fast and premium, never busy.
2. **Modern and colorful,** with **special landing-page fonts**.
3. **Active.** Elements respond to the cursor *and to each other*, so the page feels connected and responsive.
4. **Built around a map** of tasks near the visitor (by their location). It's not full-width (mid-size or small), it's useful, and its edges melt into the background so it doesn't stand out as a box.
5. **Branded.** Design a new **logo** for tasksnearme.

You own the design, the motion system, the canvas, the structure and the architecture. Build all of it. UI-035's brand, illustrations, sections and tests on this branch are yours to reuse, rework or replace; the new direction below wins where they differ.

## The owner's references (look at every one)
They are in `artifacts/ui-favorite-themes/` in this worktree (git-ignored; open the PNGs). Take the *qualities* named here, not the content. Make something original for tasksnearme.

| File | What the owner likes in it |
|---|---|
| `preferred-theme.png` | **The first feeling and the colors.** Soft, warm, light background (a pale marble/cream texture), crisp near-black text, lots of air, a centered editorial hero with a small colored eyebrow line, a single vivid **orange pill** call to action, and rich imagery bleeding in from one edge. Calm and premium. |
| `active-theme.png` | **Active-looking elements.** A huge bold display headline with one word in a vivid **violet**; floating cards with soft shadows scattered around the hero at different depths and angles (they feel alive, as if they drift and react); a round "Browse all works ↓" pill; "SCROLL" hint; a pill search with a ⌘K hint. |
| `modern-color-theme-change.png` | **The color theme.** Iridescent gradients (coral → magenta → violet → periwinkle blue) behind **frosted-glass** panels (blur, soft white edges, gentle inner light); the same panel works on a light and on a vivid background. |
| `amazing canvas.png` (+ `Snipaste_…png`, same site) | **A canvas at a normal, unhurried speed** that makes the hero feel special (here: a dark scene with a slowly turning textured cube and a soft light sweep). **Make a different one** that fits tasksnearme. |
| `favorite topbar.png` | **The top bar.** A floating, centered **glass pill** over the content: logo, a thin divider, plain links, a small light/dark switch, and a white pill call to action. |
| `anim.mp4` (frames in `anim-frames/`) | **The animation language** (ignore that it's a phone): content **blooms from a point** and settles; elements **fade + blur in + rise slightly**, staggered; a **pill morphs** into a larger panel (and back); a card **grows out of** the element that triggered it; text arrives line by line through a **mask**; a soft **iridescent light** lives in the background; everything eases with gentle, physical springs (no bounce, no lag). See `entry-reveal.png`, `card-expand.png`, `loading-morph.png`, and the two overview sheets. |

## Direction (a synthesis; refine it)
- **Base:** soft, warm, light (cream, warm off-white, near-black ink), like `preferred-theme`. A dark mode that feels designed, not inverted.
- **Color:** one confident warm primary for actions (a vivid orange/coral family; make it pass contrast as text-on-button, e.g. a deeper shade or dark text), plus an **iridescent accent gradient** (coral → magenta → violet → periwinkle) used sparingly: glows, the canvas, the map pins, highlights, focus rings. One vivid word in the hero headline, as in `active-theme`. Each category gets its own color from the gradient family (used on chips, pins, card accents).
- **Type:** a **special display face for the landing page** (big, characterful, modern; a variable font if you can, so weight and width can animate subtly), an elegant accent (for example an italic serif for one or two words), and a highly legible body face. Load landing-only fonts only on public pages (`next/font`, subset, `display: swap`). Two to three families at most.
- **Surfaces:** frosted glass for floating UI (top bar, map cards, floating task cards), soft layered shadows, large radii, hairline borders with light.
- **The logo:** design **tasksnearme** (the owner writes it as one lowercase word; a lowercase wordmark is welcome) with a mark that works at 16 px (ideas: a location ring or pin merged with a check or a spark; a "near" radius ripple). It draws itself in once on first load. Deliver `public/ui/brand/{logo.svg,mark.svg,icon.svg}` (Claude wires the favicon from `icon.svg`).

## The page (order is yours; this is the content)
1. **Top bar:** the glass pill (logo, How it works, Become a helper, Pricing, the light/dark switch, Sign in, **Post a task**). It condenses on scroll and hides on scroll down and returns on scroll up; it never covers content you need.
2. **Hero:** the headline (text revealed through a mask, line by line, with one vivid word), a short line, **Post a task** (primary) and **Become a helper**, and a smart "what do you need?" pill that cycles real examples from the categories ("assemble a desk", "rake leaves", "set up a laptop") and links to posting. Around it, floating task and helper cards (real data: `recentTasks`, `featuredHelpers`) at different depths that react to the cursor (parallax, slight tilt) and to each other. Behind it, **your canvas** (below).
3. **The map: tasks near you** (the centerpiece below the hero): see "The map".
4. **What people book:** the categories with real price guidance. Hovering or focusing one highlights its pins on the map and its tasks in the list, and tints the canvas.
5. **How it works:** three steps that animate as they enter (like the video's blooming cards).
6. **Pricing you can see:** `feeExample` exactly as supplied ($60 task → the client pays $66.00, the helper earns $54.00). Numbers may count up as they appear, but must land on the supplied values (screen readers get only the final values; no money math).
7. **Trust and safety:** ID-verified helpers, background checks for in-home work, the address shared only with the booked helper, paying through the platform, two-sided reviews.
8. **For helpers:** your prices, your schedule, repeat clients; the founding reward when `welcomeReward` is present.
9. **FAQ** and a closing call to action; the footer.

**Honesty rules:** every number comes from `HomePageData`. No invented ratings, review counts, user counts, testimonials, press logos, or photos of people.

## The map
- `HomePageData.map` (`src/contracts/marketing.ts`): `center`, `serviceRadiusMiles`, `styleUrl` (a MapLibre style; OpenFreeMap in development, no key), `attribution`, and `pins` (up to 60 open in-person tasks, each with its **public point**, already moved 300–800 m from the real place, and `radiusMeters`).
- Use **MapLibre GL JS** (`npm install maplibre-gl`). Load it **lazily** when the section approaches the viewport (dynamic import, CSS included), with a light placeholder before it. Restyle the base map at runtime to the brand: soft land, quiet roads, muted labels, water in a pale tint, so it sits *in* the page.
- **Size and edges:** mid-size or small, never full-bleed. Large rounded shape with **edges that fade into the background** (for example a CSS `mask-image` gradient on the edges, or a soft vignette in the page color); no hard border box. It must look good in light and dark.
- **Pins:** soft glowing dots in the category's color, each with a faint area circle (`radiusMeters`); never a precise marker or an address. Cluster when zoomed out. Hover or focus shows a small glass card (title, category, area, price, when) that **grows out of the pin**; it links to `routes.publicTask(slug)`.
- **Near you:** a **Use my location** button (geolocation only when pressed; explain that the location stays on the device). With it, the map eases to the visitor, shows a "you" dot, and the list beside the map sorts by distance (`distanceMiles` and `roundMiles` from `@/shared/geo`; labels like "0.4 mi"). Outside `serviceRadiusMiles` of `center`: "We're not in your area yet" with `routes.waitlist()`. Without location: Austin's view with the newest tasks.
- **Sync:** the map and the list beside it share one state: hovering or focusing a list item lifts its pin and eases the map to it; hovering a pin highlights its item; picking a category filters both.
- **Accessibility:** the list is the accessible version (real links, keyboard order, the same content). The map canvas is `aria-hidden`, with a short visible caption. The attribution stays visible (required).
- **Previews and tests:** add `mapMode: 'interactive' | 'static'` (default `interactive`). `static` draws a stylized map from the pins (SVG, no network, no WebGL); previews and unit tests use it.

## The canvas
Design your own hero canvas: the idea of **tasks near me** as a calm, living picture, at a normal speed (for example soft iridescent light, points of tasks and helpers in a neighborhood that gently find each other, and light that follows the cursor). It's different from the reference's cube, and it isn't a particle storm.
- `requestAnimationFrame` with a time step; **pauses** when off-screen (IntersectionObserver) or when the tab is hidden; device pixel ratio capped at 2; no allocations per frame; about 2 ms of work per frame on a laptop; it stays smooth at 60 fps.
- **Reduced motion:** one beautiful still frame. A small **pause/play** control (WCAG 2.2.2), remembered for the visit.
- If canvas or WebGL is unavailable, a still gradient that looks intended.

## Motion: smart, not busy
- **One motion system** in `src/ui/motion/`: tokens (durations, easings, springs) in one file and as CSS variables, plus small primitives: entrance reveal (fade + blur + rise), staggered groups, mask text (line by line), a "bloom from a point" transition (the video's card growing from its trigger), a pill that morphs into a panel, magnetic buttons, press feedback (a quick scale and a soft glow), a pointer spotlight for cards, and a count-up for supplied numbers. Use `motion` (`npm install motion`, `motion/react`) or CSS where CSS is enough; keep it small.
- **Choreography:** one leading motion at a time. Entrances run once per element. Durations 150–700 ms. Animate `transform`, `opacity` and `filter` only; no layout shift (reserve space).
- **Cursor and collaboration:** a shared landing state (React context) for `activeCategory`, the highlighted task, the visitor's location, and a rAF-throttled pointer. The hero cards, the canvas, the categories, the map and the list all read it, so one action is reflected everywhere. No `mousemove` work outside requestAnimationFrame.
- **Accessibility:** `prefers-reduced-motion` gives final states instantly (no parallax, tilt, magnetism or count-up). Everything works with the keyboard; focus is always visible (the iridescent ring). No information only in motion. Content and calls to action are present without JavaScript (server-rendered), so motion only enhances.
- **Performance:** the hero text is the LCP (no heavy image above the fold). Landing-only client code is split from the rest of the app; MapLibre loads only near the map. No console errors.

## Architecture (where things go)
- `src/ui/motion/*`: tokens and primitives (reusable by the app later).
- `src/ui/landing/*`: the landing page's sections, the shared landing state (`LandingProvider`), the top bar, `HeroCanvas` (a pure TypeScript engine in `canvas/` plus a thin React wrapper), `TaskMap` (`map/`: the lazy MapLibre view, the brand restyle, the static variant), the nearby list.
- `HomeScreen` (`src/ui/screens/public/home-screen.tsx`) keeps its props (`data: HomePageData`, `now`), plus an optional `mapMode` for previews. The route doesn't change.
- Theme: the new palette in `src/ui/theme/globals.css` (light and dark), landing fonts in `src/ui/theme/fonts.ts`. A light/dark switch needs class-based dark mode; provide `src/ui/theme/theme-script.ts` (an inline script string that sets the class before paint from `localStorage`, defaulting to the system) and Claude adds it to the root layout. Keep the existing dark behavior working until then.
- The rest of the app keeps working with the new tokens: look at every preview, fix contrast and anything the new palette breaks.

## You may edit
`src/ui/**`, `messages/en/ui/**`, `public/ui/**`, `components.json`, `package.json`/`package-lock.json` (only by `npm install`, for `motion` and `maplibre-gl`), and `docs/ui/handoffs/UI-036.md` (last step).

## Read first
- `AGENTS.md`; `docs/ui/design-system.md` (rewrite its brand and motion sections to match what you build)
- `docs/blueprint/01-product-brief.md` (who it's for, what's true)
- Contracts: `src/contracts/marketing.ts` (`HomePageData`, `LandingMapData`, `TaskMapPin`), `money.ts`, `routes.ts` (`app.newTask`, `taskBoard`, `publicTask`, `howItWorks`, `becomeAHelper`, `pricing`, `trustAndSafety`, `waitlist`, `signIn`); `src/shared/geo.ts`.
- Fixtures: `src/fixtures/marketing.ts` (`homePageData` with `map: austinLandingMap` and 14 pins, `homeNoRewardData`, `homeEmptyMapData`).

## States to preview
| Preview id | Fixture(s) | What it shows |
|---|---|---|
| `screen-home/{default,no-reward,empty-map}` | `homePageData`, `homeNoRewardData`, `homeEmptyMapData` (`mapMode: 'static'`) | The landing page |
| `screen-home/dark` | `homePageData`, dark | The landing page in dark mode |
| `component-landing-map/{default,near-you,outside-area,category}` | `austinLandingMap` (`static`, with a preset location and category) | The map and its list in each state |
| `component-brand/{logo,mark,palette,type,motion}` | — | The logo (light and dark), the mark at 16, 32 and 64 px, swatches with token names, the type scale, and the motion tokens |
| every existing preview | as before | Still renders, axe clean, with the new tokens |

The preview harness runs with **reduced motion** (Claude set it in `playwright.config.ts`), so previews show final states: make sure the reduced-motion version of every section is complete and beautiful.

## Tests
- The landing page renders every section from `homePageData`, hides the reward without `welcomeReward`, and shows the fee example's numbers exactly as supplied.
- The map list sorts by distance from a given location and shows the "not in your area" state outside the radius; a pin card links with `routes.publicTask`; no address text ever renders.
- With reduced motion, primitives render final states (no transforms, no count-up).
- The canvas engine: pause and resume, and no work while hidden (unit-test the pure engine with a fake clock).
- One `h1`; links use the route builders.

## Acceptance
- Every section, the map, the canvas, the motion system, the top bar and the logo exist, with every **State to preview** registered.
- `npm run check:ui` passes: all previews at 360 and 1280, axe clean, no runtime errors, no LCP warnings.
- At 360, 768, 1280 and 1440 px the page looks like a premium product site; no horizontal scroll; the map is mid-size with soft edges.
- Motion is smooth (transform/opacity), purposeful, and fully reduced under `prefers-reduced-motion`; the canvas pauses off-screen and has a pause control.
- No imports outside the allowed areas (lint). No routes built by hand, no hard-coded strings, no money math, no invented numbers.
- The handoff includes: the palette (token → hex, light and dark), the fonts, the logo idea, the motion tokens, the architecture, and which screenshots to look at first.
- **Last step:** the summary (AGENTS.md format) is written to `docs/ui/handoffs/UI-036.md`.

## Out of scope
- New routes or data beyond `HomePageData` (ask in contract requests), photos of people, a CMS, the signed-in app's layouts (they change only through tokens).

## Claude wiring notes (filled in by Claude after review)
- `/` already passes `getHomePageData()` (with `map`). Claude adds the theme script to the root layout and the favicon from `public/ui/brand/icon.svg`, and updates the public-pages e2e.
