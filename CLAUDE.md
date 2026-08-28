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
  for service worker scope.
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
2. **Modern translations — NIV, NASB, The Message.** Via an API.Bible
   adapter; see "Wanted: NIV, NASB, The Message". Register for their free
   Starter tier and confirm those three are selectable *before* any code.
3. Hebrew and Greek. Scouted, further out.
4. **Desktop full screen.** All that is left of the larger-screens item
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

## Wanted: NIV, NASB, The Message — via API.Bible

Scouted 2026-08-27. These are commercially licensed and are **not** on
HelloAO, which carries 51 English translations, all public domain or
freely licensed, and none of these. There is no back door: the route is a
licence.

**API.Bible (American Bible Society) is that route.** It carries NIV,
NASB, The Message, NLT, NKJV, CSB, Amplified and GNT under one agreement,
via publisher partnerships with Biblica, Lockman, HarperCollins, Tyndale
and others. Plans, read off their pricing page:

- **Starter — $0.** Creative Commons and public-domain Bibles, plus (per
  their docs) a choice of **up to 3 licensed Bibles for non-commercial
  use**. **5,000 API calls per MONTH**, no overage protection.
- **Pro — $29+/month** for copyrighted Bibles generally; individual
  commercial licences from $10/month per translation.
- "Strictly non-commercial use. No ads, fees, freemium models or upsells."
  Vigil qualifies today and would have to keep qualifying.
- Note in their own footnote: *NIV commercial use is not available.*

**The call budget is the thing to design around, and it is tight.**
Crossway gives 5,000 a *day*; API.Bible's free tier gives 5,000 a *month*
— about 165 chapter loads a day, and `prefetchNeighbours` spends 2-3 calls
per turn. Copyrighted text also cannot be stored, so there is no offline
path to take the pressure off: every read is a call. Prefetch may need to
be off for these translations.

**Before writing any code:** register for Starter, confirm those three are
actually among the selectable licensed Bibles, and read their caching and
attribution rules. Neither was verifiable from the public pages, and both
shape the adapter — the ESV taught us that the terms are where the real
design constraints live, not the docs.

Architecturally this is the **third source adapter**, which the block
contract already anticipates: emit `{blocks, bookName, chapters, credit}`
and change no rendering path. One adapter would unlock the whole catalogue
at once, so the work is per-source, not per-translation. Offline download
must be disabled for licensed texts, exactly as it is for the ESV, and
each publisher will have its own required notice for `credit.note`.

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
