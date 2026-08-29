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
scroll-up or a tap. Text fades into the page at the top and bottom edges
rather than hitting a hard cut. **The reading surface is the product; UI is a
guest.**

### The document is the scroller (changed 2026-08-27)

It used to be a fixed shell (`#app`) wrapping an `overflow:auto` reader, with
`html,body{overflow:hidden}`. That is now inverted: the document itself
scrolls, `#reader` is plain content, and everything that was `absolute` inside
`#app` — chrome, progress, scrim, sheet — is `fixed` to the viewport.

**This is not a refactor for its own sake.** iOS Safari and Android Chrome tie
the URL bar to the ROOT scroller. A page whose scrolling happens in a nested
element is structurally opted out of ever collapsing that bar, and no meta tag
or script buys it back. Read in a browser tab, the old build permanently gave
up ~60-100pt of screen. Installed to the home screen it made no difference,
which is why it went unnoticed.

Consequences to keep in mind when touching layout:

- **Never put `overflow:hidden` back on `html`/`body`.** That single line
  silently undoes the whole thing, and the symptom is subtle — the app looks
  fine, it just stops reclaiming the bar.
- **The edge fades are overlays, not a mask.** `.fade` is `position:fixed`,
  pinned to the viewport, so it no longer depends on a scroll box resolving
  its own height. This is exactly bottom-gap candidate 3.
- **An open sheet freezes the page by hand** — `lockScroll()` records
  `scrollY`, sets `body{position:fixed}` with a negative `top`, and
  `unlockScroll()` restores it. Without the offset dance the reader jumps to
  the top every time a sheet opens.
- **Anything reading scroll position reads the window**, not `#reader`:
  `updateProgress`, `landOn`, `redrawKeepScroll`, and the immersion listener.
  `landOn` uses `getBoundingClientRect().top + scrollY` because `offsetTop` is
  meaningless once `#page` is in normal flow.

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
  for service worker scope. **The URL is not free to change** — see the next
  two entries before agreeing to move it anywhere.
- **The origin is where the user's data lives.** Settings, last position, the
  offline index and every downloaded book are keyed to `wasserja.github.io`
  by the browser. A custom domain is therefore not a DNS change: it is a new
  origin, so every device silently starts empty, and any installed PWA keeps
  pointing at the old URL and keeps working there. Nothing warns anyone, and
  there is no migration path a static page can perform — the two origins
  cannot read each other's storage. If a custom domain is ever genuinely
  wanted, that cost is the decision, not the DNS.
- **Vigil is reachable from `wasserja.github.io` too, and must not be MOVED
  there.** That root is a separate one-file repo (`wasserja/wasserja.github.io`)
  holding a redirect to `/vigil/`, so the app can be opened by typing a
  username on a machine with no history. It is a redirect rather than a
  relocation for the reason in the entry above this one: the service worker
  takes the scope it is served from, so at `/` it would sit in front of every
  other project page on the account. The redirect also keeps the origin
  identical, which is the whole point. `spoo.me/vigil` is a third-party
  shortener pointing at the same place — a convenience, and the only one of
  the three that depends on someone else staying alive.
- **Desktop browsers cannot hide their URL bar on scroll, at all.** Chrome,
  Safari and Firefox on a desktop only surrender chrome to the Fullscreen API,
  which needs a user gesture and shows its own overlay. So "full screen on
  desktop" is not the same problem as on a phone and was not solved by the
  scroll work above — nor by the layout work of 2026-08-28, which is a
  different problem entirely. See "What is still not solved on a desktop".
- The manifest still sets `"orientation": "portrait"`, which locks the
  installed app even on an iPad. **Now a live question rather than a
  hypothetical one**, since the layout handles a landscape tablet as of
  2026-08-28 and the manifest is what stops anyone seeing it. Not changed
  unilaterally: the lock is deliberate on a phone — a reader that rotates
  in bed is a worse reader — and there is no way to say "portrait on a
  handset, free on a tablet" in a manifest. It is one decision for both.

## Priorities

**Next up, in this order (set 2026-08-27):**

1. **A read-aloud-friendly version for Edge.** The `?listen` layout exists;
   what is unfinished is proving it out in daily use and settling the voice
   question — check Settings → Read aloud → Voice *in Edge* before writing
   any code, because if Microsoft's neural voices are listed there, Vigil's
   own Listen already sounds as good and much of this evaporates. See
   "Reading layout and listening layout".
2. ~~**Modern translations — AMP, MSG, NLT.**~~ **Done 2026-08-29**, v21.
   Third source adapter, key in hand, parser written against live responses
   from all three publishers. See "Modern translations via API.Bible".
   Still open there: **search does not cover them**, which is the next
   piece, and offline is off pending a 30-day expiry.
3. **Microsoft's neural voices — Ava, and the rest.** Wanted 2026-08-29.
   Item 1 above is the free half of this same question and must be settled
   first. See "Microsoft neural voices: Ava, Edge and Azure".
4. Hebrew and Greek. Scouted, further out.
5. **Desktop full screen.** All that is left of the larger-screens item
   below, now that the layout part is done — and it is a separate problem,
   not a layout one. See "Known constraints".

The numbered history below is what has already been done.


1. ~~Replace the `Store` adapter.~~ **Done 2026-08-26.** `localStorage` for
   settings/position/offline index, IndexedDB for downloaded books, routed by
   the `bk:` key prefix. A quota failure aborts the IDB transaction, which
   surfaces as `set()` returning `false` so the "too large to store" toast
   still fires. `Store.backed` probes localStorage with a real write, because
   Safari private mode exposes the object but throws on `setItem`.
2. ~~PWA files.~~ **Done 2026-08-26.** Manifest, four icons, and a service
   worker that precaches the shell. All paths are relative so one build serves
   both `/` locally and `/vigil/` on Pages.
3. ~~Full-text search.~~ **Done 2026-08-26**, extended to the ESV
   2026-08-27. Over the books saved for offline reading — no index, a linear
   scan of a flattened corpus built on first search and cached per
   translation. Measured at 10-15ms per query
   over a whole-Bible-scale corpus (31,102 verses, 2.3MB) on desktop JSC, so
   an inverted index would have bought nothing but a second persisted
   structure to keep in sync. Quoted queries are phrases, bare words are
   ANDed, results cap at 300. A hit opens the chapter and lands on the verse.
4. ~~**ESV**.~~ **Done 2026-08-27.** Parser tested and fixed; search built on
   `/v3/passage/search/`; copyright verified. See the ESV section below.
5. ~~**Larger screens: worth it, or not?**~~ **Done 2026-08-28.** Worth it,
   and cheaper than the original analysis feared — see "Larger screens"
   below. The answer landed close to the prediction recorded here: raise
   the effective measure, cap the things that were in viewport units, and
   leave everything else alone. No two-column reading, no desktop layout,
   no second design.

## ESV: the API v3 terms, and what they mean here

Recorded 2026-08-26 from the Crossway application form, when a key finally
existed to test with. The seven guidelines, and where each lands:

| Guideline | Where Vigil stands |
|---|---|
| Copyright citation as outlined by Crossway | **Verified 2026-08-27.** Full notice on the Copyright group of the translation sheet; chapter colophon carries the letters (ESV) + the required link to esv.org. See "The two notices". |
| Strictly noncommercial | Fine. Free, no ads, no sale. |
| ≤500 verses per query, or half a book, whichever is less (single-chapter books excepted) | Fine. One chapter per query; the longest is Psalm 119 at 176 verses. Two-chapter books hit exactly half, which is allowed; single-chapter books are exempt by the rule's own wording. |
| 5,000 queries/day, ≤1,000/hour, ≤60/minute | Fine with headroom. Steady reading costs ~1 request per chapter turn once `prefetchNeighbours` is warm. 5,000/day is the whole Bible four times over. Only sustained fast flicking (>20 turns/min) could approach 60/min. |
| **May not locally store more than 500 verses or one-half of any book, whichever is less** | We store **nothing**. See below. Note: the API terms say plain "500 verses", *not* "consecutive" — see the correction below. |
| Redistribution ≤500 verses, <50% of a book, <50% of the containing work | Not applicable; Vigil redistributes nothing. |
| May not display >500 consecutive verses or half a book on any page | Fine. One chapter per page. |

**The storage rule is looser than this repo assumes, and that is deliberate.**
The Licensing section above says ESV "must not be cached to disk". Crossway
does not actually say that — they permit storing up to 500 consecutive verses
or half a book, whichever is less. So a limited ESV offline mode would be
permissible. It is still not built, for three reasons:

1. ~~"500 **consecutive** verses" is ambiguous.~~ **Resolved 2026-08-27.**
   The word "consecutive" comes from the application form; the API terms
   page does not use it. It says "You may not locally store more than 500
   verses or one-half of any book of the Bible (whichever is less)", and the
   caching FAQ says plainly "You can cache up to 500 verses." So it is a flat
   total, not a cap on contiguous runs — which is the *stricter* of the two
   readings, and the one we had already assumed. The ambiguity is gone; the
   conclusion it supported is unchanged.
2. Complying properly means per-book accounting and an eviction policy that
   exists nowhere else in the app, sitting alongside the unrestricted
   public-domain path. Two storage policies, one of them legally load-bearing.
3. The payoff is small. 500 verses is roughly ten chapters — enough to re-read
   last night, not enough to be an offline Bible, and far too little to be a
   useful search corpus.

Storing nothing costs almost nothing and removes the whole class of risk.
**Keep it — but as a considered choice, not a misreading of the terms.**

### The two notices — use the API one

Crossway publishes two different ESV copyright notices, and they are not the
same text. Checked 2026-08-27:

- **`crossway.org/permissions/`** (general print/digital guidance) adds an
  `ESV Text Edition: 2025.` line, puts the Creative Commons and no-translation
  restrictions *before* "Used by permission. All rights reserved.", and says
  "may not be translated **in whole or in part** into any other language".
- **`api.esv.org`** (the terms that actually govern a key holder) has no Text
  Edition line, puts the two restrictions *after* "All rights reserved.", says
  "may not be translated into any other language", and adds a second required
  paragraph: "Users may not copy or download more than 500 verses…".

**Vigil carries the api.esv.org wording**, because that is the agreement the
key is issued under. It is in `ESV_NOTICE`, verified character-for-character
against the live page. Do not "update" it to the permissions-page version, and
do not add a Text Edition line — we have no way to confirm which edition the
API serves, and their own API terms don't ask for one.

Three obligations from that page are load-bearing in the UI, so don't treat
any of them as decoration:

- **The link to esv.org.** "Each page on which you use the text must include a
  link to www.esv.org." That is `credit.url`, rendered by the colophon.
- **The letters "ESV" with the quotation.** Normally satisfied by the API's
  `include-short-copyright`, which we set to `false` because a trailing
  "(ESV)" inside the reading column looks like scripture. `parseESV` strips it
  too. So the letters are carried by `credit.name`, which is
  "English Standard Version (ESV)" — the parenthetical is doing compliance
  work, not styling. Don't tidy it away.
- **The notice itself**, both paragraphs — but **once, on a copyright page**,
  not on every chapter. See below.

#### Per page vs. once per site — don't conflate these

This was got wrong on the first pass, so it is written down. The terms ask for
two different things in two different places:

- **On every page that shows the text:** "any copyright notice that is sent
  with the text", the letters "ESV" with the quotation, and a link to
  www.esv.org. That is all. The chapter colophon does this with
  `credit.name` = "English Standard Version (ESV)" and `credit.url`.
- **Once, on a "copyright" page of your website:** the full two-paragraph
  notice. That is the `Copyright` group at the foot of the translation sheet.
  `credit.note` is `null` for ESV precisely because the notice does not
  belong at the end of every chapter.

"You must include the standard ESV copyright notice **on your site**" is the
site-level obligation; "**Each page** on which you use the text must include a
link to www.esv.org" is the per-page one. Reading the first as per-page puts
440 characters of fine print at the end of every chapter, which is compliant
but wrong for this app — the reading surface is the product. If someone later
"fixes" the colophon by moving the full notice back into it, this is why not.

Also settled on that page, and worth not re-litigating: use in a mobile app or
other digital medium is explicitly "permitted without formal permission,
provided all general conditions stated above are met", so Vigil-as-a-PWA needs
no separate licence. The non-commercial test is "does not charge for access …
[nor] accepts advertising or sponsorships" — Vigil passes, but that is a
constraint on the app's future, not just its present.

### What the key was worth doing

1. ~~Test `fetchESV` / `parseESV` against the live API.~~ **Done 2026-08-26**,
   and it found three real parser bugs — see the `parseESV` notes above. Live
   fixtures were kept out of the repo; no ESV text is committed.
2. ~~Confirm the key is approved.~~ **Done** — John 1, Psalm 23, Psalm 119 and
   Philemon all returned HTTP 200.
3. ~~Verify the copyright wording.~~ **Done 2026-08-27**, and the notice we
   shipped was wrong — see "The two notices" below. Fixed in `ESV_NOTICE`.
4. ~~**ESV search via `/v3/passage/search/`.**~~ **Done 2026-08-27.** See
   "ESV search" below for the endpoint's two reference-format traps and the
   two design calls that were open.

### ESV search

Built 2026-08-27 on `/v3/passage/search/`. It is the one place the ESV reaches
parity with the offline translations, and it needs no storage, so it sidesteps
the guideline-5 question entirely. One query per search against a 5,000/day
budget.

`q` takes bare words (ANDed) or a `"quoted phrase"`, which is close enough to
`parseQuery`'s own grammar that `parseQuery` and `highlight` are reused
unchanged. Results come back in canonical order — not by relevance —
100 to a page, which is their maximum.

**Two traps in the reference format**, neither in the docs, both found by
pulling 2,949 distinct references off the live endpoint and parsing every one:

- **Psalms comes back singular.** `Psalm 3:2`, where our canon says "Psalms".
  `esvBookByName` carries the alias.
- **Single-chapter books drop the chapter.** `Jude 1` is book and *verse* —
  not book and chapter. Same for Obadiah, Philemon, 2 John, 3 John. A naive
  `Book C:V` parse fails on all five, and a naive `Book N` fallback would
  open *chapter* N of every other book. So `refFromESV` only accepts the
  short form for books that actually have one chapter.

The whole sample parses (2,949/2,949, 58 books, no out-of-range chapters).
`searchESV` still drops a result whose reference will not parse rather than
render a row that opens nothing — a floor, not a path.

**Two design calls, both deliberate:**

1. **One sheet, not two modes.** The search sheet relabels itself when the
   translation is ESV. The reason is not tidiness: the offline sheet's copy
   promises the query "never sends your query anywhere", and that stops being
   true on the ESV. The sheet now says the query goes to Crossway. If the two
   engines ever need to diverge further, keep the honesty and split the copy —
   do not quietly drop the line.
2. **Enter to search, not type-ahead.** Offline search is free and debounced
   at 160ms. A network search on the same trigger would spend a billed
   round-trip per keystroke against a 60/minute cap. `run(q, page)` takes its
   query as an argument and never reads the field, so "Load more" pages the
   search the results actually belong to — reading the live input there means
   editing the field and tapping Load more fetches page 2 of a *different*
   query and renders it as page 1.

`resultRow` is shared by both engines so they cannot drift apart.

Once the key is saved the ESV appears as an ordinary row in the translation
sheet, under "With your key", and the entry form goes away — a form that
never leaves is furniture, not a feature. "Change key" brings it back, and
that state (`esvKeyOpen`) resets whenever the sheet closes. "Forget key"
also switches the reader off the ESV if it is currently selected, so the
app is never pointed at a translation it can no longer fetch.

The key is entered at runtime and stored on-device. It must never be pasted
into a transcript, a commit, or this file. For local testing there is a copy
at `~/.esv_api_key` (mode 600, outside the repo and outside the homelab
backup allowlist); read it into a request, never echo it.

## Larger screens (done 2026-08-28)

The question this was postponed as — "worth it, or not?" — turned out to be
the wrong shape. There was a real bug underneath it, and once that was fixed
the rest was three caps and a rail.

**The bug: the gutter ate the column.** `--pad` was `7vw` and `#page` is
`border-box` under `max-width:var(--measure)`. On a phone that is invisible,
because the viewport is narrower than the measure and the padding comes out
of screen width. The moment the window is wider than the measure, the column
stops growing and the padding keeps going — so a 1440px window put 100px of
gutter inside a 544px box and left 444px of text, and a 1920px window left
less. **The reader got NARROWER as the screen got wider.** `--pad` is now
`min(7vw, 32px)`.

**32px is not a round number, it is a floor on regression.** 7vw of a 430pt
iPhone Pro Max is 30.1px, so a 30px cap clipped it — a tenth of a pixel, but
enough to shift every glyph in the column and re-wrap a line. At 32 the
render is byte-identical up to a 457pt viewport. Any future cap in this
stylesheet gets the same treatment: check it against the widest phone before
believing it is phone-neutral.

**Everything else scales through one variable.** `--zoom` is `1` at phone
sizes and steps up on a viewport a phone does not have:

    820 x  620   1.08     iPad portrait, small laptop window
   1200 x  760   1.16     ordinary laptop
   1700 x  900   1.24     external display

It multiplies `--fs` and `--measure` together, so characters-per-line stays
where it was tuned rather than shrinking as the type grows. The reason for
one knob rather than a set of per-element rules is that the drop cap, verse
numerals and headings are all already in `em` — they follow the body size for
free. The only two things that needed reaching into were `.ref-line` and
`.colophon`, which are in `rem` on purpose (they must NOT follow the Size
slider) and so are written `calc(.62rem * var(--zoom))`.

**Every query is width AND height.** A 1440x700 browser window is wide but
short, and scaling type up there costs lines on a screen that has few to
give. This is the height-based query the original notes guessed at; it just
lives alongside the width rather than replacing it.

**The vertical padding is capped, not converted.** `20vh`/`46vh` stays in
`vh` — the bottom band is what lets the last verse rise to a comfortable
reading height instead of sitting on the bezel, and that is genuinely
proportional. It is wrapped in `min(…, 190px)` / `min(…, 440px)`, and both
caps sit above what any phone produces (46vh of an 844pt iPhone is 388px),
so they bite on a tall desktop and nowhere else.

**Chrome is railed, sheets are narrowed.** `.chrome` keeps its full-bleed
gradient and the flex row moved one level in to `.bar`, which above 820px
takes the column's width and centres. Below that breakpoint `.bar` is a
plain flex row and the bars render exactly as before. The rail is
`--measure * --zoom` with NO `--pad` added: `--measure` is a border-box
width and already contains the gutter, and adding it put the title exactly
one `--pad` left of the text it labels. Subtracting `.btn`'s own 11px of
padding lines the title's glyphs up with the first letter of the chapter.
The sheet stays a bottom sheet — same gesture on a tablet as on a phone,
and it keeps the column visible above it — but narrows to 560px and
centres, instead of spreading three columns of book names across a metre.

**Two things came along because they were the same bug.** `#toast` was
`position:absolute` inside an unpositioned `#app`, so since the scroller
inversion it resolved against the document rather than the viewport and
scrolled away with the text; it is `fixed` now. And `#sheet`'s transform is
composed from `--sx` (the centring) and `--drag` (drag-to-dismiss) rather
than assigned, because the drag handler used to write `style.transform`
directly — which would have silently thrown the centring away the first
time a finger touched the grip on an iPad.

**A mouse gets two things a thumb does not.** Hover states, gated on
`(hover:hover) and (pointer:fine)` so a tap never leaves a phone button
stuck in a lit state; and a `pointermove` near either edge of the window
brings the chrome back, because the phone's two ways of recalling it —
scroll-up and tap — are both things a thumb does constantly while reading
and a mouse does not. It is guarded on `pointerType === "mouse"` and on the
same media query, and it stays out of the middle of the window, which is
where a reader's cursor sits.

**What was considered and NOT done**, so it does not get relitigated:
two-column reading (fights the scroll-driven immersion logic and the edge
fades, and a psalter is not a newspaper), a desktop-specific layout, and
raising the `--measure` ceiling past 44rem — the Column setting still tops
out there, and `--zoom` is what makes Wide actually wide on a desktop.

**Verifying a layout change here.** Screenshot the same page before and
after at 320/390/430 and require the phone widths to come back
byte-identical; that is the whole test, and it is what caught the 30px pad
cap. Headless Chrome needs care: `--headless=old` silently clamps a window
to a 500px minimum, so `--window-size=390,844` renders a 500px layout and
every phone check is a lie. The new headless mode honours the size but
stalls the app under `--virtual-time-budget`. Driving it over CDP with
`Emulation.setDeviceMetricsOverride` is the only arrangement that gets a
true 390px viewport.

## What is still not solved on a desktop

**Full screen.** Unchanged and unaffected by any of the above: a desktop
browser will not surrender its chrome to scrolling, only to the Fullscreen
API, which needs a user gesture and shows its own overlay. So it wants a
control somewhere — most likely a Settings row, guarded on
`document.fullscreenEnabled` — and that is a feature with a decision in it,
not a layout fix. Left deliberately.

Keyboard already works and predates this: arrows or `h`/`l` turn the page,
`g` opens the passage picker, `.` toggles the chrome, Escape closes a sheet.

## The bottom gap — RESOLVED 2026-08-27

For a day this was the app's worst open bug: on an installed iOS app the
reading column stopped ~61pt short at the bottom while the top ran clean to
the screen edge. Half an inch of dead page. It was measured carefully off
device screenshots, `height:100dvh` on `#app` was tried and did nothing, and
three candidate fixes were queued.

**It was fixed as a side effect of making the document the scroller.** The
bottom fade is now a `position:fixed` overlay pinned to the viewport instead
of a `-webkit-mask-image` on an `overflow:auto` box — which was candidate 3 on
that list. Confirmed on device: gone in iOS Safari, gone in the installed iOS
app, and good on Android.

Two things worth keeping from it:

- **The mechanism was the mask on the scroll container**, near enough. A
  `-webkit-mask-image` on an `overflow:auto` element is geometry WebKit gets
  wrong, and it only misbehaved on one edge. If a mask ever goes back onto a
  scrolling box, expect this again.
- **The 61pt ≈ top safe-area inset correlation was a red herring.** It looked
  like the shell was resolving to screen-minus-top-inset, which is what sent
  the first attempt at `dvh`. It was never the cause. A tight numeric
  coincidence is not a mechanism, and this one cost a day.

The full measurements are in git history (see the commit that closed this) if
a similar gap ever turns up.

## The build number is in the app, and why

Settings → About shows the version the **service worker** is actually
serving, and an "Update now" button that calls `registration.update()` and
reloads into the new build.

This exists because a stale shell is indistinguishable from a real bug.
The worker `skipWaiting()`s and claims on install, so a new build goes live
immediately — but the page already on screen keeps the old HTML until it is
relaunched. Twice during the read-aloud work, a fix that was already
deployed and verified was reported as still broken, and the answer both
times was "you are looking at the previous build". The version is queried
over a `MessageChannel` rather than a plain `postMessage`, because on a
first load the page is not yet a controlled client and the worker's reply
would have nowhere to go.

**Ask for the build number before debugging any report of "the fix didn't
work".**

### What actually gets spoken as "dot"

Measured 2026-08-27 with macOS `say -o` and `afinfo`, which shares its
voices with iOS, by comparing utterance durations:

| text | duration |
|---|---|
| `Genesis 1 · BSB` | 1.886s |
| `Genesis 1 BSB` | 1.515s |
| `berean.bible` | 0.817s |
| `berean bible` | 0.887s |
| `◆` | 0.012s |

So **`·` U+00B7 costs 0.37s — an extra spoken word, "dot"** — while a
period inside `berean.bible` is *shorter* than a space (read as a domain,
not "dot"), and `◆` is silent. A trailing period is never vocalised: a
period followed by a normal space and one followed by U+00A0 produce
byte-identical audio, so the nbsp between verses is safe. The middle dot
was the only offender, and it is gone from the text layer as of v11.

## Modern translations via API.Bible — AMP, MSG, NLT

Scouted 2026-08-27, terms verified 2026-08-29. These are commercially
licensed and are **not** on HelloAO, which carries 51 English translations,
all public domain or freely licensed, and none of these. There is no back
door: the route is a licence.

**API.Bible (American Bible Society) is that route.** Its own front page
features NIV, NASB, CSB, NKJV, NLT, GNT, Amplified, The Message and KJV,
under one agreement via publisher partnerships with Biblica, Lockman,
HarperCollins, Tyndale and others.

- **Starter — $0.** All Creative Commons and public-domain Bibles, plus
  **up to 3 licensed Bibles**, non-commercial only. **5,000 API calls per
  MONTH**, no overage protection.
- **Pro — $29+/month** for copyrighted Bibles generally; individual
  commercial licences from $10/month per translation.
- "Strictly non-commercial use. No ads, fees, freemium models or upsells."
  Their terms define non-commercial as no ads, revenue, paid subscriptions
  or in-app purchases; a modest donation link is tolerated by exception.
  Vigil qualifies today and would have to keep qualifying.
- Their own footnote: *NIV commercial use is not available.* Non-commercial
  NIV appears to be in scope, but see the open question below.

### What was verified on 2026-08-29

**1. It works from the browser — no server needed.** This was the real
architectural risk and it is cleared. A live preflight against
`api.scripture.api.bible/v1/bibles` from origin `https://wasserja.github.io`
returned `access-control-allow-origin: https://wasserja.github.io` and
`access-control-allow-headers: Content-Type,api-key`. So the key rides in
an `api-key` header exactly as the ESV key rides in `Authorization`, and
the same "your key, stored locally, never ours" arrangement carries over.

**2. Caching is ALLOWED, and this reverses an earlier assumption.** The
2026-08-27 note said copyrighted text "cannot be stored, so there is no
offline path". That is the ESV's rule, not this one. API.Bible's terms
require only that cached content be **refreshed at least every 30 days**
and never be more than 30 days out of date; printing, separately, is
capped near 100 verses. So a **30-day-expiry cache is not merely permitted
but necessary** — with 5,000 calls a month against Crossway's 5,000 a day,
caching is what makes the budget survivable, and prefetch stops being the
thing to switch off and becomes something to spend deliberately.

**3. FUMS is mandatory, and it is the one genuinely unwelcome term.**
"Any webapp must implement FUMs in order to use API.Bible, unless
otherwise prohibited by law." The Fair Use Management System is a usage
beacon: add `fums-version=3` to each call, take `meta.fumsToken` off the
response, and report it — either through their script at
`https://pkg.api.bible/fumsV3.min.js` calling `fums('trackView', token)`,
or, for non-JS environments, by fetching
`https://fums.api.bible/f3?t=<token>&dId=<deviceId>&sId=<sessionId>`
directly, which an app may issue itself as a plain request or image.

This matters more here than it would in most apps. Vigil today talks to
exactly one host per translation and reports nothing about who is reading
what. FUMS is a per-chapter-read beacon carrying a device id and a session
id. **Take the manual `f3` URL, not the CDN script** — it keeps the file
single, adds no third-party JavaScript to the page, sends only what the
endpoint requires, and stays inspectable in one place. It should also be
scoped to API.Bible chapters only: the HelloAO and ESV paths must remain
beacon-free. If read-aloud ever covers these texts, that is
`fums('trackListen', …)`, a separate report.

**4. Starter attribution is heavier than Pro's.** Starter users must carry
"a visible citation and hyperlink" to api.bible — the platform, on top of
each publisher's own required notice. Per-Bible the API returns the name,
abbreviation, IP-holder information and a link in its metadata, and the
terms require the abbreviation and the holder's link on the page showing
the text. That maps cleanly onto what already exists: publisher notice to
the `Copyright` group on the translation sheet, abbreviation and link to
the chapter colophon via `credit.name` / `credit.url`, and the api.bible
citation alongside them.

### Settled 2026-08-29: the account, and what the key reaches

Registered for Starter. **The pick is three licensed Bibles, and three is
the whole allowance** — NIV and NASB were both on the menu and both were
passed over, because five were wanted and only three could be had. The
chosen three are **AMP, MSG and NLT**. NIV and NASB remain gettable, but
only by giving one of these up, or by going to Pro.

Verified against the live key: 251 Bibles, 40 English entries. Nothing
resembling NIV or NASB appears anywhere in the catalogue — the only
near-miss on the name is `ASV`, the public-domain 1901 American Standard
Version, which is not the NASB.

**Editions come as a family and do not each cost a pick.** One NLT
selection yields three ids: `NLT` (`d6e14a625393b4da-01`), `NLTCE`
(Catholic Edition) and `NLTUK` (Anglicised). The reader wants plain NLT.

The list also repeats ids — `WEB` appears four times, `KJV` twice — so the
picker must **dedupe by `id`**, not by name.

The key is at `~/.apibible_api_key`, mode 600, outside the repo and
outside the homelab backup allowlist, exactly as `~/.esv_api_key` is.

### What the content actually looks like

USX-style JSON, and it is a far better starting point than the ESV's plain
text: structure arrives as data instead of as indentation to be measured.
Request with `content-type=json`. Observed styles, Isaiah 40 and John 3 in
The Message:

- `para` styles → the block contract, almost one-to-one: `ms1`/`s1`/`s2` →
  `heading`, `q1`/`q2` → `poem` at indent 1 and 2, `p`/`m` → prose, `b` →
  paragraph break, `d` → `sub`.
- `char` styles → inline detail: `nd` is the divine name in small caps
  (ten of them in Isaiah 40), `it` italics. `wj` is the words-of-Jesus
  hook that `woc` already expects — **The Message does not mark it**;
  John 3 carries none. Do not assume `woc` is populated per translation.
- Each chapter payload carries its own `copyright`, and the Bible metadata
  carries `info` with the publisher's link. So `credit.note` and
  `credit.url` build from the response — no table to maintain. The Message
  is NavPress, represented by Tyndale.

### The merged verse markers — the third parser lesson

**The Message merges verses, and the API reports the merge.** This is the
one thing in the payload that the app is not already shaped for:

```
Isaiah 40:  1-2, 3-5, 6-8, 9-11, 12-17, 18-20, 21-24, 25-26, 27-31
John 3:     1-2, 3, 4, 5-6, 7-8, … 27-29a, 29b-30, 31-33, 34-36
```

Nine "verses" in the whole of Isaiah 40. Note `29a` and `29b-30`: partial
verses with letter suffixes, which are not numbers at all.

Everything downstream assumes `v` is an integer — the hung numerals in the
gutter, verse anchoring, and search result references. So `v` becomes a
**string**, and the gutter has to tolerate `12-17` where it was built for
`12`. This is a Message-specific accommodation; AMP and NLT are expected
to number conventionally, and that expectation should be checked against
live data rather than trusted.

### Parked: a DBL key from library.bible

Noted 2026-08-29 during account setup — API.Bible's own signup mentions
that a **Digital Bible Library** key from `library.bible` can be added
alongside the API.Bible one. **Deliberately not researched yet**; this is
a pointer, not a finding, and nothing below has been verified.

The DBL is understood to be the upstream repository the Bible societies
and publishers deposit texts into — the library API.Bible itself draws
from — which is why it is worth a look: it may reach translations and
languages the API.Bible catalogue does not surface, and it is the same
account setup either way. Against that, access has historically been
arranged for rights-holders and licensed distributors rather than handed
to individual developers, so the first question is simply whether a
person can hold a key at all.

When it comes up, the questions in order:

1. **Can an individual get a key**, or does it require an organisational
   agreement? If the latter, this ends here.
2. **What does it carry that API.Bible does not** — and specifically,
   does it change the NIV / NASB / Message answer?
3. **Its own terms**: caching, attribution, and whether it has anything
   like FUMS. Assume nothing carries over from API.Bible.
4. **Response shape.** If it is a fourth source with a fourth format,
   that is a fourth adapter, and the value has to justify it.

### Built 2026-08-29 — the third source adapter

Shipped in v21. Architecturally it is what the block contract always
anticipated: `fetchAB` emits `{blocks, bookName, chapters, credit}` and no
rendering path changed to accommodate it. One adapter, whole catalogue.

**Translation ids carry their source.** API.Bible translations are stored
as `ab:<bibleId>` — `isAB()` reads the source off the id, HelloAO ids stay
bare, and the ESV stays the literal string it has always been. The
alternative, a parallel `S.source` field, puts the source and the id in two
places that can disagree, and `chapterCache` is keyed on the id alone.

**The picker is read from the key, not written into the app.** This is the
real difference from the ESV, where every key sees the same text. Here the
three licensed Bibles are chosen in API.Bible's dashboard, so a reader
bringing their own key brings their own three. `abFetchBibles` calls
`/v1/bibles`, filters to English and **dedupes by id** — the list repeats,
WEB four times and KJV twice. The catalogue fetch is deliberately NOT
awaited in `drawTranslations`: the free translations below must not wait on
a network call to a service the reader may not use.

`S.abAbbr` exists because the header tag shows `S.translation`, and an
API.Bible id is a 16-hex string, which is no kind of label.

**FUMS, and why it is the manual URL.** Reporting each chapter read is a
licence condition, not analytics we chose — it is how the American Bible
Society accounts to Biblica, NavPress and the rest for texts it does not
own. `reportFums` builds the `f3` URL itself rather than loading their
`fumsV3.min.js`. Vigil is one file with no third-party script in it, and a
CDN script is behaviour that can change without a deploy of ours. Verified
live: the endpoint answers 200 with a tracking gif, so `mode:"no-cors"` is
correct and the opaque response is expected. A failed report must never
take a chapter down with it, hence the swallowed catch. **The ESV and
HelloAO paths report nothing, and must stay that way.**

The device id (`S.abDev`) is random and carries no identity. It exists so a
publisher can tell one reader reading fifty chapters from fifty readers
reading one, which is the number they are owed.

### What the parser learned from live data

Written against real responses from all three publishers, and every one of
these was found that way rather than in the docs:

- **`qa` is a heading, not poetry.** It is the acrostic Hebrew letter over
  each stanza of Psalm 119 — 22 of them in the NLT — and it begins with `q`,
  so it falls through to the poetry branch and is read as a line of the
  psalm unless caught first. The ESV parser hit the identical trap from the
  other direction; the two now agree these are headings.
- **A whitespace-only text node can precede the verse tag.** The NLT opens
  every Psalm 119 line with one. Emitted, it becomes a stray run that
  indents the line by a space.
- **A run carrying a verse marker must not also carry a leading space.**
  The numeral contributes an nbsp, and the renderer only suppresses a space
  it would have ADDED — one already inside the text survives and doubles
  the gap. Live on John 3:27 in The Message.
- **One `para` is one block.** Without an explicit flush, consecutive `q1`
  lines merge and the stanza loses its line breaks.
- **`wj` is not populated everywhere.** The Message marks no words of
  Jesus at all — John 3 carries none. Do not assume `woc` is per-translation
  reliable.

Deliberately left alone: `nd` (divine name) and `sc` (small caps) are
flattened to text, since the run contract has no small-caps flag. And the
**Amplified's bracketed cross-references** (`[Ezek 34:11-31]`) sit in the
same text node as scripture, so they cannot be dropped structurally — only
by regex, which would risk eating the amplification brackets that are the
whole point of that translation. They stay. Editing a publisher's text is
also the sort of thing their licence exists to forbid.

### Merged verses, and the hanging indent

The Message merges verses and the API reports the merge: nine "verses" in
Isaiah 40, and markers like `27-29a` / `29b-30` that are not numbers at
all. `v` is therefore a **string** end to end.

The consequence is typographic. `.poem` hangs its opening numeral in the
padding, and that hang was cut at `-.9em` — right for `1`, `12` and `119`,
too narrow for `12-17`, which puts the line's first word inside the
numeral. The hang is now `calc(var(--vw,3) * -.3em)`, where `--vw` is the
marker's length in characters, set by the renderer on **poem lines only,
and only where the numeral actually opens the line**. Markers of three
characters or fewer leave `--vw` unset and land on the original `.9em`, so
nothing about the free translations moved.

### What the browser pass found (2026-08-29)

Playwright drives WebKit at an iPhone 13 viewport in dark mode against a
local `python3 -m http.server`, which is enough for the service worker
(https-or-localhost). Four defects came out of it that no amount of reading
the code had produced:

1. **The key did not survive a reload.** `save()` writes an explicit field
   list, and `abKey` / `abAbbr` / `abDev` were not in it. `abDev` belongs
   there most of all: a device id that regenerates every launch reports one
   reader as a new reader each time, which is the opposite of the number
   FUMS exists to count.
2. **The raw bible id leaked into the reference line** — `ISAIAH 40 ·
   AB:6F11A7DE016F942E-01` across the top of the page. The header tag had
   the same bug and had already been fixed *separately*, which is how the
   second one survived. Both now go through `transLabel()`; anything that
   displays the translation must use it.
3. **The picker offered 40 API.Bible rows, most of them free elsewhere.**
   Their catalogue carries no flag marking the licensed three, so the list
   is filtered against HelloAO's instead: reading a public-domain text
   through the key spends a metered call on something that is free below,
   and gives up search and offline in exchange. Matching on `id` AND
   `shortName` (HelloAO's id is often `eng_kjv`, the recognisable
   abbreviation is in `shortName`) took it to 15. Matches stay **exact** on
   purpose — a fuzzy name match would eventually hide a licensed
   translation behind a similarly-named free one, and a missing row is a
   much worse failure than a duplicated one.
4. The catalogue also lists one translation under several ids, so rows are
   deduped by abbreviation as well as by id.

Confirmed working by screenshot: the widened hang on `9-11` puts "Climb a
high mountain, Zion." in line with every other `q1` around it; the colophon
reads "The Message (MSG) · www.navpress.com · api.bible" above the full
NavPress notice, which is both required links and the publisher's text.
Zero console errors on boot, on chapter load, and after a reload.

**Playwright's WebKit is not iOS Safari** — same core engine, different
embedding. It will not catch home-screen PWA behaviour or Safari's
viewport-unit handling. The phone remains the last word.

### Not built yet, and honest about it in the UI

- **Search does not cover these translations.** It reads books saved on the
  device and these are not saved, so the usual "download a book" advice
  would point at a button that is switched off. The sheet says so plainly
  and disables the field. API.Bible has a search endpoint; wiring it is the
  obvious next piece, and it is the ESV's shape — spend a call, page the
  results.
- **Offline download is off**, though unlike the ESV it is *permitted*. A
  saved chapter would have to expire within 30 days and that expiry is not
  built. Keeping text past its licence because the expiry was "obviously
  fine" is exactly the failure to avoid, so the button stays off and the
  row says why.
- **The first chapter of a Bible costs two calls**, not one: the chapter,
  then `/v1/bibles/{id}` for the publisher's link. Metadata is cached in
  memory and in `Store` (`abm:<id>`) and never fetched again. Against 5,000
  calls a MONTH this is worth remembering — `prefetchNeighbours` still
  spends 2-3 per turn, and it is the next thing to reconsider if the
  budget bites.

## Microsoft neural voices: Ava, Edge and Azure

Wanted 2026-08-29. Ava is one of Microsoft's neural voices
(`en-US-AvaNeural`, and an Ava Multilingual variant), and it is the sound
Jason is actually after. There are two ways to it and they are not equally
good — **the cheap one has to be ruled out before the expensive one is
even scoped.**

### First: it may already be free, and this is priority 1 above

Edge exposes Microsoft's cloud "Online (Natural)" voices to ordinary web
pages through `speechSynthesis`, which is the same API Vigil's Listen
button already drives. If Ava appears in `speechSynthesis.getVoices()`,
**there is nothing to build**: the existing voice picker lists it, the
existing Listen button speaks it, no key, no account, no per-character
cost, and no text leaves for anywhere Vigil chose to send it.

So the first move is not code. It is opening Settings → Read aloud →
Voice in Edge and reading the list.

Two things to expect while checking, neither of them a reason to give up:

- **Platform matters more than the browser's name.** Edge on Android is
  Chromium and is the plausible case. **Edge on iOS is not Edge** — every
  iOS browser is WebKit underneath, so it gets Apple's voices, and the
  Microsoft neural voices will not be there. The Natural voices are also
  documented mostly against Windows; macOS and Android coverage is the
  unverified part.
- **A known Edge bug** returns every natural voice as `Microsoft undefined
  Online (Natural) - undefined` from `getVoices()`. If the picker looks
  broken rather than empty, that is this, not Vigil.

### Second: Azure AI Speech, if Edge will not give them up

Same voices, sold directly. This is a real project, not a switch.

- **Cost.** Free tier is 500,000 characters and 5 audio hours a month;
  beyond that, standard neural is about $16 per million characters (Neural
  HD around $22). For scale: a typical chapter is a few thousand
  characters and Psalm 119 is roughly twenty thousand, so the free tier is
  on the order of a hundred chapters a month — the same shape of budget as
  API.Bible's 5,000 calls, and it wants the same care.
- **A key that costs money changes the bargain.** The ESV and API.Bible
  keys are free-tier and rate-limited; the worst an exposed one does is
  exhaust a quota. An Azure Speech key is metered spend. Azure's answer is
  short-lived tokens minted by a token endpoint — **which needs a server,
  and Vigil does not have one and should not grow one**. So it would have
  to be the reader's own key, held locally, with real financial exposure
  behind it. That is a materially worse deal than the two Bible keys and
  must be said plainly in the UI if it is ever built.
- **Sending licensed text to a third party is a licensing question, not a
  billing one.** Synthesising a chapter means transmitting it to
  Microsoft. For the public-domain HelloAO texts that is nobody's problem.
  For the **ESV, and now for AMP, MSG and NLT**, it is exactly the kind of
  use Crossway's and API.Bible's terms circumscribe, and neither has been
  read with this in mind. Read them before writing the request, not after.
  The safe first version is **public-domain translations only**.
- **Audio of licensed text cannot be cached** any more than the text can,
  which removes the obvious way to make the character budget survivable.

### The order, then

1. Check Edge's voice list. If Ava is there, this is finished and costs
   nothing.
2. If it is not: the Azure path is public-domain translations only until
   the ESV and API.Bible terms have been read specifically on the question
   of transmitting text to a synthesis service.
3. Only then the key handling, and it needs its own warning in the sheet,
   because unlike the other two keys this one spends money.

## Someday: Hebrew and Greek, and searching the originals

Wanted, and explicitly ranked BELOW read-aloud. Scouted 2026-08-27 so the
groundwork is not re-done from scratch.

**The texts are already reachable — no new source, no new adapter.**
HelloAO carries them and they fit the existing block contract exactly
(`{type:"verse", number, content:[…]}`), so `fetchAO` would parse them
unchanged:

- Hebrew OT: `hbo_wlc` / `heb_wlc` (Westminster Leningrad Codex)
- Greek NT: `grc_sbl` (SBL), plus Byzantine, Textus Receptus, Tischendorf,
  Family 35, Majority Text
- Septuagint: `grc_bre` (Brenton)

The picker filters on `language === "eng"`, so today they are one filter
away. The API also reports `textDirection` per translation (`rtl` for
Hebrew), so direction is data, not a lookup table we would have to keep.

**What actually needs building, in order of difficulty:**

1. **Direction and type.** `dir="rtl"` on the page, and the poem indents
   and drop cap need checking under RTL — the cap floats left. The body
   stack (Iowan Old Style / Charter / Palatino) has no Hebrew at all, so it
   would fall back to a system font and the typography would stop being
   Vigil's. Greek coverage in Palatino is passable. A real Hebrew face is
   the honest cost here, and it is a download, which the app currently
   never does.
2. **Search normalisation — this is the actual work.** The WLC text carries
   full pointing and cantillation (`בְּרֵאשִׁ֖ית`), and the Greek carries
   accents and breathings. A user typing an unpointed word matches nothing,
   because the stored form has combining marks between the letters. The
   corpus and the query both need Unicode NFD plus stripping of
   U+0591–U+05C7 (Hebrew) and U+0300–U+036F (Greek). That is a contained
   change to `flattenChapter` and `parseQuery`, but it must be done on both
   sides or it silently half-works.
3. **Lemma search is NOT possible from this data.** Checked: the payloads
   carry `content`, `number`, `type` and nothing else — no Strong's
   numbers, no lemmas, no morphology. Hebrew and Greek are heavily
   inflected, so surface-form search finds one conjugation and misses the
   rest. If "search the originals" is meant to mean *searching by root*,
   this source cannot do it and a morphology dataset (OSHB, MorphGNT) is a
   separate project with its own licence and storage story.

**Read-aloud should be off for these.** `speechSynthesis` has no Biblical
Hebrew or Koine voices; a modern Hebrew voice would mispronounce pointed
Biblical text confidently, which is worse than silence.

## Where this is heading (2026-08-27)

Two products out of one file, and that is the shape to hold:

1. **The reading app** — the OLED-dark reader with its light mode, the drop
   cap, hung numerals and headings. This is the thing on the home screen.
2. **An Edge-facing listening page** — `?listen`, plain prose, aimed at a
   browser whose own read-aloud is doing the work. Edge's neural voices are
   better than Safari's or Chrome's, which is the whole reason this second
   mode is worth having rather than just telling people to use Vigil's own
   Listen button.

Vigil's built-in Listen still exists and still works in both layouts; it is
the fallback where a browser has no read-aloud at all, which is iOS Safari
and the installed app.

**Open: can Vigil reach Edge's neural voices directly?** Unverified. Edge
is understood to expose its Microsoft "Online (Natural)" voices through
`speechSynthesis`, in which case the existing voice picker already lists
them and nothing needs building — check Settings → Read aloud → Voice in
Edge before writing any code. If it does not, the same voices are sold
through Azure Speech, which means an API key, per-character cost, and
sending text to a third party — which for the ESV is a licensing question,
not just a billing one. Public-domain translations would be unaffected.

## Reading layout and listening layout

Two layouts, ONE file. Settings → Read aloud → "Listening layout", and
`?listen` in the URL turns it on for that page load only — a bookmark you
can hand to a read-aloud browser without changing how the app opens next
time. `listenView` is the live flag; `S.listen` is the stored preference.

Listening layout emits **only the prose**: no running head, no drop cap, no
verse numerals, no headings, no closing `◆`. The colophon stays, because
the ESV notice has to be displayed.

**It omits those elements rather than emptying them, and that distinction
is the whole point.** Emptying them is what made reader views misbehave —
an empty `<h2>` and an orphan text fragment are how the word "it." ended up
promoted to the page title. What listening layout leaves behind is ordinary
paragraphs of text, which every extractor and speech engine handles
correctly. `.vt` wrappers are kept, because they are inline and harmless
and Vigil's own Listen needs them to highlight.

Between verses it emits a plain space rather than the nbsp the reading
layout uses: there is no numeral here to be orphaned at a line end.

**A separate folder was considered and rejected.** It would have meant two
copies of the renderer, the block contract, the ESV adapter and the
licensing code, and the first fix applied to one and not the other would
have started the drift. The conflict was never "one page cannot do both" —
it was empty elements, and a flag in the renderer settles it.

## One run of prose is one text node

A source may split a single verse across several runs for reasons that
leave no trace in the output. BSB puts a footnote marker inside John 1:5 —
`["...has not overcome", {"noteId":0}, "it."]` — and `fetchAO` drops the
marker, leaving two adjacent runs that used to become two adjacent spans.

That seam is a real liability, not just untidy DOM. **Edge's reader view
took the orphaned `it.` and promoted it to the page's title**, above the
chapter. The renderer now merges adjacent runs when nothing distinguishes
them; words-of-Jesus runs still get their own span, because `.woc` has to
be tintable.

The same screenshots showed the `.vn` nbsp surfacing as a stray leading
space at the start of each paragraph, since reader view drops the numeral's
generated content but keeps the text node. The nbsp exists only to separate
two verses inside one paragraph, so it is no longer emitted when the
numeral is first in its paragraph.

**These two are worth remembering as a pair: Vigil's DOM is read by more
than Vigil.** Reader views and read-aloud engines extract it, and empty
elements and orphan fragments confuse them in ways that are invisible in
the app itself.

## Read aloud (built 2026-08-27)

Vigil speaks for itself rather than relying on the browser to do it. The
reason is not preference: iOS Safari has no read-aloud at all, every iOS
browser is forced onto WebKit so Edge's desktop Read Aloud is a different
implementation there — and it never managed this page — and Chrome/Edge on
Android worked but read whatever happened to be in the text layer. The
installed app on a phone is where Vigil is actually read, so that is the
case that has to work.

`Listen` in the bottom bar. `speechSynthesis`, one utterance per verse.

- **The queue comes from the chapter DATA, never the DOM.** `verseQueue()`
  runs `flattenChapter`, the same function the search corpus uses, so
  headings, numerals and the colophon are absent *by construction* rather
  than by suppression. This is why the read-aloud gotchas above and this
  feature do not have to agree about anything.
- **One utterance per verse, not per chapter.** Long utterances get
  truncated or silently dropped by several engines, and per-verse
  granularity is what makes highlighting possible at all.
- **`.vt` wraps each verse's TEXT** — not the numeral, not the drop cap.
  In paragraph layout a `.pg` holds many verses, so highlighting the
  paragraph would light up most of the screen. Leaving `.vn` and `.cap` as
  direct children keeps `.pg > .vn:first-child` and the cap's float
  working; a bare inline span is layout-neutral, verified box-for-box
  against the previous build. A verse of poetry spans several blocks, so
  `curV` persists across them and every `.vt[data-vt=N]` lights together.
- **It rolls into the next chapter** so listening does not stop every few
  minutes. `speakAdvance()` awaits `open()`, which means a Stop — or a
  fresh Listen — can land mid-flight. **Every exit from it checks the
  sequence, not just the success path.** The first version only guarded the
  success path, so a stale advance's failure called `speakStop()` and
  silently killed the session the user had just started.
- **Word following.** `SpeechSynthesisUtterance` fires `boundary` events
  with a character offset, so the word being spoken is highlighted inside
  the verse highlight, the way Edge's own Read Aloud does. Three things
  make it work:

  - **The utterance text is taken from the DOM, not the queue.** The
    queue's copy is whitespace-normalised and the DOM's is not, so offsets
    would drift. `verseTextMap()` walks the verse's text nodes, records
    where each begins, and speaks exactly that string. Verified equal to
    the queue text for plain, poetic and words-of-Jesus verses.
  - **A verse of poetry is several elements in several paragraphs**, and
    there is no whitespace node between two `<p>`s. Concatenating raw gave
    `"shepherd;I shall not want"` — which the engine then *said* that way,
    so this was an audio bug as much as a highlighting one. A separator is
    added to the string only; the next node's recorded start accounts for
    it and a word never begins on it, so offsets stay exact.
  - **No DOM mutation.** The highlight is a `Range` painted through the CSS
    Custom Highlight API. Wrapping words in spans mid-utterance would
    invalidate the very offsets the boundary events are still counting
    against.

  **Not every engine fires `boundary`** — iOS Safari historically does not,
  and network voices often skip it — so word following is a bonus layered
  on the verse highlight, never the only feedback. If it is silent on a
  device, that is the engine, not a bug to chase.

- `open()` stops the reading whenever the chapter changes to something
  `speakAdvance` did not ask for, which covers the picker, search results,
  swipes and the prev/next buttons in one place.
- A wake lock is held while speaking, and released only if the reading took
  it — the user's own "keep the screen awake" setting is left alone.
- Returning from the background resumes: iOS kills the utterance while
  `Speech.on` stays true, which would otherwise leave "Stop" over silence.
- Voices load asynchronously in both Safari and Chrome, hence
  `voiceschanged`. A local voice is preferred over a network one, and a
  stored `voiceURI` that no longer exists falls back rather than failing.
- iOS requires the first `speak()` to happen inside a user gesture. The
  Listen button is that gesture, so nothing special is needed — but any
  future attempt to start speech automatically will be silently dropped.

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

- **Read-aloud: everything that is not scripture is DRAWN, not written.**
  The reading column is built so that the page's text layer contains the
  chapter and nothing else. Edge's Read Aloud extracts page text, so anything
  that is a real text node gets spoken. Drawn from `data-t` via `::before`:
  the running head (`.ref-line`), section headings (`.hd`), Hebrew subtitles
  (`.sub`), the closing `◆` (`.close-mark`), and the whole colophon. Verse
  numerals use `data-n` — see the next entry.

  Two characters were the audible symptom. **`·` is U+00B7 MIDDLE DOT and
  speech engines pronounce it "dot"** — it sat in the running head and the
  colophon separator, so a chapter began and ended with a spoken "dot". The
  other was the colophon's link text: "berean.bible" reads as "berean dot
  bible".

  **The colophon is drawn too, and that is safe here specifically.** The
  usual objection — a legally required ESV notice must not depend on a
  stylesheet — does not apply, because Vigil's stylesheet is INLINE in
  `index.html`. There is no separate file that can fail to load while the
  ESV text still shows. The notice stays visible in full, the esv.org link
  keeps a real `href` and gains an `aria-label` so it has a real accessible
  name despite generated visible text. **If Vigil ever grows an external
  stylesheet, this trade collapses and the notice must go back to being a
  text node.**

  **Generated content covers only one of the two extraction paths.** It
  keeps text out of `innerText`, which is what desktop Read Aloud reads —
  but Chromium exposes `::before` content to the ACCESSIBILITY TREE, and a
  reader built on that tree speaks it anyway. So the running head, the `◆`
  and the colophon separator also carry `aria-hidden="true"`: they are
  decoration or duplicated in the chrome, so nothing is lost. Section
  headings and the copyright notice are deliberately NOT aria-hidden — a
  screen reader user should still get them.

  Each of these needs a separator in the text layer where the drawn element
  used to provide one, or the words on either side fuse. See the nbsp note
  below; the colophon has the same problem between the name and the link.

- **Verse numerals are CSS generated content, and that is functional.**
  `.vn::before,.cap::before{content:attr(data-n)}`, with the spans carrying no
  numeral text of their own. The reason is read-aloud: Edge's Read Aloud (and
  any "read this page to me" feature) extracts the page's TEXT, so as text
  nodes the numbers get spoken between every verse — "one In the beginning
  two And the earth" — which makes a chapter unlistenable.

  Measured in both Chrome and Edge on 2026-08-27, because the obvious fixes
  do nothing: `aria-hidden` leaves the numeral in `innerText` (Read Aloud is
  not a screen reader and does not consult ARIA), and CSS `speak:never` is
  unimplemented everywhere. Generated content was the only lever that moved
  it. Screen readers still announce the numbers, since Chromium exposes
  pseudo-element text to the accessibility tree — which is the outcome we
  want: quiet for Read Aloud, intact for assistive tech.

  Three things are load-bearing and coupled, so do not change one alone:

  1. **`data-n` is not `data-v`.** `data-v` is what `landOn()` anchors to. On
     the drop cap they differ: `data-v` is verse 1, `data-n` is the CHAPTER.
  2. **The nbsp inside `.vn`, and `margin-right:0`.** With the numeral gone
     from the text layer, two verses in one paragraph fuse — "the LORDAnd he
     said" — because `afterMark` suppresses the following run's leading
     space. The span carries a `\u00a0` to separate them. It must be
     non-breaking: a plain space adds a line-break opportunity right after
     the numeral, which orphans it at a line end, and it collapses. Its
     width (3.30px) replaces the old `.32em` margin (3.39px); restoring that
     margin would double the gap.
  3. **Verse numbers off hides `::before`, not the span.** `display:none` on
     `.vn` would take the nbsp with it and fuse the verses again. This also
     fixes a bug that predates all of the above: with numerals off, the old
     build ran verses together visually too — "the earth.The earth was".

- **Text inputs must never be smaller than 16px.** Safari on iOS auto-zooms
  the page when a field below that takes focus, and it does not zoom back on
  blur — the reader is left magnified with text running off the right and the
  fixed chrome out of reach. It looked ESV-specific when first reported
  (2026-08-26) only because the API-key field was the sole text input in that
  flow; the search field had the same defect. Nothing but the computed
  font-size prevents it: a transform or a scaled wrapper will not, and
  `maximum-scale=1` on the viewport "fixes" it by disabling pinch-zoom for
  everyone, which is worse. This is also a reminder that a bug reported as
  "happens on X" may just be "X is where you touch the broken control".
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
  bar-style` is `black-translucent`, and it cannot be re-pointed at runtime
  once a home-screen app has launched, so it cannot follow the theme.
  `theme-color` IS updated live, which covers Safari-in-a-tab and Android.
  **Checked on device 2026-08-26: light mode reads fine, so leave this
  alone.** It was raised as a likely problem — white clock on vellum — and
  the prediction was simply wrong. Anyone tempted to "fix" it by switching to
  `default` would give up the edge-to-edge bleed in dark mode to solve a
  problem that does not exist.
- Gilt is not the same value in both themes. On black it is
  `hsl(41 …% …%)` derived from L; on vellum it is a fixed, much darker
  `hsl(38 66% 28%)`, because the L-derived gold falls to 3.9:1 on a light
  ground. Verse numbers and the drop cap are set in it, so it has to hold.
