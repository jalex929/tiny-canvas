# Working in tiny-canvas

Public repo. Read `README.md` and `docs/decisions.md` first.

- Drawing logic lives in `src/engine` (plain TypeScript, no React) and is tested there.
  Every brush must paint in units so that painting in pieces equals painting at once
  (a unit test enforces this); keep randomness seeded per unit.
- Keep the incremental live-drawing path fast: measure before and after brush changes.
- Left-aligned, navy (#000052) / yellow (#FFD23F) identity; never show state by color alone;
  every control reachable by keyboard; respect reduced motion.
- READMEs say what was tested and what wasn't. No secrets, no private data.
- Before pushing: `npm run check`, and `npm run test:e2e` when the UI changed.
- If Bolt is used to publish: Bolt sync can delete files it doesn't have. After any Bolt
  save, pull and run `npm run check` before more work.
