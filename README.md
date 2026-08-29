# Vigil

A Bible for reading in the dark.

**[vigil.bible](https://vigil.bible)**

One HTML file. No build step, no framework, no tracking, no account. Open it,
add it to your home screen, read.

## The idea

The brief was "a truly dark mode", so the background is pure `#000000` — no
panels, no gradients, no elevated grey surfaces that glow at 2am on an OLED
screen. The text is warm parchment rather than white, and both its brightness
and its warmth are yours to dial down, nearly to candlelight.

There is a light mode too, added later. It is the same manuscript read by
daylight rather than a second product: the ground is vellum, the ink is
iron-gall brown-black, and the page tops out at 97% lightness — because a
pure-white page at night is the thing this app exists to avoid.

## Reading

- **Tap the middle** of the screen to show or hide the controls; they dissolve
  on their own while you read.
- **Swipe or use the arrows** to turn chapters.
- **Settings** holds Theme, Brightness and Warmth; type Size, Line height,
  Column width and Face; Verse numbers, Layout and Words of Jesus; plus keeping
  the screen awake.
- **Read aloud** speaks the chapter in your device's own voice, and there is a
  plainer *listening layout* for browsers whose built-in read-aloud is better
  than the web's.
- **Offline**: download a book and it stays on the device, readable and
  searchable with no signal.

## Translations

**51 English translations are free and need nothing from you** — the Berean
Standard Bible, the KJV, the World English Bible and many more, all public
domain or freely licensed, via [HelloAO](https://bible.helloao.org/docs). These are
the ones that can be saved for offline reading.

**Four more are licensed, and need a key of your own:**

| Translation | Where the key comes from |
|---|---|
| ESV | [api.esv.org](https://api.esv.org) — free for personal use |
| Amplified, The Message, NLT | [api.bible](https://api.bible) — free Starter tier |

Two things follow from them being licensed, and neither is a limitation Vigil
invented: they are **read live and cannot be saved for offline reading**, and
each carries its publisher's copyright notice at the foot of the chapter.

API.Bible's free tier lets you choose **any three** licensed Bibles in their
dashboard — NIV and NASB are on the menu too. Vigil reads the list from your
key rather than hardcoding it, so whichever three you pick are the three you
get. Paste the key under Settings → Translation.

## Search

Three engines, because the translations are not alike, and the sheet tells you
which one you are using:

- **Saved books** are searched on the device. The query never leaves the phone.
- **The ESV** is searched at Crossway.
- **Amplified, Message and NLT** are searched at API.Bible.

One surprise worth knowing about the last of these: it **matches related words
and ranks by closeness**, so searching *goodness* finds verses reading *good*,
and the best matches come first rather than Genesis-to-Revelation order. A
result can therefore appear without a highlighted word in it. That is the
search working, not failing.

## Your keys, your data

Keys are stored **on your device** and sent only to the service they belong to
— Crossway for the ESV, API.Bible for the other three. They are never sent
anywhere else, and this project has no server to send them to.

Settings, your last position and any downloaded books live in the browser's own
storage on that device. Nothing syncs, nothing is collected, there is no
analytics of any kind.

What does leave your device, so it is stated rather than buried: chapter
requests to whichever source that translation comes from; search queries, as
above; and for the API.Bible translations only, a usage report to their Fair
Use Management System. That last one is a condition of the licence — it is how
the American Bible Society accounts to publishers for texts it does not own —
and it carries a random device id that identifies nobody.

## Install

Open [vigil.bible](https://vigil.bible), then Share → Add to Home Screen on
iOS, or Install from the menu on Android. It runs full-screen and works
offline.

Settings → About shows which build you are running and can update it in one
tap.

## Copyright

Every licensed text carries its publisher's required notice **inside the app**,
where the text is actually read — Crossway's in full under Settings →
Translation, and each API.Bible publisher's at the foot of the chapter it
belongs to.

This file deliberately does not reproduce those notices. They are exact legal
strings, a second copy would drift from the first, and the wording differs
between the one Crossway publishes on its permissions page and the one that
governs an API key holder. `CLAUDE.md` explains which applies and why.

In short: the ESV is © Crossway; the Amplified, The Message and the NLT are
delivered by [API.Bible](https://api.bible), a service of the American Bible
Society, on behalf of their publishers. The other 51 translations are public
domain or under their own free licences, shown with each text.

## Contributing / forking

Vigil is one file — `index.html` — plus a service worker and a manifest. Open
it in a browser and you are running it; there is nothing to install.

**`CLAUDE.md` in this repo is the source of truth** for design intent, the
block contract every text source normalises into, the licensing constraints,
and a long list of things that look like bugs but are decisions. It is written
for whoever edits the code next, and it is worth reading before changing
anything — most of what looks arbitrary in here was arrived at the hard way.
