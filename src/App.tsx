import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRUSHES, defaultOptions } from "./engine/brushes";
import { canRedo, canUndo, commit, createHistory, redo, sceneFrom, undo } from "./engine/history";
import type { PressureCurve } from "./engine/pressure";
import { SYMMETRY_INFO } from "./engine/symmetry";
import {
  BRUSH_IDS,
  CANVAS_SHAPES,
  type Action,
  type CanvasShapeId,
  type CanvasSize,
  type BrushId,
  type History,
  type Stroke,
  type SymmetryMode,
} from "./engine/types";
import { createBrowserStore } from "./storage/browserStore";
import { compactStroke, type DrawingStore, type DrawingSummary } from "./storage/drawing";
import { CanvasStage, type StrokeTemplate } from "./ui/CanvasStage";
import { DrawingsDialog } from "./ui/DrawingsDialog";
import { ExportMenu } from "./ui/ExportMenu";
import {
  canShareImages,
  downloadImage,
  exportSize,
  shareImage,
  thumbnail,
  type ImageFormat,
} from "./ui/exportImage";
import { colorName } from "./ui/palette";
import { Icon } from "./ui/Icon";
import { shouldIgnoreShortcut } from "./ui/keyboard";
import {
  BackgroundPanel,
  BrushOptionsPanel,
  BrushPicker,
  CanvasPanel,
  ColorPanel,
  Section,
  SizePanel,
  SymmetryPanel,
  SIZE_MAX,
  SIZE_MIN,
  ShortcutsHelp,
} from "./ui/Panels";
import { ToolDrawer, type DrawerTab } from "./ui/ToolDrawer";
import { useMediaQuery } from "./ui/useMediaQuery";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "unavailable";

interface DrawingMeta {
  id: string;
  title: string;
  createdAt: number;
  /** True once this drawing exists in storage. Empty new drawings aren't saved. */
  persisted: boolean;
}

const LAST_OPEN_KEY = "tiny-canvas:last-open";
const GUIDES_KEY = "tiny-canvas:show-guides";
const TAP_TIP_KEY = "tiny-canvas:tip-two-finger-undo";
const PHONE_QUERY = "(max-width: 900px)";

/** New drawings start portrait (3:4) on phones and landscape (4:3) on bigger screens. */
function deviceDefaultSize(): CanvasSize {
  const phone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_QUERY).matches;
  const shape = CANVAS_SHAPES.find((c) => c.id === (phone ? "portrait" : "landscape"))!;
  return { ...shape.size };
}

const newMeta = (): DrawingMeta => {
  const now = Date.now();
  const stamp = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(now);
  return {
    id: `d-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: `Drawing, ${stamp}`,
    createdAt: now,
    persisted: false,
  };
};

const safeStorage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* per-viewer convenience only */
    }
  },
};

export function App({ store: injectedStore }: { store?: DrawingStore | null }) {
  // Created once. A new store per render would re-run every effect that depends on it.
  const [store] = useState(() =>
    injectedStore === undefined ? createBrowserStore() : injectedStore,
  );
  const [history, setHistory] = useState<History>(() => createHistory([], deviceDefaultSize()));
  const [meta, setMeta] = useState<DrawingMeta>(newMeta);
  const [brush, setBrush] = useState<BrushId>("pen");
  const [sizes, setSizes] = useState(
    () =>
      Object.fromEntries(BRUSH_IDS.map((id) => [id, BRUSHES[id].defaultSize])) as Record<
        BrushId,
        number
      >,
  );
  const [color, setColor] = useState("#000052");
  const [hexDraft, setHexDraft] = useState("#000052");
  const [recent, setRecent] = useState<string[]>([]);
  const [opacity, setOpacity] = useState(1);
  const [symmetry, setSymmetry] = useState<SymmetryMode>("none");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(store ? "idle" : "unavailable");
  const [shelfOpen, setShelfOpen] = useState(false);
  const [shelf, setShelf] = useState<DrawingSummary[] | "loading" | "error">("loading");
  const [message, setMessage] = useState<{ text: string; undo?: boolean } | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab | null>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [brushOptions, setBrushOptions] = useState(
    () =>
      Object.fromEntries(BRUSH_IDS.map((id) => [id, defaultOptions(id)])) as Record<
        BrushId,
        Record<string, number>
      >,
  );
  const [pressureCurve, setPressureCurve] = useState<PressureCurve>("normal");
  const [penOnlySetting, setPenOnlySetting] = useState(true);
  const [penDetected, setPenDetected] = useState(false);
  const [eyedropper, setEyedropper] = useState(false);
  const [showGuides, setShowGuidesState] = useState(() => safeStorage.get(GUIDES_KEY) !== "off");
  const setShowGuides = (value: boolean) => {
    setShowGuidesState(value);
    safeStorage.set(GUIDES_KEY, value ? "on" : "off");
  };

  const scene = useMemo(() => sceneFrom(history.past, history.size), [history.past, history.size]);
  const shapeId: CanvasShapeId | null =
    CANVAS_SHAPES.find((c) => c.size.width === scene.width && c.size.height === scene.height)?.id ??
    null;
  const size = sizes[brush];

  // --- Saving -----------------------------------------------------------------------------

  const latest = useRef({ history, meta, scene });
  latest.current = { history, meta, scene };
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = useCallback(async () => {
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = null;
    const { history: h, meta: m, scene: s } = latest.current;
    if (!store || (!m.persisted && h.past.length === 0)) return;
    setSaveStatus("saving");
    try {
      await store.save({
        id: m.id,
        title: m.title.trim() || "Untitled drawing",
        createdAt: m.createdAt,
        updatedAt: Date.now(),
        thumbnail: thumbnail(s),
        width: h.size.width,
        height: h.size.height,
        actions: h.past,
      });
      safeStorage.set(LAST_OPEN_KEY, m.id);
      setMeta((current) => (current.id === m.id ? { ...current, persisted: true } : current));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [store]);

  // Autosave shortly after each change.
  useEffect(() => {
    if (!store || (!meta.persisted && history.past.length === 0)) return;
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(() => void saveNow(), 700);
  }, [history.past, meta.title, meta.persisted, store, saveNow]);

  // Save before the tab closes or goes to the background (mobile browsers kill tabs).
  useEffect(() => {
    const flush = () => {
      if (pendingSave.current) void saveNow();
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveNow]);

  // Reopen the last drawing on load.
  useEffect(() => {
    const lastId = safeStorage.get(LAST_OPEN_KEY);
    if (!store || !lastId) return;
    let cancelled = false;
    store
      .get(lastId)
      .then((drawing) => {
        // Never replace work someone started before the saved drawing finished loading.
        const current = latest.current;
        if (cancelled || !drawing || current.history.past.length > 0 || current.meta.persisted)
          return;
        setHistory(
          createHistory(drawing.actions, { width: drawing.width, height: drawing.height }),
        );
        setMeta({
          id: drawing.id,
          title: drawing.title,
          createdAt: drawing.createdAt,
          persisted: true,
        });
        setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [store]);

  const refreshShelf = useCallback(async () => {
    if (!store) return setShelf("error");
    try {
      setShelf(await store.list());
    } catch {
      setShelf("error");
    }
  }, [store]);

  const openShelf = async () => {
    setShelfOpen(true);
    setShelf("loading");
    await saveNow();
    await refreshShelf();
  };

  const startNew = async () => {
    await saveNow();
    setHistory(createHistory([], deviceDefaultSize()));
    setMeta(newMeta());
    setSaveStatus(store ? "idle" : "unavailable");
    setShelfOpen(false);
    setMessage({ text: "New drawing started. Your last one is on the shelf." });
  };

  const openDrawing = async (id: string) => {
    if (id === meta.id) return setShelfOpen(false);
    await saveNow();
    try {
      const drawing = await store?.get(id);
      if (!drawing) throw new Error("missing");
      setHistory(createHistory(drawing.actions, { width: drawing.width, height: drawing.height }));
      setMeta({
        id: drawing.id,
        title: drawing.title,
        createdAt: drawing.createdAt,
        persisted: true,
      });
      safeStorage.set(LAST_OPEN_KEY, drawing.id);
      setSaveStatus("saved");
      setShelfOpen(false);
      setMessage({ text: `Opened “${drawing.title}”.` });
    } catch {
      setMessage({ text: "That drawing couldn't be opened." });
    }
  };

  const deleteDrawing = async (id: string) => {
    try {
      await store?.remove(id);
      if (id === meta.id) {
        if (pendingSave.current) clearTimeout(pendingSave.current);
        pendingSave.current = null;
        setHistory(createHistory([], deviceDefaultSize()));
        setMeta(newMeta());
        setSaveStatus("idle");
      }
      await refreshShelf();
      setMessage({ text: "Drawing deleted." });
    } catch {
      setMessage({ text: "That drawing couldn't be deleted." });
    }
  };

  // --- Editing ------------------------------------------------------------------------------

  const apply = useCallback((action: Action) => setHistory((h) => commit(h, action)), []);

  const onCommit = useCallback(
    (stroke: Stroke) => {
      apply({ type: "stroke", stroke: compactStroke(stroke) });
      // Teach the gesture once, right after someone's first mark on a phone.
      if (isPhone && !safeStorage.get(TAP_TIP_KEY)) {
        safeStorage.set(TAP_TIP_KEY, "shown");
        setMessage({ text: "Tip: tap with two fingers to undo, three to redo." });
      }
    },
    [apply, isPhone],
  );

  const doUndo = useCallback(() => setHistory(undo), []);
  const doRedo = useCallback(() => setHistory(redo), []);
  const gestureUndo = useCallback(() => {
    setHistory(undo);
    setMessage({ text: "Undone" });
  }, []);
  const gestureRedo = useCallback(() => {
    setHistory(redo);
    setMessage({ text: "Redone" });
  }, []);

  const clear = () => {
    apply({ type: "clear" });
    setMessage({ text: "Canvas cleared.", undo: true });
  };

  const pickColor = useCallback((hex: string) => {
    setColor(hex);
    setHexDraft(hex);
    setRecent((list) => [hex, ...list.filter((c) => c !== hex)].slice(0, 8));
    setBrush((b) => (b === "eraser" ? "pen" : b));
  }, []);

  const setSize = useCallback(
    (value: number) =>
      setSizes((s) => ({
        ...s,
        [brush]: Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(value))),
      })),
    [brush],
  );

  const exportImage = async (format: ImageFormat, transparent: boolean) => {
    try {
      await downloadImage(scene, format, meta.title, transparent);
      setMessage({ text: `${format === "jpeg" ? "JPG" : "PNG"} downloaded.` });
    } catch {
      setMessage({ text: "The image couldn't be created. Try PNG, or a different browser." });
    }
  };

  const options = brushOptions[brush];
  const template: StrokeTemplate = useMemo(
    () => ({ brush, color, size, opacity, symmetry, options }),
    [brush, color, size, opacity, symmetry, options],
  );

  const setOption = (key: string, value: number) =>
    setBrushOptions((all) => ({ ...all, [brush]: { ...all[brush], [key]: value } }));

  const changeShape = (id: CanvasShapeId) => {
    const option = CANVAS_SHAPES.find((c) => c.id === id)!;
    apply({ type: "canvas", ...option.size });
    if (scene.strokes.length > 0) {
      setMessage({ text: `Canvas is now ${option.label.toLowerCase()}.`, undo: true });
    }
  };

  const onPenDetected = useCallback(() => setPenDetected(true), []);

  const onPickColor = useCallback(
    (hex: string) => {
      pickColor(hex);
      setEyedropper(false);
      setMessage({ text: `Picked ${colorName(hex).replace(/^custom color/, "")}`.trim() });
    },
    [pickColor],
  );

  const shareCurrent = async (format: ImageFormat) => {
    try {
      const shared = await shareImage(scene, format, meta.title);
      if (shared) setMessage({ text: "Shared." });
    } catch {
      setMessage({ text: "Sharing didn't work here. Try Download instead." });
    }
  };

  // --- Keyboard shortcuts --------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (shouldIgnoreShortcut(event) || shelfOpen) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
      } else if (mod && key === "y") {
        event.preventDefault();
        doRedo();
      } else if (!mod && !event.altKey) {
        if (key === "[") setSize(size - (size > 20 ? 4 : 1));
        else if (key === "]") setSize(size + (size >= 20 ? 4 : 1));
        else if (key === "e") setBrush((b) => (b === "eraser" ? "pen" : "eraser"));
        else if (/^[0-9]$/.test(key) && target.getAttribute("type") !== "range") {
          const index = key === "0" ? 9 : Number(key) - 1;
          const id = BRUSH_IDS[index];
          if (id) setBrush(id);
        } else return;
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doRedo, doUndo, setSize, size, shelfOpen]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), message.undo ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [message]);

  const statusText: Record<SaveStatus, string> = {
    idle: "Saves as you draw",
    saving: "Saving…",
    saved: "Saved in this browser",
    error: "Couldn't save. Download to keep a copy.",
    unavailable: "Saving is off in this browser. Download to keep a copy.",
  };

  const brushOptionsPanel = (
    <BrushOptionsPanel brush={brush} values={options} onChange={setOption} />
  );
  const brushPicker = (
    <BrushPicker brush={brush} color={color} options={brushOptions} onChange={setBrush} />
  );
  const symmetryPanel = (hideHeading: boolean) => (
    <SymmetryPanel
      symmetry={symmetry}
      onSymmetry={setSymmetry}
      showGuides={showGuides}
      onShowGuides={setShowGuides}
      hideHeading={hideHeading}
    />
  );
  const backgroundPanel = (hideHeading: boolean) => (
    <BackgroundPanel
      background={scene.background}
      onBackground={(hex) => apply({ type: "background", color: hex })}
      color={color}
      hideHeading={hideHeading}
    />
  );
  const sizePanel = (compact: boolean) => (
    <SizePanel
      size={size}
      onSize={setSize}
      opacity={opacity}
      onOpacity={setOpacity}
      color={color === "#ffffff" ? "#d9d9e5" : color}
      compact={compact}
    />
  );
  const shapeLabel = CANVAS_SHAPES.find((c) => c.id === shapeId)?.label ?? "Custom";

  const panels = {
    // On phones, the selected brush's options come first: no scrolling past 12 tiles.
    brush: isPhone ? (
      <>
        {brushOptionsPanel}
        {brushPicker}
      </>
    ) : (
      <>
        {brushPicker}
        {brushOptionsPanel}
      </>
    ),
    color: (
      <ColorPanel
        color={color}
        hexDraft={hexDraft}
        onHexDraft={setHexDraft}
        recent={recent}
        onPick={pickColor}
        eyedropper={eyedropper}
        onEyedropper={setEyedropper}
      />
    ),
    effects: (
      <>
        {symmetryPanel(false)}
        {backgroundPanel(false)}
      </>
    ),
    canvas: (
      <CanvasPanel
        shape={shapeId}
        hasMarks={scene.strokes.length > 0}
        onShape={changeShape}
        pressureCurve={pressureCurve}
        onPressureCurve={setPressureCurve}
        penOnly={penOnlySetting}
        onPenOnly={setPenOnlySetting}
        penDetected={penDetected}
      />
    ),
  };

  const stage = (
    <CanvasStage
      scene={scene}
      template={template}
      showGuides={showGuides}
      pressureCurve={pressureCurve}
      penOnly={penOnlySetting && penDetected}
      onPenDetected={onPenDetected}
      eyedropper={eyedropper}
      onPickColor={onPickColor}
      onUndoGesture={gestureUndo}
      onRedoGesture={gestureRedo}
      onCommit={onCommit}
      onAnnounce={(text) => setMessage({ text })}
    />
  );

  return (
    <div className={`app ${isPhone ? "app--phone" : ""}`}>
      <header className="topbar">
        <a className="topbar__home" href="../" aria-label="Back to Creative Lab">
          <Icon name="arrowLeft" />
          <span className="topbar__home-text">Creative Lab</span>
        </a>
        <div className="topbar__title">
          <h1>Tiny Canvas</h1>
          <label className="visually-hidden" htmlFor="drawing-title">
            Drawing title
          </label>
          <input
            id="drawing-title"
            className="title-input"
            value={meta.title}
            maxLength={80}
            onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
            onBlur={() =>
              setMeta((m) => (m.title.trim() ? m : { ...m, title: "Untitled drawing" }))
            }
          />
          <p className={`save-status is-${saveStatus}`} role="status">
            {statusText[saveStatus]}
          </p>
        </div>
        <div className="topbar__actions" role="toolbar" aria-label="Drawing actions">
          {!isPhone && (
            <>
              <button
                type="button"
                className="icon-button"
                onClick={doUndo}
                disabled={!canUndo(history)}
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Icon name="undo" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={doRedo}
                disabled={!canRedo(history)}
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Icon name="redo" />
              </button>
            </>
          )}
          <button
            type="button"
            className="button"
            onClick={clear}
            disabled={scene.strokes.length === 0}
          >
            <Icon name="trash" />
            <span className="button__text">Clear</span>
          </button>
          <button type="button" className="button" onClick={() => void startNew()}>
            <Icon name="plus" />
            <span className="button__text">New</span>
          </button>
          <button
            type="button"
            className="button"
            onClick={() => void openShelf()}
            disabled={!store}
          >
            <Icon name="shelf" />
            <span className="button__text">My drawings</span>
          </button>
          <ExportMenu
            disabled={false}
            size={exportSize(scene)}
            onExport={exportImage}
            onShare={canShareImages() ? shareCurrent : undefined}
          />
        </div>
      </header>

      {isPhone ? (
        <main className="workspace workspace--phone">
          {stage}
          <ToolDrawer
            tab={drawerTab}
            onTab={setDrawerTab}
            brush={brush}
            color={color}
            symmetry={symmetry}
            shape={shapeLabel}
            quickBar={sizePanel(true)}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            onUndo={doUndo}
            onRedo={doRedo}
            panels={panels}
          />
        </main>
      ) : (
        <main className="workspace">
          <div className="panel panel--brushes">{panels.brush}</div>
          {stage}
          <div className="panel panel--settings" role="region" aria-label="Color and effects">
            {sizePanel(false)}
            {panels.color}
            <Section
              id="symmetry"
              title="Symmetry"
              summary={SYMMETRY_INFO[symmetry].label}
              defaultOpen
            >
              {symmetryPanel(true)}
            </Section>
            <Section id="background" title="Background">
              {backgroundPanel(true)}
            </Section>
            <Section id="canvas" title="Canvas & pen" summary={shapeLabel}>
              {panels.canvas}
            </Section>
            <ShortcutsHelp />
          </div>
        </main>
      )}

      <div className="toast-region" aria-live="polite">
        {message && (
          <div className="toast">
            <span>{message.text}</span>
            {message.undo && (
              <button
                type="button"
                className="button button--small"
                onClick={() => {
                  doUndo();
                  setMessage(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      <DrawingsDialog
        open={shelfOpen}
        currentId={meta.id}
        drawings={shelf}
        onClose={() => setShelfOpen(false)}
        onOpen={(id) => void openDrawing(id)}
        onDelete={(id) => void deleteDrawing(id)}
        onNew={() => void startNew()}
      />
    </div>
  );
}
