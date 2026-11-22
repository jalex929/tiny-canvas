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
  await expect(page.getByText("Saved in this browser")).toBeVisible();

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
  await expect(page.getByRole("radio", { name: /Neon/ })).toBeChecked();
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

test("drawings persist across reloads and show on the shelf", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await page.getByLabel("Drawing title").fill("Sunset doodle");
  await drawSquiggle(page);
  await expect(page.getByText("Saved in this browser")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Drawing title")).toHaveValue("Sunset doodle");
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(500);

  // Regression: a reopened drawing must not overwrite strokes drawn after it loads.
  const before = await inkedPixels(page);
  await drawSquiggle(page, 0.25);
  await page.waitForTimeout(1500);
  expect(await inkedPixels(page)).toBeGreaterThan(before);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await page.getByRole("button", { name: "My drawings" }).click();
  await page.getByRole("button", { name: "Open Sunset doodle" }).click();
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
  await page.getByRole("button", { name: /^Brush/ }).click();
  await page.getByRole("radio", { name: "Hearts" }).check();
  await page.getByRole("button", { name: /Effects/ }).click();
  await page.getByRole("radio", { name: "Mirror ×4" }).check();
  await expect(page.getByRole("button", { name: /Effects/ })).toContainText("Mirror ×4");
  await page.getByRole("button", { name: "Close tools" }).click();
  await expect(page.getByRole("button", { name: /Brush/ })).toContainText("Hearts");
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

test("Shift draws a straight line, and the Line button locks it to an angle", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  const box = (await page.getByTestId("drawing-canvas").boundingBox())!;
  const wobble = async () => {
    await page.mouse.move(box.x + 250, box.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(box.x + 250 + i * 30, box.y + 300 + (i % 2 ? 40 : -40));
    }
    await page.mouse.up();
  };

  // Horizontal lock via the Line button menu: a zigzag becomes a flat line.
  await page.getByRole("button", { name: /Line angle/ }).click();
  await page.getByRole("radio", { name: "Horizontal" }).click(); // picking closes the menu
  await expect(page.getByRole("button", { name: "Line angle: Horizontal" })).toBeVisible();
  await page.keyboard.press("l");
  await wobble();
  const flat = await inkBounds(page);
  expect(flat.height).toBeLessThan(30); // just the pen width, no zigzag
  await page.keyboard.press("l");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.keyboard.down("Shift");
  await wobble();
  await page.keyboard.up("Shift");
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(300);
});

test("canvas shape can change, keeps the drawing, and can be undone", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop");
  // Less-used settings live in collapsible sections; the closed section shows the value.
  await expect(page.getByText("Lines, pen & canvas")).toBeVisible();
  await page.getByText("Lines, pen & canvas").click();
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
