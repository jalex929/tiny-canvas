import { BRUSHES } from "../engine/brushes";
import { normalizeHex } from "../engine/color";
import { SYMMETRY_INFO } from "../engine/symmetry";
import { BRUSH_IDS, SYMMETRY_MODES, type BrushId, type SymmetryMode } from "../engine/types";
import { BrushPreview } from "./BrushPreview";
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
  onChange,
}: {
  brush: BrushId;
  color: string;
  onChange: (id: BrushId) => void;
}) {
  return (
    <section aria-labelledby="brushes-heading">
      <h2 id="brushes-heading" className="panel__heading">
        Brushes
      </h2>
      <div className="brush-grid" role="radiogroup" aria-labelledby="brushes-heading">
        {BRUSH_IDS.map((id) => (
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
              <BrushPreview brush={id} color={id === "eraser" ? "#000052" : color} />
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
    </section>
  );
}

export function ColorPanel({
  color,
  hexDraft,
  onHexDraft,
  recent,
  onPick,
}: {
  color: string;
  hexDraft: string;
  onHexDraft: (value: string) => void;
  recent: string[];
  onPick: (hex: string) => void;
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

export function EffectsPanel({
  size,
  onSize,
  opacity,
  onOpacity,
  symmetry,
  onSymmetry,
  background,
  onBackground,
  color,
}: {
  size: number;
  onSize: (value: number) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  symmetry: SymmetryMode;
  onSymmetry: (mode: SymmetryMode) => void;
  background: string;
  onBackground: (hex: string) => void;
  color: string;
}) {
  return (
    <>
      <div className="control">
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

      <fieldset className="control symmetry">
        <legend className="panel__heading">Symmetry</legend>
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
                <SymmetryPreview mode={mode} ink="#000052" />
                <span className="symmetry-tile__label">{SYMMETRY_INFO[mode].label}</span>
              </span>
              <span id={`symmetry-hint-${mode}`} className="visually-hidden">
                {SYMMETRY_INFO[mode].description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="control">
        <h2 className="panel__heading" id="bg-heading">
          Background
        </h2>
        <div className="bg-row" role="group" aria-labelledby="bg-heading">
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg.hex}
              type="button"
              className="bg-chip"
              style={{ background: bg.hex }}
              aria-label={`${bg.name} background`}
              aria-pressed={background === bg.hex}
              onClick={() => onBackground(bg.hex)}
            />
          ))}
          <button
            type="button"
            className="button button--small"
            onClick={() => onBackground(color)}
          >
            Use brush color
          </button>
        </div>
      </div>
    </>
  );
}

export function ShortcutsHelp() {
  return (
    <details className="control shortcuts">
      <summary>Keyboard shortcuts</summary>
      <dl>
        <dt>1–9, 0</dt>
        <dd>Choose a brush</dd>
        <dt>E</dt>
        <dd>Eraser on and off</dd>
        <dt>[ and ]</dt>
        <dd>Smaller and bigger brush</dd>
        <dt>+ and −</dt>
        <dd>Zoom in and out</dd>
        <dt>F</dt>
        <dd>Fit the drawing to the screen</dd>
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
