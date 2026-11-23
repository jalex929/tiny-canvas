# Decisions

How Tiny Canvas was set up on purpose: what was decided, why, and what was left out. Each
decision says who made it:

- **Jay's call:** a product or design decision Jay Fox made.
- **Proposed, approved:** suggested during the build and accepted by Jay.
- **Build default:** an engineering choice made while building it, kept because it worked.
  Open to change.

Tiny Canvas was designed by Jay Fox and built with an AI coding assistant (Claude) as a pair
programmer. Jay set the direction, reviewed every change in the browser, and made the calls
marked below.

## What it is for

A small, fun drawing toy, not a serious art tool. The pitch, in Jay's words: a drawing toy for
90s kids who miss Kid Pix and want a grown-up version. It lives in the Lab on
[jayfox.design](https://jayfox.design/lab), where it also shows how Jay works: design and
engineering in one person, with accessibility built in.

## Product decisions

**Just for fun, so no accounts and no gallery** (Jay's call). An earlier version kept a list
of saved drawings ("My drawings"). Jay removed it: the current drawing saves itself in the
browser so a reload doesn't lose it, and anything worth keeping is downloaded as a PNG or JPG.
That means no sign-up, no server and nothing to store about anyone. The trade-off: clearing
site data deletes the drawing.

**Joke in the words, not in the look** (Jay's call). The Kid Pix line is in the copy only.
Nothing copies Kid Pix's toolbar, icons, sounds or layout. The optional 90s mode is general
90s-desktop style (beveled gray panels, a pixel font, a dithered background) that belongs to
no one product.

**90s mode is optional and off by default** (Jay's idea; the switch, boot animation and gentle
exit were refined over several rounds of Jay's feedback). The clean look stays the default so
the app matches the portfolio and stays calm. The 90s mode keeps the same layout and controls,
so switching never means relearning the app.

**Sound is optional and off by default** (Jay's call to add both sets and a speaker button).
Two synthesized sets, one chunky and bleepy for 90s mode and one soft for the clean look. No
audio files, so nothing to license or download. Off by default because surprise sound in a
browser tab is unwelcome.

**One drawing at a time with a name you can change** (Jay's call). The header shows "Tiny
Canvas" with the drawing's name under it, and the pencil renames it. The name becomes the
download's file name.

**The floating line tool was removed** (Jay's call) once Line lived in the Draw panel, so the
canvas has nothing floating over it.

**Phone first-class, not an afterthought** (Jay's call, after several usability passes). On
phones the canvas fills the screen and tools live in a bottom drawer (Draw, Color, Effects,
Canvas). The drawer was condensed so it takes about a third of the screen, symmetry is one
swipeable row, and nothing runs off a 320 px screen in either look.

**Back link goes to the Lab** (Jay's call), not the portfolio home, because that's where
people came from.

**Open source under MIT** (Jay's call, 2026-11-22). Anyone can read, reuse or learn from it.

## Design decisions

**Navy and yellow, left-aligned** (Jay's call). The clean look uses Jay's portfolio identity:
navy `#000052` and yellow, with left-aligned text and a strong grid rather than centered
layouts.

**Accessibility as a baseline** (Jay's call). Every control works by keyboard, state is never
shown by color alone (a check mark or outline as well), reduced motion is respected, and text
contrast was measured in both looks. The 90s mode's help popover and title bar were fixed after
an audit found them below WCAG AA.

**Share card and Lab loop show the kaleidoscope** (Jay's call). The kaleidoscope is the most
"wow" moment, so it leads the share image and the looping Lab card, on a light cream
background so it doesn't read as dark mode.

## Engineering decisions

**Strokes are data** (build default). A drawing is a list of actions (stroke, clear,
background, canvas shape) in a fixed 1600 × 1200 space; pixels are derived. Undo and redo are
list operations, resizing and export lose nothing, and saves are small.

**Canvas 2D in layers** (build default): a visible canvas, a cache of finished strokes, a
scratch layer, plus live layers for the stroke in progress.

**Fast drawing at any stroke length** (build default, measured). Brushes paint in small units
with randomness seeded per unit, so a stroke in progress repaints only its tip. Measured 2–5 ms
per frame on a 1000-point stroke (was up to ~200 ms). A unit test checks that painting a
stroke in pieces gives the same pixels as painting it at once, for every brush.

**Saves in the browser** (build default, shaped by Jay's no-accounts call). The current
drawing is kept in IndexedDB behind a small `DrawingStore` interface, so the storage could
change later without touching the drawing code.

**Relative paths** (build default). Built with `base: "./"`, so it runs at any address, which
is what lets it live at `jayfox.design/lab/tiny-canvas/`.

**Where it's hosted** (proposed, approved). Inside the portfolio rather than on its own site:
the portfolio's sync script builds this repo and copies it to `/lab/tiny-canvas/`, published
with the portfolio through Bolt (Netlify). The short address `jayfox.design/tiny-canvas`
redirects there (Jay's request).

## Deliberately not done

- No accounts, cloud saves, sharing links or a gallery (just for fun; see above).
- No layers, custom canvas sizes or stroke replay yet (in the backlog, not started).
- No imitation of a specific product's look or sounds.

## Honest limits

- Tested in headless Chromium on Windows (desktop and an emulated Pixel 7 and iPhone SE).
  **Not yet tested** on real phones, iPad or Apple Pencil, Safari or Firefox, or with a screen
  reader by hand. Accessibility is designed for, not audited.
- Pen pressure was only tested with emulated input.
- The drawing lives in one browser; clearing site data deletes it.
