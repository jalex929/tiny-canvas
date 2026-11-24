# Backlog

Ideas for Tiny Canvas that aren't built yet. Newest first.

## Retro mode (optional 90s look)

**Status (2026-11-22): the look is built** (`src/retro.css`, the "90s" toggle in the top bar, "90s look" in the phone menu, remembered per device, test-covered). Still to do: the optional sounds below, and a Retro loop for the Lab card.

Owner idea (2026-11-22). Tiny Canvas is pitched as being "for 90s kids who miss Kid Pix and want
a grown-up version". A Retro mode would lean into that nostalgia as an optional theme, while the
default look stays clean, accessible and consistent with the portfolio.

- **What it is:** a toggle (remembered per device) that reskins the app with general 90s
  desktop-computer style that belongs to no one product: chunky beveled buttons, a pixel-style
  heading font (an open-licensed one from Google Fonts), bright primary colors, dithered
  pattern fills on panels, a checkered or patterned stage behind the paper.
- **Optional fun:** playful synthesized sound effects for tools (a "boing" on stamps and
  hearts, a click on shapes, a whoosh on undo), off by default, no audio files.
- **Not:** a copy of Kid Pix or any other program. No recreated toolbars, icons, cursors,
  sounds or layouts from a specific product; the joke lives in the copy, the look is the era.
- **Must keep:** every control reachable by keyboard, text contrast at WCAG AA in both looks,
  state never shown by color alone, reduced motion respected, the same layout and tool
  positions so switching looks doesn't relearn the app.
- **Showcase:** once built, a short Retro-mode loop for the jayfox.design Lab card.

## Phone layout review (Jay, 2026-11-24, not started)

Jay's notes from using it on a phone:

- **Background color is too spread out.** It sits under Effects as a row of swatches and then a
  separate any-color picker. Idea: one square you tap to choose the background, which opens the
  swatches and the picker together (like the brush color).
- **Kaleidoscope ×22 overflows** in the Effects tab at the bottom of the screen.
- **Bigger question:** is there a clearer way to present the controls on phones, so it's easy to
  know where everything is? Review the whole mobile layout (tabs, sheets, what lives where)
  before patching pieces. Check every sheet at 360px and 412px wide for overflow.
