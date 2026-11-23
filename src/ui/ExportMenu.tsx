import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { ImageFormat } from "./exportImage";

interface Props {
  disabled: boolean;
  /** Pixel size of the downloaded image. */
  size: { width: number; height: number };
  onExport: (format: ImageFormat, transparent: boolean) => Promise<void>;
  /** Present where the system share sheet supports images (phones, tablets). */
  onShare?: (format: ImageFormat) => Promise<void>;
}

/** "Download" disclosure: pick PNG or JPG, optionally a transparent PNG. */
export function ExportMenu({ disabled, size, onExport, onShare }: Props) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ImageFormat>("png");
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onExport(format, transparent);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="button button--primary"
        aria-label="Download"
        title="Download your drawing"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="download" />
        <span className="export__label">Download</span>
      </button>
      {open && (
        <form id={panelId} className="export__panel" onSubmit={submit}>
          <fieldset className="segmented">
            <legend>File type</legend>
            {(
              [
                ["png", "PNG", "Sharp, lossless"],
                ["jpeg", "JPG", "Smaller file"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="segmented__option">
                <input
                  type="radio"
                  name="format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input
              type="checkbox"
              checked={format === "png" && transparent}
              disabled={format === "jpeg"}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            <span>
              Transparent background
              {format === "jpeg" && <small> (PNG only. JPG can't be see-through.)</small>}
            </span>
          </label>
          <button type="submit" className="button button--primary button--block" disabled={busy}>
            {busy ? "Preparing…" : `Download ${format === "jpeg" ? "JPG" : "PNG"}`}
          </button>
          {onShare && (
            <button
              type="button"
              className="button button--block"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onShare(format);
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="share" />
              <span>Share or save to Photos</span>
            </button>
          )}
          <p className="export__note">
            {size.width} × {size.height} pixels
          </p>
        </form>
      )}
    </div>
  );
}
