import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

interface Item {
  label: string;
  icon: IconName;
  onSelect: () => void;
  disabled?: boolean;
  /** Visually separated and red, for actions that remove work. */
  danger?: boolean;
}

/**
 * Phone header overflow: labelled actions instead of a row of look-alike circle icons, and
 * the destructive one (Clear) kept apart from New.
 */
export function MoreMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
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

  return (
    <div className="more" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label="More: new drawing, my drawings, clear"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <ul id={id} className="more__menu">
          {items.map((item) => (
            <li key={item.label} className={item.danger ? "more__danger" : undefined}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
