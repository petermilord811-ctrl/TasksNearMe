# Service photo credits

The photos of people doing each category's work (plan 9.12) on the landing's service cards, the category pages and the cost guides. The code's copy of this list, with the alt text in English and Spanish, is `src/shared/service-photos.ts`; its test fails if a photo lacks a credit, an alt text or a file.

All ten were downloaded and their licenses checked on 2026-11-18.

## Licenses

- **Pexels License** (https://www.pexels.com/license/): free to use, commercial use included; attribution not required; modifying is allowed. Not allowed: showing identifiable people in a bad light or in an offensive way, implying that the people or brands in the picture endorse a product, selling unaltered copies, or redistributing them on other stock-photo or wallpaper sites.
- **Unsplash License** (https://unsplash.com/license): free for commercial and non-commercial use without permission; attribution appreciated, not required. Not allowed: selling images without significant modification, or compiling Unsplash images to replicate a similar or competing service.

Neither license includes a model release, and we have none. So we follow the conditions above:

- **No implied endorsement.** No caption, quote, name, badge or rating next to a photo, and no alt text that calls the people helpers or clients, names the company, or places them in one of our cities. The alt text says only what is in the picture.
- **Nobody in a bad light.** The photos show ordinary work done well, and stay away from complaints, safety warnings, disputes or anything negative.
- **No visible brand logos.** Checked at full size before choosing. Photos with readable logos on tools, vehicles or clothes were passed over.
- **Adults only doing the work**, since helpers are adults.

## What we changed

Each photo was cropped to 16:9, 4:3 and 1:1, resized (640, 1024 and 1600 px wide; squares stop at 1024), converted to WebP, and stripped of its metadata (`scripts/service-photos.mjs`). One was also brightened: the furniture-assembly primary, shot in grey window light, gets an exposure curve and a little warmth (its `exposure` in the script; the owner's ask on 2026-11-22). Nothing else was edited. The full-size originals aren't kept in the repo.

## Photos

| File (`public/ui/services/…`) | Category, use | What it shows | Photographer | Source | License |
|---|---|---|---|---|---|
| `furniture-assembly-coffee-table-*` | Furniture assembly, primary (brightened) | A man tightens a coffee table's frame while a woman sorts the hardware, moving boxes behind them | [cottonbro studio](https://www.pexels.com/@cottonbro/) | [Pexels 4554425](https://www.pexels.com/photo/woman-in-white-long-sleeve-shirt-and-black-pants-sitting-on-floor-4554425/) | Pexels License |
| `furniture-assembly-crib-*` | Furniture assembly, alternate | A man kneels beside a half-built white crib, reaching into a toolbox | [MART PRODUCTION](https://www.pexels.com/@mart-production/) | [Pexels 7491337](https://www.pexels.com/photo/a-man-in-a-white-shirt-building-a-crib-7491337/) | Pexels License |
| `moving-help-carrying-boxes-*` | Moving help, primary | Two men carry moving boxes across a bright, empty room | [RDNE Stock project](https://www.pexels.com/@rdne/) | [Pexels 7464232](https://www.pexels.com/photo/men-carrying-boxes-inside-the-house-7464232/) | Pexels License |
| `moving-help-boxes-out-the-door-*` | Moving help, alternate | A man and a woman carry boxes out the front door of a house | [Ketut Subiyanto](https://www.pexels.com/@ketut-subiyanto/) | [Pexels 4246267](https://www.pexels.com/photo/couple-carrying-carton-boxes-while-moving-out-of-old-home-4246267/) | Pexels License |
| `yard-cleanup-weeding-garden-bed-*` | Yard cleanup, primary | A woman in overalls pulls weeds from a garden bed beside a house, her dog watching | [Greta Hoffman](https://www.pexels.com/@greta-hoffman/) | [Pexels 7728042](https://www.pexels.com/photo/female-gardener-with-dog-in-yard-7728042/) | Pexels License |
| `yard-cleanup-pruning-shrubs-*` | Yard cleanup, alternate | A man in a sun hat trims a flowering shrub with hand pruners | [el jusuf](https://www.pexels.com/@pamanjoe/) | [Pexels 40582860](https://www.pexels.com/photo/gardener-pruning-bushes-in-lush-garden-40582860/) | Pexels License |
| `light-cleaning-wiping-counter-*` | Light cleaning, primary | A man sprays and wipes down a kitchen counter | [RDNE Stock project](https://www.pexels.com/@rdne/) | [Pexels 5591854](https://www.pexels.com/photo/a-man-wiping-a-kitchen-counter-5591854/) | Pexels License |
| `light-cleaning-caddy-on-stairs-*` | Light cleaning, alternate | A woman carries a caddy of cleaning supplies and a broom up the stairs | [Josue Michel](https://unsplash.com/@josuemichelphotography) | [Unsplash FhsFUo-Wfc0](https://unsplash.com/photos/woman-cleaning-stairs-in-home-FhsFUo-Wfc0) | Unsplash License |
| `computer-help-laptop-together-*` | Computer help, primary | A young woman works on a laptop while explaining each step to an older man | [Kampus Production](https://www.pexels.com/@kampus/) | [Pexels 7551644](https://www.pexels.com/photo/a-man-and-a-woman-using-a-laptop-together-7551644/) | Pexels License |
| `computer-help-laptop-walkthrough-*` | Computer help, alternate | A young man points to notes beside a laptop while an older man follows along | [Kampus Production](https://www.pexels.com/@kampus/) | [Pexels 7551628](https://www.pexels.com/photo/men-having-conversation-7551628/) | Pexels License |

## Adding or replacing a photo

1. Pick a photo under one of the two licenses above (on Unsplash, not an Unsplash+ one). Check it at full size for logos, and check that it shows the category's actual scope: yard cleanup is ground-level hand work, not mowing or power tools.
2. Download it at 3200 px wide into its own new, empty folder named after the photo (`<dir>/<name>/image.jpg`).
3. Add it to `PHOTOS` in `scripts/service-photos.mjs` with a focus for each crop (and an `exposure` only if it's too dark), then run `node scripts/service-photos.mjs --sources <dir> --only <name>`. It rewrites that photo's files and its entry in `src/shared/service-photo-placeholders.ts`, leaving the others alone. To compare crops first, add `--out <scratch dir> --sheet <file.jpg>`.
4. Add the entry, its alt text in both languages and its credit to `src/shared/service-photos.ts`, and a row here. Run `npx vitest run src/shared/service-photos.test.ts`.
