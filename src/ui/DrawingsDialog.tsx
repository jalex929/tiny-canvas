import { useEffect, useRef, useState } from "react";
import type { DrawingSummary } from "../storage/drawing";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  currentId: string;
  drawings: DrawingSummary[] | "loading" | "error";
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The "My drawings" shelf: everything saved in this browser. */
export function DrawingsDialog({
  open,
  currentId,
  drawings,
  onClose,
  onOpen,
  onDelete,
  onNew,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) setConfirming(null);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="shelf"
      aria-labelledby="shelf-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="shelf__inner">
        <header className="shelf__header">
          <div>
            <h2 id="shelf-title">My drawings</h2>
            <p>
              Saved automatically in this browser. Download a PNG or JPG to keep a copy anywhere.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        {drawings === "loading" && <p className="shelf__state">Loading your drawings…</p>}
        {drawings === "error" && (
          <p className="shelf__state" role="alert">
            Your saved drawings couldn't be loaded. This browser may be blocking site storage.
          </p>
        )}
        {Array.isArray(drawings) && drawings.length === 0 && (
          <div className="shelf__state">
            <p>Nothing saved yet. Your drawing is saved here as soon as you make a mark.</p>
          </div>
        )}
        {Array.isArray(drawings) && drawings.length > 0 && (
          <ul className="shelf__grid">
            {drawings.map((d) => (
              <li key={d.id} className={`shelf__item ${d.id === currentId ? "is-current" : ""}`}>
                <button
                  type="button"
                  className="shelf__open"
                  onClick={() => onOpen(d.id)}
                  aria-label={`Open ${d.title}${d.id === currentId ? " (open now)" : ""}`}
                >
                  {d.thumbnail ? (
                    <img src={d.thumbnail} alt="" />
                  ) : (
                    <span className="shelf__blank">Empty</span>
                  )}
                </button>
                <div className="shelf__meta">
                  <strong>{d.title}</strong>
                  <small>
                    {d.id === currentId ? "Open now · " : ""}
                    {dateFormat.format(d.updatedAt)}
                  </small>
                </div>
                {confirming === d.id ? (
                  <div className="shelf__confirm" role="group" aria-label={`Delete ${d.title}?`}>
                    <span>Delete for good?</span>
                    <button
                      type="button"
                      className="button button--danger button--small"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(d.id);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() => setConfirming(null)}
                      autoFocus
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => setConfirming(d.id)}
                    aria-label={`Delete ${d.title}`}
                  >
                    <Icon name="trash" />
                    <span>Delete</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <footer className="shelf__footer">
          <button type="button" className="button button--primary" onClick={onNew}>
            <Icon name="plus" />
            <span>New drawing</span>
          </button>
        </footer>
      </div>
    </dialog>
  );
}
