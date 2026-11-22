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

## Pass 5 (2026-11-22): one Draw palette, a handleable spirograph, phone check

| #   | Finding / request                                                                                                                                 | Change                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Brush/Shape/Fill/Spiro were a separate switch above the brushes.                                                                                  | One Draw palette: brushes, then Tools (Shape ▾ menu, Fill, Spirograph, Eraser). Picking any tile is what you draw with.                              |
| 2   | The spirograph ring couldn't be repositioned or resized.                                                                                          | Dashed frame with corner handles to resize and a grip below the ring to move it (keyboard: arrows). Moving/resizing keeps your place in the pattern. |
| 3   | Turning felt steppy.                                                                                                                              | The wheel glides toward the pointer each frame (line stays on the exact curve); visible gear teeth spin as it rolls.                                 |
| 4   | Spiral ×6 looked like Radial ×6.                                                                                                                  | Spiral now trails inward (30° per copy, 15% smaller). Added Tunnel, Bloom, Quilt and Echo.                                                           |
| 5   | Fill should recolor fills and lines.                                                                                                              | Works from what you see; taps on a line's soft edge snap to the line. Browser test checks refill and line recolor leave each other alone.            |
| 6   | Phone: "Draw" appeared three times; tiles were huge; the shape menu was clipped; the move handle hid the pen; the hint stayed over a placed ring. | Single heading, first group renamed Ink, four tiles per row, shape menu floats above the tab bar, move grip below the ring, hint hides.              |
| 7   | Desktop spirograph settings overflowed the panel.                                                                                                 | Shown as a slim bar over the canvas. Measured 0 px overflow at 1366 × 768 in every tool and tab.                                                     |

## Pass 6 (2026-11-22): phone, measured

Method: an automated audit on an emulated iPhone SE (375 px) and Pixel 7 that walks every tab,
menu and tool, flagging tap targets under 32 px, text under 11 px, and controls whose centre is
covered by something else; plus screenshots of each state.

| #   | Finding                                                                                             | Change                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The two-finger tip covered the tab bar for several seconds after the first stroke.                  | Messages appear under the header on phones, and taps pass through them (except their Undo button).                                |
| 2   | Small targets: back link 28 px, Outline/Filled 28 px tall, smoothing/pressure 27 px, sliders 24 px. | All at least 36–44 px on phones. Audit now finds none under 32 px.                                                                |
| 3   | Small text: tile labels 10.5 px on iPhone SE, shape names 9.5 px, ratios 10 px.                     | 11.5–12 px; the phone shape menu uses three per row so names are full size.                                                       |
| 4   | Picking Spirograph left its settings scrolled out of view at the top of the sheet.                  | The sheet scrolls to the top whenever the tool changes.                                                                           |
| 5   | The Download button had no accessible name on phones (its text is hidden there).                    | Named "Download" on every size; browser test checks all phone header buttons have names.                                          |
| 6   | Shape icons didn't show whether shapes would be outlined or filled; "Outline with Pen" was noisy.   | Icons draw filled or outlined to match; the option just says "Outline".                                                           |
| 7   | Requests: Line under Tools, dashed lines, an even symmetry grid.                                    | Line tool (L) with Solid / Dashed / Dotted for any brush; Pick color tile keeps Tools in pairs; Diagonal symmetry makes 12 modes. |

## Pass 7 (2026-11-22): desktop, measured

Method: automated audit at 1024 × 768, 1280 × 720, 1366 × 768 and 1920 × 1080 (sideways scroll,
panel overflow, targets under 24 px, text under 11 px, covered controls, unnamed buttons) plus a
keyboard walk through 69 tab stops checking each shows a focus ring; a text-overflow scan over
every tile at six sizes; screenshots.

Already good: no sideways scroll, every control named, a visible focus ring on every stop.

| #   | Finding                                                             | Change                                                                                       |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Right panel overflowed 16 px at 1280 × 720.                         | Flatter symmetry previews on screens under 760 px tall.                                      |
| 2   | At 1024 px the header wrapped to two rows, pushing the canvas down. | One row from 901–1180 px: Clear / New / My drawings become named icon buttons with tooltips. |
| 3   | At 1024 px shortcut badges crowded tile labels.                     | Badges hidden in the narrower tools panel (shortcuts stay under "?").                        |
| 4   | At 1024 px "New ring" spilled out of the spirograph bar.            | The bar wraps into two rows at medium widths.                                                |
| 5   | "Show guides" was a 17 px tall target.                              | At least 24 px.                                                                              |
| 6   | Reaching the canvas by keyboard took many Tab presses.              | "Skip to canvas" is the first stop (test-covered).                                           |
