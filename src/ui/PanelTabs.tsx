import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface PanelTab {
  id: string;
  label: string;
  /** Current value, shown under the label so you can see it without opening the tab. */
  summary?: ReactNode;
  content: ReactNode;
}

const STORAGE_KEY = "tiny-canvas:settings-tab";

/**
 * Tabbed settings panel (like the docked panels in design apps): one group of settings at a
 * time, so nothing needs a long scroll. Arrow keys move between tabs; the last tab used is
 * remembered in this browser.
 */
export function PanelTabs({ tabs, label }: { tabs: PanelTab[]; label: string }) {
  const baseId = useId();
  const [active, setActive] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return tabs.some((t) => t.id === saved) ? saved! : tabs[0]!.id;
    } catch {
      return tabs[0]!.id;
    }
  });
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -index,
      End: tabs.length - 1 - index,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = (index + move + tabs.length) % tabs.length;
    select(tabs[next]!.id);
    buttons.current[next]?.focus();
  };

  return (
    <div className="panel-tabs">
      <div className="panel-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className="panel-tabs__tab"
            onClick={() => select(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="panel-tabs__label">{tab.label}</span>
            {tab.summary && <span className="panel-tabs__summary">{tab.summary}</span>}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="panel-tabs__panel"
          tabIndex={0}
        >
          {active === tab.id && tab.content}
        </div>
      ))}
    </div>
  );
}
