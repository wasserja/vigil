# Vigil

A single-file mobile web app for reading the Bible in the dark. Built for OLED
iPhone screens, added to the home screen, read at night.

## Design intent

The brief was "a truly dark mode" — so the background is pure `#000000`, with no
panels, gradients, or elevated surfaces. Text is warm parchment rather than
white, and both its brightness and its warmth are user-tunable so it can be
dialled down to near-candlelight.

The visual reference is a monk's psalter read by candle, not a productivity app:
a gilt chapter numeral set as a drop cap, verse numbers hung small and gold,
uppercase letterspaced headings. Keep that direction. If a change would make it
look like a generic reading app, it's wrong.

The chrome dissolves entirely after ~2.8s or on scroll-down, and returns on
scroll-up or a tap. Text masks into black at the top and bottom edges rather
than hitting a hard cut. **The reading surface is the product; UI is a guest.**

## Architecture

One self-contained `index.html`. No build step, no framework, no dependencies,
no external assets. The body typeface is a system stack (Iowan Old Style /
Charter / Palatino) so nothing is downloaded and it renders instantly.

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

1. **Replace the `Store` adapter.** It currently prefers `window.storage`, which
   only exists inside Claude's artifact sandbox. Self-hosted, it falls through
   to in-memory and every setting and downloaded book is lost on refresh. Use
   `localStorage` for settings and last position, IndexedDB for downloaded
   books (they are far too large for `localStorage`). There is a marked comment
   at the swap point.
2. **PWA files**: `manifest.webmanifest`, an icon, and a service worker that
   precaches the shell so it opens with no signal. Mind the subpath scope.
3. **Full-text search** — the one feature the user named and never got. HelloAO
   has no search endpoint. Options: build an index from downloaded books
   (offline, works with the existing storage layer), or use ESV's
   `/v3/passage/search/` for ESV readers only. The former is more in keeping
   with the app.

## Gotchas already hit

- `closeSheet()` resets `pickedBook` to `null`. A handler written as
  `closeSheet(); open(pickedBook, c)` passes `null`, because arguments evaluate
  after the teardown runs. This shipped once and broke every chapter selection.
  Capture ids into a local before closing any sheet.
- Verse numbers and the drop cap already supply their own spacing. The renderer
  tracks an `afterMark` flag so text runs don't add a second space.
