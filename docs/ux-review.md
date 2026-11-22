# Tiny Canvas UX review (2026-11-22)

A pass over the drawing experience on desktop and phone after the first round of features.
Method: walkthroughs of the main tasks (start drawing, change brush/size/color, fix a mistake,
change the canvas, save/share) in desktop Chrome and an emulated Pixel 7, plus a review of the
layout code. No user testing yet, so these are expert-review findings, not observed behavior.

## Findings and what changed

| #   | Finding                                                                                              | Severity | Change                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Size and opacity, the most-changed settings, took two taps on phones (Effects sheet).                | High     | Always-visible size/opacity bar above the phone tabs, with a dot preview in the current color. Desktop: size/opacity moved to the top of the right panel.                                                                     |
| 2   | Undo on phones needed a reach to a button; drawing apps have trained a two-finger tap.               | High     | Two-finger tap = undo, three-finger tap = redo, with a one-time tip after the first stroke and an "Undone" toast so it's never silent. A pinch that barely moves still counts as a tap; any real movement is treated as zoom. |
| 3   | No way to reuse a color already in the drawing.                                                      | Medium   | Eyedropper: "Pick from drawing" in the Color panel (tap the canvas next), or Alt+click on desktop. Partly see-through ink is blended over the paper so you get the color you see.                                             |
| 4   | Desktop settings panel was one long scroll with equal visual weight for rare settings.               | Medium   | Symmetry, Background and Canvas & pen are collapsible sections that show their current value while closed and remember open/closed per browser.                                                                               |
| 5   | Phones "download" files, but people usually want the image in Photos or a chat.                      | Medium   | "Share or save to Photos" in the Download menu where the system share sheet supports images. Download stays for desktop and as a fallback.                                                                                    |
| 6   | On phones, brush options were below 12 tiles, so tweaking the brush you just picked meant scrolling. | Medium   | Phone Brush sheet shows the selected brush's options first.                                                                                                                                                                   |
| 7   | Portrait screens wasted space with a landscape (and then square) canvas.                             | Medium   | New drawings start portrait (3:4) on phones, landscape (4:3) on desktop.                                                                                                                                                      |
| 8   | Neon looked like a hard-edged line with a stark core.                                                | Low      | Layered glow: wide faint halo, soft tube, blurred pale core; larger default size.                                                                                                                                             |
| 9   | First-run hint card covered much of a phone canvas.                                                  | Low      | Smaller card on phones.                                                                                                                                                                                                       |

## Deferred (worth doing next)

- **Real-device test** on an iPhone, an Android phone and an iPad with Apple Pencil. Pressure,
  palm rejection, Share and multi-finger taps are verified only with emulated input.
- **Hold-to-sample** (long press) as a second eyedropper gesture on phones.
- **Undo history limit / performance** check with very large drawings (hundreds of spray strokes).
- **Light usability test** with 3–5 people on phones: can they find size, undo, line tool and
  shape without help? Record what they try first.

## Pass 2 (2026-11-22)

Same method: walkthroughs on desktop (1366 × 768) and an emulated iPhone 13, from fresh
screenshots.

| #   | Finding                                                                                                               | Severity | Change                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | With a phone sheet open, the canvas shrank to a sliver and the hint card, zoom pill and Line button piled up on it.   | High     | Sheet capped at 38% of the screen; floating controls and the hint step aside while a sheet is open.                                   |
| 2   | Phone header was four look-alike circle icons; the grid icon didn't read as "My drawings", and Clear sat next to New. | High     | Phone header is title, a "More" menu with labelled items (New drawing, My drawings, and Clear canvas set apart in red), and Download. |
| 3   | Zoom +/− and the Hand tool duplicated pinch and two-finger drag on phones.                                            | Medium   | Removed on phones; a "Fit · 140%" chip appears only when zoomed in.                                                                   |
| 4   | The Line button covered drawing space bottom-left on phones.                                                          | Medium   | Compact round thumb target with a small angle badge; a yellow dot shows when it's locked on.                                          |
| 5   | The first-run hint was a large card covering the page.                                                                | Medium   | A small one-line note at the top-left, hidden while a sheet is open.                                                                  |
| 6   | The Effects tab read "Symmetry" even when symmetry was off.                                                           | Low      | Shows "None" or the active mode.                                                                                                      |
| 7   | The drawing title didn't look editable.                                                                               | Low      | Dotted underline, tooltip, and a pencil icon on phones.                                                                               |
| 8   | Neon's flat ends looked cut off.                                                                                      | Low      | Rounded caps at the start and end only (not between runs, which would glow brighter).                                                 |

## Pass 3 (2026-11-22): tools and settings layout

| #   | Finding / request                               | Change                                                                                                                                                            |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No way to fill areas or draw shapes.            | Brush / Shape / Fill tools (B / U / G). Shapes use the current brush or fill solid; fill is a stored mask, so it is exact at any zoom.                            |
| 2   | Spirograph requested.                           | Spirograph shape with real gear ratios (wheel teeth set the loop count) and pen hole.                                                                             |
| 3   | Line tool angle menu was more than people need. | One Line button: any angle, soft snap to flat, upright and 45°.                                                                                                   |
| 4   | More playful mirroring requested.               | Spiral and Tile modes; 2–16 copies for radial, kaleidoscope and spiral.                                                                                           |
| 5   | Background choice was limited.                  | 12 presets plus any color; picker drags collapse into one undo step.                                                                                              |
| 6   | Right panel needed long scrolling on laptops.   | Size/opacity pinned; Color / Symmetry / Paper / Pen tabs. Measured 0 px of overflow in every tab at 1366 × 768. Shortcuts moved to the bottom of the tools panel. |
| 7   | Brush groups were uneven.                       | Threads retired from the picker; Rainbow moved to Playful, so groups come in pairs.                                                                               |

## Pass 4 (2026-11-22): compact panels and a real spirograph

| #   | Request / finding                                                                 | Change                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Brush tiles too tall; options and shape settings pushed the panel into scrolling. | Flatter tiles, brush options collapse to a one-line summary, one-row shape picker, compact brush strip for Shape/Spirograph. Measured 0 px overflow at 1366 × 768 in every tool. |
| 2   | Symmetry is a favorite; it shouldn't hide in a tab.                               | Pinned under size/opacity on desktop: one row of tiles, mode named in the heading, guides toggle beside it. Tabs are now Color / Paper / Pen.                                    |
| 3   | Fill tolerance levels weren't needed.                                             | One default (former "Normal").                                                                                                                                                   |
| 4   | Spirograph should work like the real toy.                                         | Its own tool: place a ring, see the wheel, turn it by dragging; the pen draws as far as you turn. Wheels and pen holes swap like the toy; "Draw full pattern" for the impatient. |
