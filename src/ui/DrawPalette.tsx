import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BRUSHES } from "../engine/brushes";
import { SHAPE_INFO, SHAPE_KINDS, shapePoints, type ShapeKind } from "../engine/shapes";
import type { BrushId } from "../engine/types";
import { BrushPreview } from "./BrushPreview";
import { Icon } from "./Icon";
import { brushShortcut, type Tool } from "./Panels";

/** Brush groups in the palette, in even pairs; the last group is tools. */
const GROUPS: { label: string; brushes: BrushId[] }[] = [
  { label: "Ink", brushes: ["pen", "pencil", "marker", "calligraphy"] },
  { label: "Paint & glow", brushes: ["spray", "neon"] },
  { label: "Playful", brushes: ["sparkle", "hearts", "pattern", "rainbow"] },
];

interface Props {
  tool: Tool;
  brush: BrushId;
  color: string;
  options: Record<BrushId, Record<string, number>>;
  onBrush: (id: BrushId) => void;
  onTool: (tool: Tool) => void;
  shapeKind: ShapeKind;
  onShapeKind: (kind: ShapeKind) => void;
  shapeFilled: boolean;
  onShapeFilled: (filled: boolean) => void;
}

/** A shape's outline drawn by the same code that draws it on the canvas. */
export function ShapeIcon({ kind, size = 24 }: { kind: ShapeKind; size?: number }) {
  const points = shapePoints(kind, { x: 3, y: 3 }, { x: 29, y: 29 });
  const d = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shape-icon">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Everything you draw with, in one place: brushes, then tools (shape, fill, spirograph,
 * eraser). Shape opens a small menu to choose which shape and whether it's filled.
 */
export function DrawPalette(props: Props) {
  const { tool, brush, color, options, onBrush, onTool } = props;
  const [shapeMenu, setShapeMenu] = useState(false);
  const shapeButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** The brush tile is highlighted only while the brush tool is in use. */
  const activeBrush = tool === "brush" ? brush : null;
  /** Where the floating menu sits (desktop); phones show it as a card above the tab bar. */
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const isPhone =
    typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 900px)").matches;

  // The tools panel crops anything that spills out of it, so the menu is rendered at the
  // top of the page and placed next to the Shape button: below it if there's room, above
  // it if not, and always inside the window.
  useLayoutEffect(() => {
    if (!shapeMenu || isPhone) return;
    const place = () => {
      const button = shapeButton.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!button || !menu) return;
      const gap = 6;
      const left = Math.min(Math.max(8, button.left), window.innerWidth - menu.width - 8);
      const below = button.bottom + gap;
      const top =
        below + menu.height <= window.innerHeight - 8
          ? below
          : Math.max(8, button.top - gap - menu.height);
      setMenuPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [shapeMenu, isPhone]);

  useEffect(() => {
    if (!shapeMenu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        setShapeMenu(false);
        shapeButton.current?.focus();
        return;
      }
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !shapeButton.current?.contains(target)) {
        setShapeMenu(false);
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    // Move focus into the menu so keyboard users land on the choices.
    menuRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [shapeMenu]);

  const brushTile = (id: BrushId) => (
    <button
      key={id}
      type="button"
      className="draw-tile"
      aria-pressed={activeBrush === id}
      onClick={() => onBrush(id)}
      title={BRUSHES[id].hint}
    >
      <BrushPreview brush={id} color={id === "eraser" ? "#000052" : color} options={options[id]} />
      <span className="draw-tile__label">
        {BRUSHES[id].label}
        {brushShortcut(id) && <kbd aria-hidden="true">{brushShortcut(id)}</kbd>}
      </span>
    </button>
  );

  const toolTile = (id: Tool, label: string, icon: React.ReactNode, key: string, extra = {}) => (
    <button
      type="button"
      className="draw-tile draw-tile--tool"
      aria-pressed={tool === id}
      onClick={() => onTool(id)}
      {...extra}
    >
      <span className="draw-tile__icon">{icon}</span>
      <span className="draw-tile__label">
        {label}
        <kbd aria-hidden="true">{key}</kbd>
      </span>
    </button>
  );

  return (
    <section className="draw-palette" aria-labelledby="draw-heading">
      <h2 id="draw-heading" className="panel__heading">
        Draw
      </h2>
      {GROUPS.map((group) => (
        <div key={group.label} className="draw-group" role="group" aria-label={group.label}>
          <h3 className="draw-group__label" aria-hidden="true">
            {group.label}
          </h3>
          <div className="draw-grid">{group.brushes.map(brushTile)}</div>
        </div>
      ))}
      <div className="draw-group" role="group" aria-label="Tools">
        <h3 className="draw-group__label" aria-hidden="true">
          Tools
        </h3>
        <div className="draw-grid">
          <div className="draw-tile-wrap">
            <button
              ref={shapeButton}
              type="button"
              className="draw-tile draw-tile--tool"
              aria-pressed={tool === "shape"}
              aria-haspopup="dialog"
              aria-expanded={shapeMenu}
              aria-label={`Shape: ${SHAPE_INFO[props.shapeKind].label}, ${props.shapeFilled ? "filled" : "outline"}. Choose a shape`}
              onClick={() => {
                onTool("shape");
                setShapeMenu((open) => !open);
              }}
            >
              <span className="draw-tile__icon">
                <ShapeIcon kind={props.shapeKind} />
              </span>
              <span className="draw-tile__label">
                Shape
                <span className="draw-tile__more" aria-hidden="true" />
                <kbd aria-hidden="true">U</kbd>
              </span>
            </button>
            {shapeMenu &&
              createPortal(
                <div
                  ref={menuRef}
                  className={`shape-menu ${isPhone ? "shape-menu--phone" : "shape-menu--floating"}`}
                  role="dialog"
                  aria-label="Choose a shape"
                  style={
                    isPhone
                      ? undefined
                      : menuPos
                        ? { left: menuPos.left, top: menuPos.top }
                        : { visibility: "hidden" }
                  }
                >
                  <fieldset className="shape-menu__kinds">
                    <legend className="panel__heading">Shape</legend>
                    {SHAPE_KINDS.map((k) => (
                      <label key={k} className="shape-menu__kind">
                        <input
                          type="radio"
                          name="shape-kind"
                          checked={props.shapeKind === k}
                          onChange={() => props.onShapeKind(k)}
                          onClick={() => setShapeMenu(false)}
                          onKeyDown={(e) => e.key === "Enter" && setShapeMenu(false)}
                        />
                        <span>
                          <ShapeIcon kind={k} size={26} />
                          <small>{SHAPE_INFO[k].label}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="segmented-row">
                    <legend className="visually-hidden">Style</legend>
                    {(
                      [
                        [false, `Outline with ${BRUSHES[brush].label}`],
                        [true, "Filled"],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={String(value)} className="segmented-row__option">
                        <input
                          type="radio"
                          name="shape-style"
                          checked={props.shapeFilled === value}
                          onChange={() => props.onShapeFilled(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>,
                document.body,
              )}
          </div>
          {toolTile("fill", "Fill", <Icon name="bucket" />, "G")}
          {toolTile("spiro", "Spirograph", <Icon name="spiro" />, "S")}
          {brushTile("eraser")}
        </div>
      </div>
    </section>
  );
}
