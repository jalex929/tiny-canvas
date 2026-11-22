import { useState, type ReactNode } from "react";
import { BRUSHES } from "../engine/brushes";
import { normalizeHex } from "../engine/color";
import { PRESSURE_CURVES, PRESSURE_INFO, type PressureCurve } from "../engine/pressure";
import { SMOOTHING_INFO, SMOOTHING_LEVELS, type SmoothingLevel } from "../engine/stabilizer";
import { SHAPE_INFO, SHAPE_KINDS, shapePoints, type ShapeKind } from "../engine/shapes";
import { SPIRO_WHEELS, spiroLoops } from "../engine/spiro";
import {
  MAX_SYMMETRY_COUNT,
  MIN_SYMMETRY_COUNT,
  SYMMETRY_INFO,
  symmetryLabel,
} from "../engine/symmetry";
import {
  BRUSH_GROUPS,
  BRUSH_IDS,
  CANVAS_SHAPES,
  SYMMETRY_MODES,
  type BrushId,
  type CanvasShapeId,
  type SymmetryMode,
} from "../engine/types";
import { BrushPreview } from "./BrushPreview";
import { Icon } from "./Icon";
import { BACKGROUNDS, PALETTE, colorName } from "./palette";
import { SymmetryPreview } from "./SymmetryPreview";

export const SIZE_MIN = 2;
export const SIZE_MAX = 160;

/** Number-key shortcut for each brush; the eraser uses E. */
export function brushShortcut(id: BrushId): string {
  if (id === "eraser") return "E";
  const index = BRUSH_IDS.indexOf(id);
  return index === 9 ? "0" : index < 9 ? String(index + 1) : "";
}

export function BrushPicker({
  brush,
  color,
  options,
  onChange,
  compact = false,
}: {
  /** Shape and Spirograph tools: a small strip of brush previews, no labels or groups. */
  compact?: boolean;
  brush: BrushId;
  color: string;
  options: Record<BrushId, Record<string, number>>;
  onChange: (id: BrushId) => void;
}) {
  return (
    <section
      aria-labelledby="brushes-heading"
      className={compact ? "brush-picker brush-picker--compact" : "brush-picker"}
    >
      <h2 id="brushes-heading" className="panel__heading">
        {compact ? "Line brush" : "Brushes"}
        {compact && <span className="panel__heading-value">{BRUSHES[brush].label}</span>}
      </h2>
      <div className="brush-groups" role="radiogroup" aria-labelledby="brushes-heading">
        {BRUSH_GROUPS.map((group) => (
          <div key={group.label} className="brush-group" role="group" aria-label={group.label}>
            <h3 className="brush-group__label" aria-hidden="true">
              {group.label}
            </h3>
            <div className="brush-grid">
              {group.brushes.map((id) => (
                <label key={id} className="brush-tile" title={BRUSHES[id].hint}>
                  <input
                    type="radio"
                    name="brush"
                    value={id}
                    checked={brush === id}
                    onChange={() => onChange(id)}
                    aria-label={BRUSHES[id].label}
                    aria-describedby={`brush-hint-${id}`}
                  />
                  <span className="brush-tile__body">
                    <BrushPreview
                      brush={id}
                      color={id === "eraser" ? "#000052" : color}
                      options={options[id]}
                    />
                    <span className="brush-tile__label">
                      {BRUSHES[id].label}
                      {brushShortcut(id) && <kbd aria-hidden="true">{brushShortcut(id)}</kbd>}
                    </span>
                  </span>
                  <span id={`brush-hint-${id}`} className="visually-hidden">
                    {BRUSHES[id].hint}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Sliders (or choices) for the selected brush's own settings. */
const OPTIONS_OPEN_KEY = "tiny-canvas:brush-options-open";

export function BrushOptionsPanel({
  brush,
  values,
  onChange,
  collapsible = false,
}: {
  brush: BrushId;
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  /** Desktop: a one-line summary you open when you want it, to save space. */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPTIONS_OPEN_KEY) === "open";
    } catch {
      return false;
    }
  });
  const specs = BRUSHES[brush].options;
  if (specs.length === 0) return null;
  const summary = specs
    .map((spec) => {
      const value = values[spec.key] ?? spec.default;
      return `${spec.label} ${spec.format(value)}`;
    })
    .join(" · ");
  const body = (
    <>
      {specs.map((spec) => {
        const value = values[spec.key] ?? spec.default;
        if (spec.choices) {
          return (
            <fieldset key={spec.key} className="choice-row">
              <legend>{spec.label}</legend>
              <div className="chips">
                {spec.choices.map((choice, index) => (
                  <label key={choice} className="chip">
                    <input
                      type="radio"
                      name={`option-${brush}-${spec.key}`}
                      checked={Math.round(value) === index}
                      onChange={() => onChange(spec.key, index)}
                    />
                    <span>{choice}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        return (
          <label key={spec.key} className="slider">
            <span className="slider__label">
              {spec.label} <span className="slider__value">{spec.format(value)}</span>
            </span>
            <input
              type="range"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={value}
              onChange={(e) => onChange(spec.key, Number(e.target.value))}
            />
          </label>
        );
      })}
      <button
        type="button"
        className="button button--quiet button--small"
        onClick={() => specs.forEach((spec) => onChange(spec.key, spec.default))}
      >
        Reset to default
      </button>
    </>
  );
  if (collapsible) {
    return (
      <details
        className="control brush-options brush-options--collapsible"
        open={open}
        onToggle={(e) => {
          const next = (e.currentTarget as HTMLDetailsElement).open;
          setOpen(next);
          try {
            localStorage.setItem(OPTIONS_OPEN_KEY, next ? "open" : "closed");
          } catch {
            /* per-viewer convenience only */
          }
        }}
      >
        <summary className="brush-options__summary">
          <span className="brush-options__title">{BRUSHES[brush].label} options</span>
          <span className="brush-options__values">{summary}</span>
        </summary>
        <div className="brush-options__body">{body}</div>
      </details>
    );
  }
  return (
    <section className="control brush-options" aria-labelledby="brush-options-heading">
      <h2 className="panel__heading" id="brush-options-heading">
        {BRUSHES[brush].label} options
      </h2>
      {body}
    </section>
  );
}

export type Tool = "brush" | "shape" | "fill" | "spiro";

const TOOLS: {
  id: Tool;
  label: string;
  icon: "brush" | "shapes" | "bucket" | "spiro";
  key: string;
}[] = [
  { id: "brush", label: "Brush", icon: "brush", key: "B" },
  { id: "shape", label: "Shape", icon: "shapes", key: "U" },
  { id: "fill", label: "Fill", icon: "bucket", key: "G" },
  { id: "spiro", label: "Spiro", icon: "spiro", key: "S" },
];

/** Brush / Shape / Fill. */
export function ToolPicker({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <fieldset className="tool-picker">
      <legend className="panel__heading">Tool</legend>
      <div className="tool-picker__row">
        {TOOLS.map((t) => (
          <label key={t.id} className="tool-picker__option" title={`${t.label} (${t.key})`}>
            <input
              type="radio"
              name="tool"
              checked={tool === t.id}
              onChange={() => onTool(t.id)}
              aria-label={t.label}
            />
            <span>
              <Icon name={t.icon} />
              {t.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A shape's outline drawn by the same code that draws it on the canvas. */
function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const points = shapePoints(kind, { x: 3, y: 3 }, { x: 29, y: 29 });
  const d = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" className="shape-icon">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export function ShapePanel({
  kind,
  onKind,
  filled,
  onFilled,
  compact,
}: {
  kind: ShapeKind;
  onKind: (kind: ShapeKind) => void;
  filled: boolean;
  onFilled: (filled: boolean) => void;
  /** Phones: no keyboard hints. */
  compact: boolean;
}) {
  return (
    <div className="control shape-panel">
      <fieldset className="choice-row">
        <legend className="panel__heading">
          Shape <span className="panel__heading-value">{SHAPE_INFO[kind].label}</span>
        </legend>
        <div className="shape-kinds">
          {SHAPE_KINDS.map((k) => (
            <label key={k} className="shape-kind" title={SHAPE_INFO[k].label}>
              <input
                type="radio"
                name="shape-kind"
                checked={kind === k}
                onChange={() => onKind(k)}
                aria-label={SHAPE_INFO[k].label}
              />
              <span>
                <ShapeIcon kind={k} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="segmented-row">
        <legend className="visually-hidden">Style</legend>
        {(
          [
            [false, "Outline", "Uses your brush"],
            [true, "Filled", "Solid color"],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={label} className="segmented-row__option" title={hint}>
            <input
              type="radio"
              name="shape-style"
              checked={filled === value}
              onChange={() => onFilled(value)}
              aria-label={`${label}: ${hint}`}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {compact && <p className="control__note">Drag on the canvas.</p>}
    </div>
  );
}

/** Spirograph tool: pick the wheel and pen hole; place a ring, then turn the wheel. */
export function SpiroPanel({
  wheel,
  onWheel,
  hole,
  onHole,
  hasRing,
  onDrawFull,
  onNewRing,
}: {
  wheel: number;
  onWheel: (teeth: number) => void;
  hole: number;
  onHole: (value: number) => void;
  hasRing: boolean;
  onDrawFull: () => void;
  onNewRing: () => void;
}) {
  const wheelIndex = Math.max(0, SPIRO_WHEELS.indexOf(wheel as (typeof SPIRO_WHEELS)[number]));
  return (
    <div className="control spiro-panel">
      <h2 className="panel__heading">
        Spirograph <span className="panel__heading-value">{spiroLoops(wheel)} loops</span>
      </h2>
      {!hasRing && (
        <p className="control__note control__note--top">
          Drag on the canvas to place the ring (or tap for a medium one), then drag around it to
          turn the wheel.
        </p>
      )}
      <label className="slider">
        <span className="slider__label">
          Wheel <span className="slider__value">{wheel} teeth</span>
        </span>
        <input
          type="range"
          min={0}
          max={SPIRO_WHEELS.length - 1}
          step={1}
          value={wheelIndex}
          onChange={(e) => onWheel(SPIRO_WHEELS[Number(e.target.value)]!)}
          aria-valuetext={`${wheel}-tooth wheel, ${spiroLoops(wheel)} loops`}
        />
      </label>
      <label className="slider">
        <span className="slider__label">
          Pen hole <span className="slider__value">{Math.round(hole * 100)}%</span>
        </span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={hole}
          onChange={(e) => onHole(Number(e.target.value))}
        />
      </label>
      <div className="spiro-panel__actions">
        <button
          type="button"
          className="button button--small"
          onClick={onDrawFull}
          disabled={!hasRing}
        >
          Draw full pattern
        </button>
        <button
          type="button"
          className="button button--small button--quiet"
          onClick={onNewRing}
          disabled={!hasRing}
        >
          New ring
        </button>
      </div>
    </div>
  );
}

export function FillPanel() {
  return (
    <div className="control">
      <h2 className="panel__heading">Fill</h2>
      <p className="control__note control__note--top">
        Tap an area to fill it with your color. Fills stay inside your lines.
      </p>
    </div>
  );
}

/** Canvas shape, plus stylus settings. */
export function CanvasPanel({
  shape,
  hasMarks,
  onShape,
  pressureCurve,
  onPressureCurve,
  penOnly,
  onPenOnly,
  penDetected,
  smoothing,
  onSmoothing,
  part = "all",
}: {
  /** Which settings to show: everything (phone), the canvas shape, or pen and lines. */
  part?: "all" | "shape" | "pen";
  smoothing: SmoothingLevel;
  onSmoothing: (level: SmoothingLevel) => void;
  shape: CanvasShapeId | null;
  hasMarks: boolean;
  onShape: (id: CanvasShapeId) => void;
  pressureCurve: PressureCurve;
  onPressureCurve: (curve: PressureCurve) => void;
  penOnly: boolean;
  onPenOnly: (value: boolean) => void;
  penDetected: boolean;
}) {
  return (
    <>
      {part !== "shape" && (
        <>
          <fieldset className="control">
            <legend className="panel__heading">Smoothing</legend>
            <p className="control__note control__note--top">Steadies shaky lines.</p>
            <div className="segmented-row segmented-row--4">
              {SMOOTHING_LEVELS.map((level) => (
                <label key={level} className="segmented-row__option">
                  <input
                    type="radio"
                    name="smoothing"
                    checked={smoothing === level}
                    onChange={() => onSmoothing(level)}
                  />
                  <span>{SMOOTHING_INFO[level].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      {part !== "pen" && (
        <>
          <fieldset className="control">
            <legend className="panel__heading">Canvas shape</legend>
            <div className="shape-grid">
              {CANVAS_SHAPES.map((option) => {
                const { width, height } = option.size;
                const long = Math.max(width, height);
                return (
                  <label key={option.id} className="shape-tile">
                    <input
                      type="radio"
                      name="canvas-shape"
                      checked={shape === option.id}
                      onChange={() => onShape(option.id)}
                      aria-label={`${option.label}, ${option.ratio}`}
                    />
                    <span className="shape-tile__body">
                      <span className="shape-tile__frame" aria-hidden="true">
                        <span
                          style={{
                            width: `${(width / long) * 100}%`,
                            height: `${(height / long) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="shape-tile__label">{option.label}</span>
                      <span className="shape-tile__ratio">{option.ratio}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {hasMarks && (
              <p className="control__note">
                Changing shape keeps your drawing centered. Edges may be trimmed; Undo brings them
                back.
              </p>
            )}
          </fieldset>
        </>
      )}
      {part !== "shape" && (
        <>
          <fieldset className="control">
            <legend className="panel__heading">Pen pressure</legend>
            <p className="control__note control__note--top">
              {penDetected
                ? "✓ Stylus detected: light pressure draws thin."
                : "For Apple Pencil, Surface Pen, Wacom and other styluses."}
            </p>
            <div className="segmented-row segmented-row--4">
              {PRESSURE_CURVES.map((curve) => (
                <label
                  key={curve}
                  className="segmented-row__option"
                  title={PRESSURE_INFO[curve].hint}
                >
                  <input
                    type="radio"
                    name="pressure-curve"
                    checked={pressureCurve === curve}
                    onChange={() => onPressureCurve(curve)}
                    aria-describedby={`pressure-hint-${curve}`}
                  />
                  <span>{PRESSURE_INFO[curve].label}</span>
                  <span id={`pressure-hint-${curve}`} className="visually-hidden">
                    {PRESSURE_INFO[curve].hint}
                  </span>
                </label>
              ))}
            </div>
            <label className="check check--spaced">
              <input
                type="checkbox"
                checked={penOnly}
                onChange={(e) => onPenOnly(e.target.checked)}
              />
              <span>
                Only the pen draws
                <small> Fingers move and zoom, so your palm won&apos;t leave marks.</small>
              </span>
            </label>
          </fieldset>
        </>
      )}
    </>
  );
}

export function ColorPanel({
  color,
  hexDraft,
  onHexDraft,
  recent,
  onPick,
  eyedropper,
  onEyedropper,
}: {
  color: string;
  hexDraft: string;
  onHexDraft: (value: string) => void;
  recent: string[];
  onPick: (hex: string) => void;
  /** True while the next tap on the drawing picks a color. */
  eyedropper: boolean;
  onEyedropper: (armed: boolean) => void;
}) {
  return (
    <section className="control" aria-labelledby="color-heading">
      <h2 className="panel__heading" id="color-heading">
        Color
      </h2>
      <div className="current-color">
        <span className="current-color__chip" style={{ background: color }} aria-hidden="true" />
        <span>
          <strong>{colorName(color).replace(/^custom color.*/, "Custom")}</strong>
          <small>{color.toUpperCase()}</small>
        </span>
      </div>
      <div className="swatches" role="radiogroup" aria-labelledby="color-heading">
        {PALETTE.map((c) => (
          <label key={c.hex} className="swatch" title={c.name}>
            <input
              type="radio"
              name="color"
              value={c.hex}
              checked={color === c.hex}
              onChange={() => onPick(c.hex)}
              aria-label={c.name}
            />
            <span style={{ background: c.hex }} aria-hidden="true" />
          </label>
        ))}
      </div>
      <div className="custom-color">
        <label className="picker">
          <input
            type="color"
            value={color}
            onChange={(e) => onPick(e.target.value)}
            aria-label="Choose any color"
          />
          <span>Any color</span>
        </label>
        <form
          className="hex-field"
          onSubmit={(e) => {
            e.preventDefault();
            const hex = normalizeHex(hexDraft);
            if (hex) onPick(hex);
          }}
        >
          <label htmlFor="hex-input" className="visually-hidden">
            Hex color code
          </label>
          <input
            id="hex-input"
            value={hexDraft}
            onChange={(e) => onHexDraft(e.target.value)}
            onBlur={() => {
              const hex = normalizeHex(hexDraft);
              if (hex) onPick(hex);
              else onHexDraft(color);
            }}
            aria-invalid={normalizeHex(hexDraft) === null}
            spellCheck={false}
            autoComplete="off"
          />
        </form>
      </div>
      <button
        type="button"
        className={`button button--small eyedropper ${eyedropper ? "is-armed" : ""}`}
        aria-pressed={eyedropper}
        onClick={() => onEyedropper(!eyedropper)}
        title="Pick a color from your drawing (desktop: Alt + click)"
      >
        <Icon name="dropper" />
        <span>{eyedropper ? "Tap the drawing to pick a color" : "Pick from drawing"}</span>
      </button>
      {recent.length > 1 && (
        <div className="recent">
          <h3 id="recent-heading">Recent</h3>
          <div className="recent__row" role="group" aria-labelledby="recent-heading">
            {recent.map((hex) => (
              <button
                type="button"
                key={hex}
                className="recent__chip"
                style={{ background: hex }}
                onClick={() => onPick(hex)}
                aria-label={`Use ${colorName(hex)}`}
                aria-pressed={hex === color}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Brush size and opacity: the settings people change most, so they stay close at hand. */
export function SizePanel({
  size,
  onSize,
  opacity,
  onOpacity,
  color,
  compact = false,
}: {
  size: number;
  onSize: (value: number) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  color: string;
  /** One slim row for the phone quick bar. */
  compact?: boolean;
}) {
  const dot = Math.max(3, Math.min(compact ? 22 : 32, size / 3));
  return (
    <div className={compact ? "quickbar" : "control size-panel"}>
      <span className="size-dot" aria-hidden="true">
        <span style={{ width: dot, height: dot, background: color, opacity }} />
      </span>
      <label className="slider">
        <span className="slider__label">
          Size <span className="slider__value">{size}px</span>
        </span>
        <input
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        />
      </label>
      <label className="slider">
        <span className="slider__label">
          Opacity <span className="slider__value">{Math.round(opacity * 100)}%</span>
        </span>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          onChange={(e) => onOpacity(Number(e.target.value) / 100)}
        />
      </label>
    </div>
  );
}

export function SymmetryPanel({
  symmetry,
  onSymmetry,
  count,
  onCount,
  showGuides,
  onShowGuides,
  hideHeading = false,
  compact = false,
}: {
  /** Always-visible desktop version: one row of small tiles, mode named in the heading. */
  compact?: boolean;
  symmetry: SymmetryMode;
  onSymmetry: (mode: SymmetryMode) => void;
  count: number;
  onCount: (value: number) => void;
  showGuides: boolean;
  onShowGuides: (value: boolean) => void;
  hideHeading?: boolean;
}) {
  const guidesToggle = (
    <label className="check check--spaced">
      <input
        type="checkbox"
        checked={showGuides}
        disabled={symmetry === "none"}
        onChange={(e) => onShowGuides(e.target.checked)}
      />
      <span>
        Show guides
        {!compact && <small> Dashed lines on the canvas. They never appear in downloads.</small>}
      </span>
    </label>
  );
  const tiles = (
    <>
      <div className="symmetry-grid">
        {SYMMETRY_MODES.map((mode) => (
          <label key={mode} className="symmetry-tile" title={SYMMETRY_INFO[mode].description}>
            <input
              type="radio"
              name="symmetry"
              value={mode}
              checked={symmetry === mode}
              onChange={() => onSymmetry(mode)}
              aria-label={SYMMETRY_INFO[mode].label}
              aria-describedby={`symmetry-hint-${mode}`}
            />
            <span className="symmetry-tile__body">
              <SymmetryPreview mode={mode} ink="#000052" count={count} />
              <span className={compact ? "visually-hidden" : "symmetry-tile__label"}>
                {SYMMETRY_INFO[mode].short ?? SYMMETRY_INFO[mode].label}
              </span>
            </span>
            <span id={`symmetry-hint-${mode}`} className="visually-hidden">
              {SYMMETRY_INFO[mode].description}
            </span>
          </label>
        ))}
      </div>
      {SYMMETRY_INFO[symmetry].usesCount && (
        <label className="slider slider--spaced">
          <span className="slider__label">
            Copies <span className="slider__value">{symmetryLabel(symmetry, count)}</span>
          </span>
          <input
            type="range"
            min={MIN_SYMMETRY_COUNT}
            max={MAX_SYMMETRY_COUNT}
            value={count}
            onChange={(e) => onCount(Number(e.target.value))}
          />
        </label>
      )}
    </>
  );

  if (compact) {
    // Always-visible desktop version: heading row with the guides toggle, tiles beneath.
    return (
      <div
        className="control symmetry symmetry--compact"
        role="group"
        aria-labelledby="symmetry-heading"
      >
        <div className="symmetry__header">
          <h2 className="panel__heading" id="symmetry-heading">
            Symmetry
            <span className="panel__heading-value">
              {symmetry === "none" ? "Off" : symmetryLabel(symmetry, count)}
            </span>
          </h2>
          {guidesToggle}
        </div>
        {tiles}
      </div>
    );
  }
  return (
    <fieldset className="control symmetry">
      <legend className={hideHeading ? "visually-hidden" : "panel__heading"}>Symmetry</legend>
      {tiles}
      {guidesToggle}
    </fieldset>
  );
}

export function BackgroundPanel({
  background,
  onBackground,
  color,
  hideHeading = false,
}: {
  background: string;
  onBackground: (hex: string) => void;
  color: string;
  hideHeading?: boolean;
}) {
  const [draft, setDraft] = useState(background);
  // Keep the hex field in step when the background changes elsewhere (undo, presets).
  if (normalizeHex(draft) !== background && document.activeElement?.id !== "bg-hex") {
    setDraft(background);
  }
  return (
    <div className="control">
      <h2 className={hideHeading ? "visually-hidden" : "panel__heading"} id="bg-heading">
        Background
      </h2>
      <div className="bg-grid" role="group" aria-labelledby="bg-heading">
        {BACKGROUNDS.map((bg) => (
          <button
            key={bg.hex}
            type="button"
            className="bg-chip"
            style={{ background: bg.hex }}
            title={bg.name}
            aria-label={`${bg.name} background`}
            aria-pressed={background === bg.hex}
            onClick={() => onBackground(bg.hex)}
          />
        ))}
      </div>
      <div className="custom-color">
        <label className="picker">
          <input
            type="color"
            value={background}
            onChange={(e) => onBackground(e.target.value)}
            aria-label="Choose any background color"
          />
          <span>Any color</span>
        </label>
        <form
          className="hex-field"
          onSubmit={(e) => {
            e.preventDefault();
            const hex = normalizeHex(draft);
            if (hex) onBackground(hex);
          }}
        >
          <label htmlFor="bg-hex" className="visually-hidden">
            Background hex color code
          </label>
          <input
            id="bg-hex"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const hex = normalizeHex(draft);
              if (hex) onBackground(hex);
              else setDraft(background);
            }}
            aria-invalid={normalizeHex(draft) === null}
            spellCheck={false}
            autoComplete="off"
          />
        </form>
      </div>
      <button
        type="button"
        className="button button--small bg-use-brush"
        onClick={() => onBackground(color)}
      >
        <span className="bg-use-brush__chip" style={{ background: color }} aria-hidden="true" />
        Use brush color
      </button>
    </div>
  );
}

/**
 * A collapsible section for less-used settings. Remembers open/closed in this browser so the
 * panel looks the way you left it.
 */
export function Section({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  /** Current value, shown next to the title so you can see it while the section is closed. */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const key = `tiny-canvas:section:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? defaultOpen : saved === "open";
    } catch {
      return defaultOpen;
    }
  });
  return (
    <details
      className="section"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        try {
          localStorage.setItem(key, next ? "open" : "closed");
        } catch {
          /* per-viewer convenience only */
        }
      }}
    >
      <summary className="section__summary">
        <span className="section__title">{title}</span>
        {summary && <span className="section__value">{summary}</span>}
      </summary>
      <div className="section__body">{children}</div>
    </details>
  );
}

export function ShortcutsHelp({ popover = false }: { popover?: boolean }) {
  return (
    <details className={popover ? "shortcuts shortcuts--popover" : "control shortcuts"}>
      <summary aria-label={popover ? "Keyboard shortcuts" : undefined} title="Keyboard shortcuts">
        {popover ? <Icon name="help" /> : "Keyboard shortcuts"}
      </summary>
      <dl>
        <dt>1–9, 0</dt>
        <dd>Choose a brush (Pen to Rainbow)</dd>
        <dt>E</dt>
        <dd>Eraser on and off</dd>
        <dt>[ and ]</dt>
        <dd>Smaller and bigger brush</dd>
        <dt>+ and −</dt>
        <dd>Zoom in and out</dd>
        <dt>F</dt>
        <dd>Fit the drawing to the screen</dd>
        <dt>Alt + click</dt>
        <dd>Pick a color from the drawing</dd>
        <dt>B / U / G / S</dt>
        <dd>Brush, Shape, Fill, Spirograph</dd>
        <dt>Shape + Shift / Alt</dt>
        <dd>Keep proportions / draw from the center</dd>
        <dt>Shift + drag</dt>
        <dd>Straight line (snaps near flat, upright and 45°)</dd>
        <dt>L</dt>
        <dd>Straight lines on and off</dd>
        <dt>H</dt>
        <dd>Hand tool (drag to move around)</dd>
        <dt>Ctrl+Z</dt>
        <dd>Undo</dd>
        <dt>Ctrl+Shift+Z</dt>
        <dd>Redo</dd>
        <dt>Arrows + Space</dt>
        <dd>Draw with the keyboard when the canvas has focus</dd>
        <dt>Scroll</dt>
        <dd>Move around; Ctrl+scroll or pinch to zoom</dd>
      </dl>
    </details>
  );
}
