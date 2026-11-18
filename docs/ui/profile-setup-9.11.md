# A more comfortable profile setup (completion plan 9.11)

The owner (2026-11-18): "more comfortable profile setup method." The coordinator's brief: photo, headline, services and area in one continuous flow, with autosave, clear progress, and Back and Next that keep what was typed; an AI-written draft of the headline and bio when Claude is configured, and good templates when it isn't. Verification steps and their rules stay as they are (9.2 already took the phone out where texts don't go out).

## 1. Today

Helper setup is nine steps on nine pages: profile → services → area → phone → ID → home address → payouts → background check → done (`ONBOARDING_STEPS`, `src/modules/verification/progress.ts`). The first three are the profile, and they are where people give up:

- **Three separate forms**, each with its own Save and continue and a server round trip. Text typed and not yet saved is lost on Back, a reload or a tap on the stepper.
- **The wrong order for writing.** The headline and "about me" come first, before the services and the area that a good headline names. "Write it for me" then has nothing to draft from at first setup.
- **No photo.** The profile photo is only on the account page and the profile editor, after setup. Most new profiles go live as initials.
- **No help without Claude.** Without an AI key in production, "Write it for me" is hidden (`aiDraftingEnabled`), and the helper faces two empty boxes (10–80 and 40–1,000 characters).
- **Progress that scares.** The first page shows all nine steps, with the gift card and the checks, before a word is written.
- **Services as a dense form.** Each service is a fieldset with two selects, a price, minimum hours and a description. Prices start at the category minimum, which reads as a recommendation.

The audit's screenshots of a new helper (Priya, a draft profile) at 360 and 1280 are in `artifacts/ui-audit-2026-11-18/shots/draft/` (onboarding-profile, -services, -area, -phone, -identity).

Clients set up very little: a name at sign-up (18+ and the terms), then the app. Their photo is on the account page.

## 2. The new flow

The three profile steps become **one page, "Your helper profile", in three parts**, then the checks as before:

| Part | Asks for | Saved as |
|---|---|---|
| 1. What you do | Services: categories as chips; for each, fixed or hourly and a price, prefilled from the market's typical range; an optional note | `onSaveServices` (unchanged rules) |
| 2. Where you help | Neighborhood (with the map), radius as chips, remote help when a chosen service allows it; "Somewhere else in the US" (ZIP and city) | `onSaveArea` (unchanged rules) |
| 3. Introduce yourself | Photo (with the 9.3 adjust step), headline, about me, languages; a draft from Claude or an example from templates, built on parts 1 and 2; the helper agreement when it's needed | `onUploadPhoto`, `onSaveProfile` (unchanged rules) |

Then **Save and continue** goes where the server says (`redirectTo`): the ID check, or the phone step where texts go out.

**Why this order:** what you do and where are quick choices, and the headline and "about me" are easiest once those exist, so the draft and the examples can name them ("Furniture assembly and moving help in Duckpond"). The photo sits with the text it accompanies, beside a live preview of the card clients will see.

### Addresses

`/app/helper/onboarding/profile`, `/services` and `/area` all show the flow. `services` and `area` open their part; `profile` opens the first part not yet saved (a new helper starts at What you do), so notification links and the editor's links land on the right part. Moving between parts puts the part in the address's fragment (`#services`, `#area`, `#about`) and never changes its path, so a reload and the browser's Back and Forward land on the right part too. (Changing the path made the page start over after a save: a save refreshes the page for the current address, and another path is another page, which React starts fresh while keeping the old one hidden.) The steps after the profile keep their pages.

### Back and Next keep everything

- The three parts are one client form. Back never loses anything, saved or not.
- Every change is also kept in this tab (`sessionStorage`, not shared across accounts on a device), so a reload, or a page remount on the browser's Back, puts back what was typed. The draft is cleared once the profile is saved.
- Next checks the part (the same zod schemas as today), saves it if it changed, and moves on. A part that fails shows its errors in place; nothing moves.

### Autosave

- A part that is valid saves by itself a moment after typing stops (about 1.5 s), and on Next. A status line says **Saving…**, **Saved** or **Not saved yet: check the highlighted field**.
- Each part saves on its own (aa's sweep S3): its own pending autosave, which a change in another part or Next there never cancels, and its own status, so **Saved** speaks for the part on screen and only once what's on it is saved. **Save and continue** first sends what the other parts still have waiting, each save awaited, and stops on a part that can't save (it opens with its error) before the tab's drafts are cleared.
- Introduce yourself saves by itself only once the helper agreement is accepted (the server requires it for a first save in onboarding). Until then its text lives in the tab and goes up with Save and continue.
- Parts 1 and 2 can be saved before Introduce yourself: their save creates the draft helper profile when there is none yet (today only the profile save does). A draft profile is invisible to clients, as today.

### Clear progress

- Under the title: **Part 1 of 3**, a three-segment bar with the parts' names (a saved part is ticked, and a reached part can be tapped to go back to it), and one line saying what follows: **After this: a few checks so clients can book you.** The part's own card then names it (**What you do**).
- The flow shows its own three parts instead of the nine-step stepper. On the check steps, the stepper shows the profile as one **Profile** step (done once all three parts are), followed by the checks. The gift card and the checks ahead sit under the flow; the gift card strip keeps its place on the check steps.

### Drafting help

- **With Claude** (`profileDraft: 'ai'`, the `ai_drafting` flag on and a key set): **Write it for me** sends the helper's own notes; the server reads the services and area just saved and returns a headline and an "about me" (`src/integrations/ai/profile-writer.ts`, unchanged rules: their words only, no invented experience, no contact details, no prices). Undo puts back what was there.
- **Without Claude** (`profileDraft: 'template'`): **Start from an example** fills in one of three written examples (friendly, short, detailed), built from the first name, the chosen services and the area, in the page's language. **Another example** cycles. They are clearly examples to edit, never presented as AI.
- Either way nothing is saved until the helper saves.

### The live preview

Beside Introduce yourself on desktop (sticky), and behind **See how clients see you** on phones: the helper card as clients see it in search and on offers, updating as the helper types (photo or initials, name, headline, area, services with prices).

## 3. Screens

Phone (360), part 1 (the amounts are placeholders; the real ones come from each market's price guidance):

```
Your helper profile
Part 1 of 3 · What you do        ▰▱▱
Next: a few checks so clients can book you

[ Furniture assembly ✓ ] [ Moving help ✓ ]
[ Yard cleanup ] [ Light cleaning ] [ Computer help ]

Furniture assembly · Typical $50–$80 per item
  ( Fixed price ● | Hourly )   From [ $50.00 ]
  + Add a note (optional)
Moving help · Typical $35–$50 per hour
  ( Fixed price | Hourly ● )   [ $35.00 ] /h · at least [ 2 ] h
  Needs a background check

Saved ✓
[ Back ]                       [ Next: Where you help ]   ← sticky
```

Desktop (1280): the parts nav above a wider card, the buttons inline instead of the phone's sticky bar, and on Introduce yourself the live card in a column on the right.

## 4. What changes

| Layer | Change |
|---|---|
| Contracts (`src/contracts/onboarding.ts`) | `HelperOnboardingPageData`: `person` (first name, display name, initials, photo), `maxPhotoMegabytes`, `serviceDefaults` (the prefilled pricing per category, from the market's guidance) and `profileDraft: 'ai' \| 'template'`. `HelperOnboardingHandlers`: `onUploadPhoto`, `onRemovePhoto`. The editor's data gets `profileDraft` too. `aiDraftingEnabled` stays for older callers |
| Fixtures (`src/fixtures/onboarding.ts`) | A new helper (nothing saved), services saved, services and area saved, everything but the agreement, a photo set, drafting with Claude and with templates, a ZIP elsewhere (waiting for a city), a validation error and a failed save |
| Server | `saveHelperServices` and `saveHelperArea` create the draft profile when there is none. `getOnboardingPageData` fills the new fields. The page passes the photo handlers |
| UI (`src/ui/screens/helper`) | `profile-setup.tsx` (the flow and its three parts), a grouped stepper, the live card; `HelperOnboardingScreen` shows the flow for the three profile steps. The editor keeps its sections and gets the examples when Claude isn't there |
| Copy | `helperOnboarding.setup.*` in English and Spanish, including the examples |
| Tests | Unit: part order and starting part, the examples, autosave rules, the draft profile created by a first services save. e2e (both projects): a new helper goes through the three parts with Back and Next, a reload keeps the text, the photo and an example are used, and Save and continue reaches the next check |

**The profile editor** (`/app/helper/profile`, audit H7: 10,800 px on a phone with every form open): one section at a time on every screen, chosen from the section list on phones and the tabs on desktop, with every form kept mounted so switching keeps what was typed; once every check is done and the gift card is earned, one "All your checks are done" line replaces the card and the checklist. It also gets the written examples when Claude isn't set up.

Not changing: the verification steps and their order and locks, what makes a helper bookable, the profile's validation rules.

## 5. Clients

Clients keep their short setup: a name at sign-up, then the app. Their photo gets the same adjust step on the account page (9.3). A nudge to add one belongs on the dashboard (9.9), for people without a photo; suggested to its owner rather than built here.
