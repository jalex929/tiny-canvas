# Tiny Canvas

A pocket sketchbook in the browser. Pick from ten brushes, turn on kaleidoscope symmetry, choose
from 40 colors or any color at all, and download your drawing as a PNG or JPG. Drawings save
themselves in your browser, with no account needed.

![Tiny Canvas](../gallery/public/previews/tiny-canvas.png)

## Features

- **Brushes:** Pen (stylus pressure), Marker (multiplies where it overlaps), Pencil (grain),
  Spray, Calligraphy (angled nib), Neon (glow), Rainbow, Sparkle (scattered shapes), Threads
  (web lines), Eraser.
- **Effects:** symmetry off / mirror / four-way / radial ×6 / kaleidoscope ×12; size; opacity;
  background color (undoable).
- **Color:** 40 named swatches, native color picker, hex entry, recent colors.
- **History:** unlimited undo/redo; Clear is undoable, with an Undo button in the toast.
- **Saving:** autosaves to this browser (IndexedDB) about 0.7 s after each change and when the
  tab is hidden. "My drawings" shelf to reopen or delete. The last drawing reopens on load.
- **Download:** PNG (optional transparent background) or JPG, at 3200 × 2400.

## Controls

| Input                                          | What it does                                                   |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Mouse/touch/pen                                | Draw. Stylus pressure changes width for Pen, Calligraphy, etc. |
| 1–9, 0                                         | Choose a brush                                                 |
| E                                              | Eraser on/off                                                  |
| [ and ]                                        | Brush size                                                     |
| Ctrl/⌘+Z, Shift+Z / Ctrl+Y                     | Undo, redo                                                     |
| Canvas focused: arrows (+Shift), Space, Escape | Keyboard drawing: move, start/finish a line, cancel            |

## How it works

- **Strokes are data.** A drawing is a list of actions in a fixed 1600 × 1200 space
  (`src/engine/types.ts`). Pixels are derived. That makes undo/redo pure list operations
  (`history.ts`), resizing lossless, saves small, and export resolution-independent.
- **Deterministic texture.** Spray, pencil, sparkle and threads use a seeded PRNG stored on the
  stroke, so a stroke looks identical after undo, reload or export.
- **Rendering** (`render.ts`): a visible canvas, a cache of finished strokes (a new stroke is
  added incrementally; undo rebuilds), and a scratch layer. See-through or blending strokes are
  painted on the scratch layer and composited once, clipped to the stroke's bounds, so
  overlaps inside one stroke don't darken. Symmetry is a list of affine matrices.
- **Engine/UI boundary.** `src/engine` has no React. `src/storage` holds the `DrawingStore`
  interface and an IndexedDB implementation. `src/ui` + `App.tsx` handle input and layout.
- **High-DPI:** backing store is CSS size × devicePixelRatio (capped at 2.5).

## Tests

- **Unit (Vitest, 38):** history (25-step undo/redo, redo branch dropped, clear undoable,
  no-op actions ignored, immutability); symmetry math; smoothing and resampling; color
  conversions; every brush draws and re-draws identically (recorded against a fake context);
  isolated strokes composite once; IndexedDB save/list/get/delete; validation of corrupt saved
  data; App reopens the last drawing exactly once; keyboard brush shortcuts; saving-unavailable
  message.
- **Browser (Playwright, `e2e/tiny-canvas.spec.ts`):** draw → undo → redo → clear → undo clear;
  keyboard brush selection + keyboard drawing; PNG and JPG downloads; persistence across reload
  and reopening from the shelf (including a regression check that new strokes survive the
  reload); phone emulation (Pixel 7): no horizontal scroll, touch tap draws.

**Tested so far:** headless Chromium on Windows, at 1440 × 900 and emulated Pixel 7.
**Not yet tested:** real phones, iPad/Apple Pencil, Safari, Firefox, a screen reader pass, or
an automated accessibility scan. Treat accessibility as designed-for, not audited.

## Known limitations

- Saved drawings live only in the browser profile that made them; clearing site data deletes
  them. Download to keep a copy.
- Undo re-renders every stroke. Fine at hundreds of strokes; not measured beyond that.
- Keyboard drawing makes straight-segment lines; it's an alternative, not an equal.
- Multi-touch is ignored while drawing (no pinch zoom or pan yet).
- Fonts load from Google Fonts; offline, the system fallback fonts are used.

## Next improvements (not started)

Real-device pass (phone + stylus), short demo recording, zoom/pan, stroke replay, layers.
