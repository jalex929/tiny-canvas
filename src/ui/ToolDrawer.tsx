import { useEffect, useRef, type ReactNode } from "react";
import { BRUSHES } from "../engine/brushes";
import { SYMMETRY_INFO } from "../engine/symmetry";
import type { BrushId, SymmetryMode } from "../engine/types";
import { Icon, type IconName } from "./Icon";

export type DrawerTab = "brush" | "color" | "effects" | "canvas";

interface Props {
  tab: DrawerTab | null;
  onTab: (tab: DrawerTab | null) => void;
  brush: BrushId;
  color: string;
  symmetry: SymmetryMode;
  /** Label of the current canvas shape. */
  shape: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  panels: Record<DrawerTab, ReactNode>;
  /** Always-visible size and opacity, the most-changed settings. */
  quickBar: ReactNode;
}

const TAB_TITLES: Record<DrawerTab, string> = {
  brush: "Brushes",
  color: "Color",
  effects: "Symmetry and background",
  canvas: "Lines, pen and canvas",
};

/**
 * Phone tools: a bar within thumb reach, and a sheet that opens above it. The sheet pushes
 * the canvas up rather than covering it, so you can keep drawing while it's open.
 */
export function ToolDrawer(props: Props) {
  const { tab, onTab, brush, color, symmetry, shape, canUndo, canRedo, onUndo, onRedo, panels } =
    props;
  const { quickBar } = props;
  const sheetRef = useRef<HTMLDivElement>(null);
  const toggle = (next: DrawerTab) => onTab(tab === next ? null : next);

  useEffect(() => {
    if (!tab) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sheetRef.current?.contains(document.activeElement)) {
        onTab(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tab, onTab]);

  const tabs: { id: DrawerTab; icon: IconName; label: string; detail: ReactNode }[] = [
    {
      id: "brush",
      icon: "brush",
      label: "Brush",
      detail: BRUSHES[brush].label,
    },
    {
      id: "color",
      icon: "palette",
      label: "Color",
      detail: <span className="drawer__chip" style={{ background: color }} />,
    },
    {
      id: "effects",
      icon: "sliders",
      label: "Effects",
      detail: symmetry === "none" ? "Symmetry" : SYMMETRY_INFO[symmetry].label,
    },
    { id: "canvas", icon: "frame", label: "Canvas", detail: shape },
  ];

  return (
    <div className={`drawer ${tab ? "is-open" : ""}`}>
      {tab && (
        <div
          ref={sheetRef}
          id="drawer-sheet"
          className="drawer__sheet"
          role="region"
          aria-label={TAB_TITLES[tab]}
        >
          <div className="drawer__sheet-head">
            <span className="drawer__sheet-title">{TAB_TITLES[tab]}</span>
            <button
              type="button"
              className="icon-button icon-button--small"
              onClick={() => onTab(null)}
              aria-label="Close tools"
            >
              <Icon name="close" />
            </button>
          </div>
          {panels[tab]}
        </div>
      )}
      {quickBar}
      <nav className="drawer__bar" aria-label="Tools">
        <div className="drawer__history">
          <button
            type="button"
            className="icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
          >
            <Icon name="redo" />
          </button>
        </div>
        <div className="drawer__tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="drawer__tab"
              aria-expanded={tab === t.id}
              aria-controls={tab === t.id ? "drawer-sheet" : undefined}
              onClick={() => toggle(t.id)}
            >
              <Icon name={t.icon} />
              <span className="drawer__tab-text">
                <span className="drawer__tab-label">{t.label}</span>
                <span className="drawer__tab-detail">{t.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
