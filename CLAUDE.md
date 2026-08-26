# Vigil

A single-file mobile web app for reading the Bible in the dark. Built for OLED
iPhone screens, added to the home screen, read at night.

## Design intent

The brief was "a truly dark mode" — so the background is pure `#000000`, with no
panels, gradients, or elevated surfaces. Text is warm parchment rather than
white, and both its brightness and its warmth are user-tunable so it can be
dialled down to near-candlelight.

**Dark is the priority and the default.** A light mode was added 2026-08-26,
and it is the same manuscript read by daylight rather than a second product:
the ground is vellum and the ink is iron-gall brown-black — never `#fff`, never
`#000`. The page tops out at 97% lightness because a pure-white page at night
is the thing this app exists to avoid. If light mode ever reads as "white
theme", it has drifted.

The two knobs keep their meaning across themes rather than inverting. In the
dark, Brightness says how far the INK lifts off the page; in the light it says
how much light the PAGE gives off. Dialling down still means "less light in
the room" either way. Warmth tints both, but the light ground applies it at
`W*0.9` against dark's `W*0.55`, because a light ground perceptually
desaturates and matching the numbers makes vellum read as grey.

The visual reference is a monk's psalter read by candle, not a productivity app:
a gilt chapter numeral set as a drop cap, verse numbers hung small and gold,
uppercase letterspaced headings. Keep that direction. If a change would make it
look like a generic reading app, it's wrong.

The chrome dissolves entirely after ~2.8s or on scroll-down, and returns on
scroll-up or a tap. Text masks into black at the top and bottom edges rather
than hitting a hard cut. **The reading surface is the product; UI is a guest.**

## Architecture

`index.html` holds the entire app — all markup, style and logic. No build
step, no framework, no dependencies, nothing fetched from a CDN. The body
typeface is a system stack (Iowan Old Style / Charter / Palatino) so nothing
is downloaded and it renders instantly.

Alongside it sit the PWA sidecars, which are the only other files served:
`manifest.webmanifest`, `sw.js`, and four PNG icons. They exist because a
home-screen app cannot be a single file — the browser demands a manifest and
a worker at their own URLs. Everything still hand-edits; there is nothing to
compile.

Storage is real and on-device: `localStorage` (namespaced `vigil:`) for
settings, last position and the offline index, IndexedDB for downloaded
books. The origin is shared with every other GitHub Pages project on the
account, hence the namespace.

**Colour goes through tokens, never literals.** The stylesheet names 20 custom
properties — `--void`, `--ink*`, `--gilt*`, `--ash`, plus surface tones
(`--surface`, `--wash`, `--line`, `--track`, `--press`, `--scrim`, `--woc`) —
and `applyLook()` writes every one of them per theme. There is no second
stylesheet and no `prefers-color-scheme` block in the CSS: a theme is a set of
values. If you add a colour, add a token and set it in BOTH branches, or light
mode will silently inherit a dark tone.

Roughly in order, the file contains: `Store` (persistence), `BOOKS` (the canon
with chapter counts), the two source adapters, `Builder` (the normaliser),
`renderChapter`, chrome/immersion logic, the sheets, offline download, input
handling, boot.

### The block contract

Both data sources normalise into one structure, so a single renderer serves
them and every setting works identically regardless of translation:

```js
{ blocks: [ { kind: 'heading'|'sub'|'p'|'poem', indent, runs: [{ t, v, woc }] } ],
  bookName, chapters,
  credit: { name, note, url } }
```

`Builder` enforces this. If you add a third source, write an adapter that emits
this shape — do not add a second rendering path.

## Data sources

**HelloAO** (`bible.helloao.org`) is the default and needs no key.

- `/api/available_translations.json` — populates the picker, filtered to English
- `/api/{translation}/{book}/{chapter}.json` — chapter text
- Book ids are USFM (`GEN`, `PSA`, `JHN`)

Their chapter format is not flat verse strings. It is a content array mixing
headings, line breaks, poetry with indent levels, Hebrew subtitles,
words-of-Jesus flags, and footnote refs. `fetchAO` walks it. Footnote refs are
deliberately dropped.

Avoid the `complete.json` whole-Bible endpoint: multi-megabyte parse on a phone,
no progress feedback, and it exceeds per-key storage limits. Per-book chapter
loops with a counter are slower but survive a flaky connection.

**Crossway ESV** (`api.esv.org/v3/passage/text/`) requires the user's own key,
entered at runtime and stored on-device. It is never in the source.

`parseESV` converts the plain-text response. It measures the shallowest
verse-bearing line and treats that as the indent baseline, because ESV's
paragraph indent is a server-side setting and prose can arrive pre-indented —
without the baseline pass, ordinary prose gets misread as poetry.

**But the baseline is only trusted when nothing sits deeper** (fixed
2026-08-26, on first contact with the live API). In a psalm the shallowest
verse line is poetry, not prose, so taking it as zero flattened every
level-1 poetic line to a paragraph and left only its continuations as verse.
Psalm 23 came back as alternating prose and poetry with "He leads me in paths
of righteousness" promoted to a *heading*. If a passage has any line deeper
than that baseline, it is poetry and the indents are absolute.

Two more things the live API taught us, neither guessable from the docs:

- **A verse's opening indent lives AFTER the marker.** ESV keeps the marker
  in the margin and pushes the line out with spaces following it — `[2]   He
  makes` is a level deeper than `[1] The LORD`. `body.trim()` and the
  whitespace collapse destroy it, so the pad width is measured first.
- **Headings are not distinguished by indent.** ESV sets Psalm 119's Hebrew
  letters at the *same* indent as the poetry they head (only `Aleph` is at
  zero; the other 21 sit at 2). Heading detection therefore keys on a line
  standing alone between blank lines, which is exact: 23 framed lines in
  Psalm 119, 2 in Psalm 23, 5 in John 1, and never a poetic line.

## Licensing constraints — do not "simplify" these away

- **ESV text is copyrighted.** It may only be fetched live with the user's key.
  It must not be bundled, cached to disk, or included in an offline download.
  The offline button is deliberately disabled on ESV.
- **BSB and the other HelloAO translations are public domain**, which is what
  makes offline download legal there.
- The colophon at the end of each chapter carries the required attribution.
  Crossway's terms require their notice and a link to esv.org on any page
  showing ESV text. Leave it in.

## Known constraints

- Opening from `file://` gives the page a `null` origin, and WebKit blocks
  network requests from it. The app renders but no text loads. It must be
  served over http(s). This surprised the user once already.
- Wake Lock requires a secure context, so it is dead over plain `http://` on a
  LAN address. `https://` or `localhost` only.
- Deployment target is GitHub Pages at a **subpath** (`/vigil/`), which matters
  for service worker scope.

## Priorities

1. ~~Replace the `Store` adapter.~~ **Done 2026-08-26.** `localStorage` for
   settings/position/offline index, IndexedDB for downloaded books, routed by
   the `bk:` key prefix. A quota failure aborts the IDB transaction, which
   surfaces as `set()` returning `false` so the "too large to store" toast
   still fires. `Store.backed` probes localStorage with a real write, because
   Safari private mode exposes the object but throws on `setItem`.
2. ~~PWA files.~~ **Done 2026-08-26.** Manifest, four icons, and a service
   worker that precaches the shell. All paths are relative so one build serves
   both `/` locally and `/vigil/` on Pages.
3. ~~Full-text search.~~ **Done 2026-08-26.** Over the books saved for
   offline reading — no index, a linear scan of a flattened corpus built on
   first search and cached per translation. Measured at 10-15ms per query
   over a whole-Bible-scale corpus (31,102 verses, 2.3MB) on desktop JSC, so
   an inverted index would have bought nothing but a second persisted
   structure to keep in sync. Quoted queries are phrases, bare words are
   ANDed, results cap at 300. A hit opens the chapter and lands on the verse.
4. **ESV, now that there is a key to test with** — see the note below.

## ESV: the API v3 terms, and what they mean here

Recorded 2026-08-26 from the Crossway application form, when a key finally
existed to test with. The seven guidelines, and where each lands:

| Guideline | Where Vigil stands |
|---|---|
| Copyright citation as outlined by Crossway | Colophon carries their notice verbatim + link to esv.org. **Unverified** against their citation page — check the exact wording. |
| Strictly noncommercial | Fine. Free, no ads, no sale. |
| ≤500 verses per query, or half a book, whichever is less (single-chapter books excepted) | Fine. One chapter per query; the longest is Psalm 119 at 176 verses. Two-chapter books hit exactly half, which is allowed; single-chapter books are exempt by the rule's own wording. |
| 5,000 queries/day, ≤1,000/hour, ≤60/minute | Fine with headroom. Steady reading costs ~1 request per chapter turn once `prefetchNeighbours` is warm. 5,000/day is the whole Bible four times over. Only sustained fast flicking (>20 turns/min) could approach 60/min. |
| **May not locally store more than 500 consecutive verses or one-half of any book, whichever is less** | We store **nothing**. See below. |
| Redistribution ≤500 verses, <50% of a book, <50% of the containing work | Not applicable; Vigil redistributes nothing. |
| May not display >500 consecutive verses or half a book on any page | Fine. One chapter per page. |

**The storage rule is looser than this repo assumes, and that is deliberate.**
The Licensing section above says ESV "must not be cached to disk". Crossway
does not actually say that — they permit storing up to 500 consecutive verses
or half a book, whichever is less. So a limited ESV offline mode would be
permissible. It is still not built, for three reasons:

1. "500 **consecutive** verses" is ambiguous — a cap on contiguous runs, or a
   total? The conservative reading is the only safe one, and it is the one
   that makes the feature least useful.
2. Complying properly means per-book accounting and an eviction policy that
   exists nowhere else in the app, sitting alongside the unrestricted
   public-domain path. Two storage policies, one of them legally load-bearing.
3. The payoff is small. 500 verses is roughly ten chapters — enough to re-read
   last night, not enough to be an offline Bible, and far too little to be a
   useful search corpus.

Storing nothing costs almost nothing and removes the whole class of risk.
**Keep it — but as a considered choice, not a misreading of the terms.**

### What the key is actually worth doing

1. **Test `fetchESV` / `parseESV` for the first time.** They have never run
   against the live API. `parseESV`'s indent-baseline pass is the subtle part
   and is entirely unexercised.
2. **Verify the copyright wording** against Crossway's citation page.
3. **ESV search via `/v3/passage/search/`.** The one place ESV could reach
   parity: search needs no storage, costs one query, and ESV readers get
   nothing from the offline corpus today. Best candidate for real work.
4. **Confirm the key is approved** — the form warns some uses need staff
   approval, so a key may exist but not yet be live.

The key is entered at runtime and stored on-device. It must never be pasted
into a transcript, a commit, or this file.

## Gotchas already hit

- `closeSheet()` resets `pickedBook` to `null`. A handler written as
  `closeSheet(); open(pickedBook, c)` passes `null`, because arguments evaluate
  after the teardown runs. This shipped once and broke every chapter selection.
  Capture ids into a local before closing any sheet.
- Verse numbers and the drop cap already supply their own spacing. The renderer
  tracks an `afterMark` flag so text runs don't add a second space.
- **A drop cap inside a poem block needs `.has-cap`.** `.poem` hangs its first
  line with `text-indent:-.9em`, which swallows the floated cap's right margin
  and butts the first word against the numeral — `23The LORD`. This was live in
  every poetic chapter of every translation until 2026-08-26; it only surfaced
  because fixing ESV poetry put a cap in a poem block for the first time on
  that path. The renderer adds `has-cap` to the paragraph carrying the cap.

- **The service worker is inert over plain `http://` on a LAN address.**
  Registration is guarded on `window.isSecureContext`, so testing at
  `http://192.168.50.3:8000` exercises the reader but NOT the PWA. Only
  `localhost` or the live `https://` Pages URL will install the worker. Same
  constraint as Wake Lock, and easy to mistake for a broken worker.
- **`sw.js` must never cache scripture.** The same-origin guard in its `fetch`
  handler is a licensing boundary, not an optimisation — a runtime cache over
  `api.esv.org` would put the app in breach of Crossway's terms. The header
  comment in `sw.js` says so; leave both in place.
- The shell is served stale-while-revalidate, so a pushed change lands on the
  **second** launch. Bump `VERSION` in `sw.js` to make it the first and drop
  the old cache. Forgetting this is the usual "I deployed but my phone shows
  the old version".
- Icons are generated, not hand-drawn: a gilt `V` in the body serif on pure
  black, rendered from HTML via headless Chrome. The maskable variant keeps
  its ink inside the inner-80% safe circle so Android's mask can't clip it.
- **iOS pins the status bar style at launch.** `apple-mobile-web-app-status-
  bar-style` is `black-translucent`, which draws the clock in white and lets
  the page run under it — right for dark, wrong for light, and it cannot be
  re-pointed at runtime once a home-screen app has launched. So in light mode
  on an installed iOS app the clock may be hard to read. `theme-color` IS
  updated live and fixes Safari-in-a-tab and Android; only the installed iOS
  case is stuck. Fixing it properly means giving up the edge-to-edge bleed in
  dark mode, which is a worse trade. Open, deliberately.
- Gilt is not the same value in both themes. On black it is
  `hsl(41 …% …%)` derived from L; on vellum it is a fixed, much darker
  `hsl(38 66% 28%)`, because the L-derived gold falls to 3.9:1 on a light
  ground. Verse numbers and the drop cap are set in it, so it has to hold.
