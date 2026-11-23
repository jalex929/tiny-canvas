import { expect, test, type Page } from "@playwright/test";

async function drawSquiggle(page: Page, offset = 0) {
  const canvas = page.getByTestId("drawing-canvas");
  const box = (await canvas.boundingBox())!;
  const x0 = box.x + box.width * 0.2;
  const y0 = box.y + box.height * (0.4 + offset);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(x0 + i * (box.width / 35), y0 + Math.sin(i / 3) * box.height * 0.12);
  }
  await page.mouse.up();
}

/** Counts non-background pixels on the visible canvas. */
async function inkedPixels(page: Page) {
  return page.getByTestId("drawing-canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
    return n;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("draw, undo, redo, clear and undo the clear", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse-driven flow; phone layout is checked separately");
  await expect(page.getByText("Draw anywhere.")).toBeVisible();
  await drawSquiggle(page);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);
});

test("toolbar works from the keyboard, including drawing", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow");
  await page.keyboard.press("6"); // Neon
  await expect(page.getByRole("button", { name: /^Neon/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("radio", { name: "Cobalt" }).check();

  const canvas = page.getByTestId("drawing-canvas");
  await canvas.focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+ArrowRight");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);

  await page.keyboard.press("Control+z");
  await expect.poll(() => inkedPixels(page)).toBe(0);
});

test("downloads PNG and JPG", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await drawSquiggle(page);
  for (const [label, ext] of [
    ["PNG", "png"],
    ["JPG", "jpg"],
  ] as const) {
    await page.getByRole("button", { name: "Download" }).click();
    await page.getByRole("radio", { name: new RegExp(label) }).check();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${label}` }).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`[.]${ext}$`));
  }
});

test("the current drawing survives a reload; Clear starts fresh and can be undone", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "covered on desktop");
  await page.getByLabel("Drawing title").fill("Sunset doodle");
  await drawSquiggle(page);
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Drawing title")).toHaveValue("Sunset doodle");
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);

  // Regression: a reopened drawing must not overwrite strokes drawn after it loads.
  const before = await inkedPixels(page);
  await drawSquiggle(page, 0.25);
  await page.waitForTimeout(1500);
  expect(await inkedPixels(page)).toBeGreaterThan(before);

  // Clear starts fresh, and can be undone.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);
});

test("phone layout has no horizontal scroll and touch drawing works", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone only");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(20);
});

test("zoom in, draw, pan with the hand tool, fit again", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop controls");
  const zoomLevel = page.getByRole("button", { name: /^Zoom \d+%/ });
  await expect(zoomLevel).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoomLevel).toHaveText("156%");
  await drawSquiggle(page);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);
  await expect(page.getByRole("button", { name: "Clear" })).toBeEnabled();

  // Hand tool drags move the view instead of drawing.
  await page.keyboard.press("h");
  await expect(page.getByRole("button", { name: /Hand tool/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 260, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Clear" })).toBeDisabled(); // only one stroke existed

  await page.keyboard.press("f");
  await expect(zoomLevel).toHaveText("100%");
});

test("phone drawer: starts portrait; pick hearts and a symmetry, then draw", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone only");
  await expect(page.getByRole("button", { name: /^Canvas/ })).toContainText("Portrait");
  await page.getByRole("button", { name: /^Draw/ }).click();
  await page.getByRole("button", { name: /^Hearts/ }).click();
  await page.getByRole("button", { name: /Effects/ }).click();
  await page.getByRole("radio", { name: "Mirror ×4" }).check();
  await expect(page.getByRole("button", { name: /Effects/ })).toContainText("Mirror ×4");
  await page.getByRole("button", { name: "Close tools" }).click();
  await expect(page.getByRole("button", { name: /^Draw/ })).toContainText("Hearts");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/** Bounding box (device px) of everything drawn on the visible canvas. */
async function inkBounds(page: Page) {
  return page.getByTestId("drawing-canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! === 0) continue;
      const y = Math.floor((i - 3) / 4 / c.width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { height: maxY - minY };
  });
}

test("The Line tool and Shift both draw straight lines", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  // A zigzag that ends level with where it started: straight-line mode turns it flat.
  const zigzag = async () => {
    await page.mouse.move(box.x + 250, box.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(box.x + 250 + i * 30, box.y + 300 + (i === 12 ? 0 : i % 2 ? 40 : -40));
    }
    await page.mouse.up();
  };

  await page.keyboard.press("l"); // the Line tool
  await zigzag();
  expect((await inkBounds(page)).height).toBeLessThan(30); // just the pen width
  await page.keyboard.press("b"); // back to the brush

  await page.getByRole("button", { name: "Undo" }).click();
  await page.keyboard.down("Shift");
  await zigzag();
  await page.keyboard.up("Shift");
  expect((await inkBounds(page)).height).toBeLessThan(30);
});

test("canvas shape can change, keeps the drawing, and can be undone", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  // Settings are in tabs; the Paper tab shows the current shape even before opening it.
  await expect(page.getByRole("tab", { name: /Paper/ })).toContainText("Landscape");
  await page.getByRole("tab", { name: /Paper/ }).click();
  await expect(page.getByRole("radio", { name: "Landscape, 4:3" })).toBeChecked();
  await drawSquiggle(page);
  await page.getByRole("radio", { name: "Square, 1:1" }).check();
  await expect(page.getByText("Canvas is now square.")).toBeVisible();
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("2800 × 2800 pixels")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("radio", { name: "Landscape, 4:3" })).toBeChecked();
});

test("eyedropper picks a color from the drawing", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  await page.getByRole("radio", { name: "Tomato" }).check();
  await page.getByRole("slider", { name: /^Size/ }).fill("60");
  await drawSquiggle(page);
  await page.getByRole("radio", { name: "Lab navy" }).check();
  // Arm it from the Color panel, then click the stroke's starting point.
  await page.getByRole("button", { name: "Pick from drawing" }).click();
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.4);
  await expect(page.getByRole("radio", { name: "Tomato" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Pick from drawing" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("phone: two-finger tap undoes, three-finger tap redoes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  const canvas = page.getByTestId("drawing-canvas");
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(20);

  // Playwright's touchscreen is single-finger, so send the pointer events a browser would.
  const multiTap = (fingers: number) =>
    canvas.evaluate((el, count) => {
      const r = el.getBoundingClientRect();
      const send = (type: string, id: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 100 + id,
            pointerType: "touch",
            isPrimary: id === 0,
            clientX: r.left + 60 + id * 50,
            clientY: r.top + 80,
            bubbles: true,
            cancelable: true,
          }),
        );
      for (let i = 0; i < count; i++) send("pointerdown", i);
      for (let i = 0; i < count; i++) send("pointerup", i);
    }, fingers);

  await multiTap(2);
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await expect(page.getByText("Undone")).toBeVisible();
  await multiTap(3);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(20);
});

test("size ring shows the real brush size, and recent colors survive a reload", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  const slider = page.getByRole("slider", { name: /^Size/ });
  await slider.fill("80");
  const ring = page.locator(".stage__size-preview");
  await expect(ring).toBeVisible();
  const width = (await ring.boundingBox())!.width;
  expect(width).toBeGreaterThan(30); // 80 document px at fit zoom
  await expect(ring).toBeHidden({ timeout: 3000 });

  await page.getByRole("radio", { name: "Teal" }).check();
  await page.getByRole("radio", { name: "Grape" }).check();
  await page.reload();
  await expect(page.getByRole("button", { name: "Use Grape" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use Teal" })).toBeVisible();
});

test("shapes and the fill tool", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  const drag = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 });
    await page.mouse.up();
  };

  // A tap with the shape tool draws nothing; a drag draws the outline.
  await page.getByRole("button", { name: /^Shape/ }).click();
  await page.getByRole("radio", { name: "Rectangle" }).click(); // picking closes the menu
  await expect(page.getByRole("dialog", { name: "Choose a shape" })).toBeHidden();
  await page.mouse.click(box.x + 300, box.y + 300);
  await expect(page.getByRole("button", { name: "Clear" })).toBeDisabled();
  await drag(150, 150, 350, 300);
  const outline = await inkedPixels(page);
  expect(outline).toBeGreaterThan(300);

  // Filling inside the rectangle covers far more than its outline did.
  await page.keyboard.press("g");
  await page.getByRole("radio", { name: "Lab yellow" }).check();
  await page.mouse.click(box.x + 250, box.y + 225);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(outline * 5);
  // Filling it again with the same color changes nothing and says so.
  await page.mouse.click(box.x + 250, box.y + 225);
  await expect(page.getByText("That area is already this color.")).toBeVisible();
});

test("symmetry copies are adjustable", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  // Symmetry is always visible (no tab to open).
  await page.getByRole("radio", { name: "Radial" }).check();
  const copies = page.getByRole("slider", { name: /^Copies/ });
  await copies.fill("9");
  await expect(page.getByText("Radial ×9").first()).toBeVisible();
  await page.getByRole("radio", { name: "Tile" }).check();
  await expect(copies).toBeHidden();
});

test("background can be any color, and a picker drag is one undo step", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  await page.getByRole("tab", { name: /Paper/ }).click();
  const hex = page.getByLabel("Background hex color code");
  for (const value of ["#ff00aa", "#ff22bb", "#ff44cc"]) {
    await hex.fill(value);
    await hex.press("Enter");
  }
  const paper = page.locator(".stage__paper");
  await expect(paper).toHaveCSS("background-color", "rgb(255, 68, 204)");
  // Three quick changes count as one step, so one Undo goes back to white.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(paper).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("spirograph: place a ring, turn the wheel by dragging, draw the full pattern", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "Draw full pattern" })).toBeDisabled();

  // Tap places a medium ring; nothing is drawn yet.
  await page.mouse.click(cx, cy);
  await expect(page.getByRole("button", { name: "Draw full pattern" })).toBeEnabled();
  await expect(page.locator(".spiro-overlay__wheel")).toBeVisible();
  expect(await inkedPixels(page)).toBe(0);

  // Turning the wheel part way draws part of the pattern, as one undo step.
  await page.mouse.move(cx, cy - 150);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    const a = -Math.PI / 2 + (i / 30) * Math.PI;
    await page.mouse.move(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150);
  }
  await page.mouse.up();
  const partial = await inkedPixels(page);
  expect(partial).toBeGreaterThan(200);

  await page.getByRole("button", { name: "Draw full pattern" }).click();
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(partial * 3);

  await page.getByRole("button", { name: "New ring" }).click();
  await expect(page.locator(".spiro-overlay__wheel")).toHaveCount(0);
});

test("fill recolors a filled area and recolors a line, each without touching the other", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  const canvas = page.getByTestId("drawing-canvas");
  const box = (await canvas.boundingBox())!;
  const colorAt = (x: number, y: number) =>
    canvas.evaluate(
      (el, [px, py]) => {
        const c = el as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        const s = c.width / r.width;
        const d = c
          .getContext("2d")!
          .getImageData(Math.round(px! * s), Math.round(py! * s), 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      [x, y],
    );

  // A thick navy ring.
  await page.getByRole("slider", { name: /^Size/ }).fill("14");
  await page.getByRole("button", { name: /^Shape/ }).click();
  await page.getByRole("radio", { name: "Ellipse" }).click();
  await page.mouse.move(box.x + 200, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 350, { steps: 8 });
  await page.mouse.up();
  const lineX = 200; // the middle of the ellipse's left edge
  const lineY = 250;
  const inside = [300, 250] as const;

  await page.keyboard.press("g");
  await page.getByRole("radio", { name: "Lab yellow" }).check();
  await page.mouse.click(box.x + inside[0], box.y + inside[1]);
  await expect.poll(() => colorAt(...inside)).toEqual([255, 210, 63]);

  // Refill the same area pink: the area changes, the navy line stays.
  await page.getByRole("radio", { name: "Bubblegum" }).check();
  await page.mouse.click(box.x + inside[0], box.y + inside[1]);
  await expect.poll(() => colorAt(...inside)).toEqual([255, 111, 181]);
  expect(await colorAt(lineX, lineY)).toEqual([0, 0, 82]);

  // Dump teal on the line itself: the line changes, the pink inside stays.
  await page.getByRole("radio", { name: "Teal" }).check();
  await page.mouse.click(box.x + lineX, box.y + lineY);
  await expect.poll(() => colorAt(lineX, lineY)).toEqual([46, 196, 182]);
  expect(await colorAt(...inside)).toEqual([255, 111, 181]);
});

test("spirograph ring can be moved and resized with its handles", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  await page.keyboard.press("s");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const frame = page.locator(".spiro-frame");
  const before = (await frame.boundingBox())!;

  const move = (await page.getByRole("button", { name: /Move ring/ }).boundingBox())!;
  await page.mouse.move(move.x + move.width / 2, move.y + move.height / 2);
  await page.mouse.down();
  await page.mouse.move(move.x + move.width / 2 - 80, move.y + move.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  const moved = (await frame.boundingBox())!;
  expect(moved.x).toBeCloseTo(before.x - 80, -1);
  expect(moved.width).toBeCloseTo(before.width, 0);

  // Keyboard: the corner handle grows the ring.
  await page.getByRole("button", { name: /bottom right corner/ }).focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect((await frame.boundingBox())!.width).toBeGreaterThan(moved.width + 5);
});

/** Text that sticks out of its tile (ellipsis-truncated text is allowed). */
async function overflowingText(page: Page) {
  return page.evaluate(() => {
    const tiles = document.querySelectorAll(
      ".draw-tile, .shape-menu__kind > span, .symmetry-tile__body, .segmented-row__option > span, .chip > span, .panel-tabs__tab, .drawer__tab, .shape-tile__body, .picker, .button",
    );
    const bad: string[] = [];
    for (const tile of tiles) {
      const box = tile.getBoundingClientRect();
      if (box.width === 0) continue;
      const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement!;
        if (!node.textContent?.trim() || parent.closest(".visually-hidden")) continue;
        if (getComputedStyle(parent).textOverflow === "ellipsis") continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const t = range.getBoundingClientRect();
        if (t.width && (t.right > box.right + 1 || t.left < box.left - 1)) {
          bad.push(node.textContent.trim());
        }
      }
    }
    return bad;
  });
}

test("no tile text spills out of its tile", async ({ page, isMobile }) => {
  expect(await overflowingText(page)).toEqual([]);
  if (isMobile) {
    await page.getByRole("button", { name: /^Draw/ }).click();
    expect(await overflowingText(page)).toEqual([]);
    await page.getByRole("button", { name: /^Effects/ }).click();
    expect(await overflowingText(page)).toEqual([]);
    await page.getByRole("button", { name: /^Canvas/ }).click();
  } else {
    await page.getByRole("tab", { name: /Paper/ }).click();
    expect(await overflowingText(page)).toEqual([]);
    await page.getByRole("tab", { name: /Pen/ }).click();
  }
  expect(await overflowingText(page)).toEqual([]);
  if (isMobile) await page.getByRole("button", { name: /^Draw/ }).click();
  await page.getByRole("button", { name: /^Shape/ }).click();
  expect(await overflowingText(page)).toEqual([]);
});

test("line tool draws solid, dashed and dotted lines", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  const drawLine = async () => {
    await page.mouse.move(box.x + 120, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 620, box.y + 300, { steps: 6 });
    await page.mouse.up();
  };
  await page.getByRole("button", { name: /^Line/ }).click();
  await page.getByRole("slider", { name: /^Size/ }).fill("10");
  await drawLine();
  const solid = await inkedPixels(page);
  expect(solid).toBeGreaterThan(1000);

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("radio", { name: "Dashed" }).check();
  await drawLine();
  const dashed = await inkedPixels(page);
  expect(dashed).toBeGreaterThan(solid * 0.4);
  expect(dashed).toBeLessThan(solid * 0.85); // gaps

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("radio", { name: "Dotted" }).check();
  await drawLine();
  expect(await inkedPixels(page)).toBeLessThan(dashed);

  // Pick color lives in Tools too.
  await page.getByRole("button", { name: /^Pick color/ }).click();
  await expect(page.getByRole("button", { name: /^Pick color/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("phone header buttons all have names (icon-only on small screens)", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone only");
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^More/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Back to/ })).toBeVisible();
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByRole("button", { name: /Download PNG/ })).toBeVisible();
});

test("keyboard: Skip to canvas is the first stop and lands on the canvas", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to canvas" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("drawing-canvas")).toBeFocused();
});

test("medium desktop width keeps the header on one row with named icon buttons", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  await page.setViewportSize({ width: 1024, height: 768 });
  const header = (await page.locator(".topbar").boundingBox())!;
  expect(header.height).toBeLessThan(90);
  for (const name of ["Clear", "Download"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
});

test("90s mode: a visible switch that turns on, is remembered after a reload, and turns off", async ({
  page,
}) => {
  // The look changes partway through the switch animation, so wait for it.
  const look = () => expect.poll(() => page.evaluate(() => document.documentElement.dataset.look));
  const toggle = page.getByRole("switch", { name: /90s/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await look().toBe("clean");
  await toggle.click();
  await look().toBe("retro");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await look().toBe("retro");
  await page.getByRole("switch", { name: /90s/ }).click();
  await look().toBe("clean");
});
