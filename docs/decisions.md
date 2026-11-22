# Decisions

Moved from the creative-lab repo on 2026-11-22; earlier entries are summarized.

- **Strokes are data.** A drawing is a list of actions (stroke, clear, background, canvas
  shape) in document coordinates; pixels are derived. Undo/redo is list slicing, resizing
  and export are lossless, saves are small.
- **Canvas 2D, three layers** (visible, cached finished strokes, scratch) plus two live
  layers for the stroke in progress.
- **Incremental drawing.** Brushes paint in units with per-unit seeded randomness so a
  stroke in progress repaints only its tip. Measured 2–5 ms per frame on long strokes.
- **No accounts.** Drawings save to IndexedDB in the visitor's browser; download as PNG/JPG
  or share via the system share sheet. Storage sits behind a `DrawingStore` interface.
- **Relative paths.** Builds with `base: "./"` so the site works at any URL or sub-path.
- **Hosting:** published from Bolt (Netlify). The portfolio may embed or link it later.
- **License:** not chosen yet, so all rights are reserved by default. Choose before
  inviting reuse.
