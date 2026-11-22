# Tiny Canvas

A pocket sketchbook in the browser. Pick from twelve brushes in four groups, turn on kaleidoscope symmetry, choose
from 40 colors or any color at all, and download your drawing as a PNG or JPG. Drawings save
themselves in your browser, with no account needed.

![Tiny Canvas](../gallery/public/previews/tiny-canvas.png)

## Features

- **Brushes (grouped):** _Draw_: Pen, Pencil (darker with pressure), Marker (multiplies
  where it overlaps), Calligraphy. _Paint & glow_: Spray, Neon, Rainbow. _Playful_: Sparkle,
  Hearts, Pattern (zigzag, waves, dots, candy stripes), Threads. _Clean up_: Eraser.
- **Brush options:** nib angle (Calligraphy), density (Spray), glow (Neon), spacing and
  scatter (Sparkle, Hearts), style and scale (Pattern), web (Threads). Stored per stroke, so
  re-renders and saved drawings keep them. Tile previews update live.
- **Canvas shapes:** Square, Landscape 4:3, Portrait 3:4, Wide 16:9, Tall 9:16 (~2 MP each).
  New drawings start portrait (3:4) on phones and 4:3 on larger screens. Changing shape is undoable
  and keeps the drawing centered.
- **Straight lines:** hold Shift (snaps when within 6° of flat, upright or 45°), or use the
  Line hotspot: hold it with one thumb while drawing, or tap to lock it on (L). Angle choices:
  any, horizontal, vertical, 45° up, 45° down.
- **Pen pressure:** Apple Pencil / Surface Pen / Wacom / Android stylus pressure via Pointer
  Events. Full pressure = full brush size, lightest touch = 15%. Curves: Soft, Normal, Firm,
  Off; readings are smoothed. Once a stylus is detected, "Only the pen draws" (on by default)
  makes fingers pan and zoom instead of drawing (palm rejection).
- **Effects:** symmetry off / mirror / mirror ×4 / radial ×6 / kaleidoscope ×12, each shown as a
  picture drawn by the engine; optional guide lines on the canvas (never exported); size; opacity;
  background color (undoable).
- **Color:** 40 named swatches, native color picker, hex entry, recent colors.
- **History:** unlimited undo/redo; Clear is undoable, with an Undo button in the toast.
- **Saving:** autosaves to this browser (IndexedDB) about 0.7 s after each change and when the
  tab is hidden. "My drawings" shelf to reopen or delete. The last drawing reopens on load.
- **Zoom and pan:** 100–800%. Pinch on touch screens; trackpad pinch or Ctrl+scroll; scroll
  to pan; middle-mouse drag; Hand tool (H); + / − / F keys; zoom buttons on the canvas.
- **Phone layout (≤900px wide):** full-screen canvas with a bottom drawer (Brush, Color,
  Effects) and Undo/Redo within thumb reach. The drawer pushes the canvas up rather than
  covering it.
- **Quick controls:** size/opacity always visible (top of the desktop panel; a bar above the
  phone tabs). Two-finger tap undoes, three-finger tap redoes. Eyedropper: "Pick from drawing"
  or Alt+click. Less-used settings are collapsible on desktop. See
  [docs/ux-review-tiny-canvas.md](../../docs/ux-review-tiny-canvas.md).
- **Share:** on phones and tablets, "Share or save to Photos" opens the system share sheet.
- **Download:** PNG (optional transparent background) or JPG, at twice the canvas size
  (e.g. 3200 × 2400 for landscape, 2800 × 2800 for square).

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
- A second finger turns a stroke into a pinch: strokes under 0.3 s old are dropped, older ones
  are kept. Two-finger tap-to-undo isn't implemented.
- While zooming, the view is briefly stretched from the last render, then re-rendered sharply.
- Pressure was tested with emulated input only; not yet on a real stylus.
- Changing canvas shape trims marks that fall outside the new edges (Undo restores them).
- Fonts load from Google Fonts; offline, the system fallback fonts are used.

## Next improvements (not started)

Real-device pass (phone + stylus), short demo recording, stroke replay, layers, custom canvas
size.
