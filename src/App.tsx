import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRUSHES, defaultOptions } from "./engine/brushes";
import { normalizeHex } from "./engine/color";
import { canRedo, canUndo, commit, createHistory, redo, sceneFrom, undo } from "./engine/history";
import type { PressureCurve } from "./engine/pressure";
import type { SmoothingLevel } from "./engine/stabilizer";
import { FILL_TOLERANCE_INFO } from "./engine/fill";
import { SHAPE_INFO, type ShapeKind } from "./engine/shapes";
import { fullPattern, type SpiroRing } from "./engine/spiro";
import { computeFill } from "./ui/fillTool";
import {
  BRUSH_IDS,
  CANVAS_SHAPES,
  type Action,
  type CanvasShapeId,
  type LineStyle,
  type CanvasSize,
  type BrushId,
  type History,
  type Stroke,
  type SymmetryMode,
} from "./engine/types";
import { createBrowserStore } from "./storage/browserStore";
import { compactStroke, type DrawingStore } from "./storage/drawing";
import { CanvasStage, type StrokeTemplate } from "./ui/CanvasStage";
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
import { DrawPalette } from "./ui/DrawPalette";
import { MoreMenu } from "./ui/MoreMenu";
import {
  playSound,
  setSoundEnabled,
  unlockAudio,
  type SoundEvent,
  type SoundSet,
} from "./ui/sound";
import { PanelTabs } from "./ui/PanelTabs";
import { shouldIgnoreShortcut } from "./ui/keyboard";
import {
  FillPanel,
  SpiroPanel,
  LinePanel,
  type Tool,
  BackgroundPanel,
  BrushOptionsPanel,
  CanvasPanel,
  ColorPanel,
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

/**
 * Where the back link goes: the Lab page that lists this app. Served from jayfox.design/lab/
 * the link is relative (so it also works on a local copy); anywhere else it points at the live
 * Lab. Set VITE_HOME_URL / VITE_HOME_LABEL at build time to change it.
 */
const HOME_URL: string =
  import.meta.env.VITE_HOME_URL ??
  (typeof location !== "undefined" && location.pathname.includes("/lab/")
    ? "../"
    : "https://jayfox.design/lab");
const HOME_LABEL: string = import.meta.env.VITE_HOME_LABEL ?? "jayfox.design/lab";

const LAST_OPEN_KEY = "tiny-canvas:last-open";
const GUIDES_KEY = "tiny-canvas:show-guides";
const TAP_TIP_KEY = "tiny-canvas:tip-two-finger-undo";
const RECENT_KEY = "tiny-canvas:recent-colors";
const RECENT_MAX = 8;
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

/** Where the chosen look (clean or retro) is remembered. */
const LOOK_KEY = "tiny-canvas:look";

/** Where the sound on/off choice is remembered. */
const SOUND_KEY = "tiny-canvas:sound";

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
  const [recent, setRecent] = useState<string[]>(() => {
    // Remembered per browser; anything that isn't a valid color is ignored.
    try {
      const saved: unknown = JSON.parse(safeStorage.get(RECENT_KEY) ?? "[]");
      if (!Array.isArray(saved)) return [];
      return saved
        .map((v) => (typeof v === "string" ? normalizeHex(v) : null))
        .filter((v): v is string => v !== null)
        .slice(0, RECENT_MAX);
    } catch {
      return [];
    }
  });
  useEffect(() => safeStorage.set(RECENT_KEY, JSON.stringify(recent)), [recent]);
  const [sizePreview, setSizePreview] = useState(false);
  const sizePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [symmetry, setSymmetry] = useState<SymmetryMode>("none");
  const [symmetryCount, setSymmetryCount] = useState(6);
  const [tool, setTool] = useState<Tool>("brush");

  // ---- Sound: off unless turned on; the set follows the look (90s or clean) ----
  const [sound, setSound] = useState(() => safeStorage.get(SOUND_KEY) === "on");
  const live = useRef({ sound, retro: false, tool: "brush" as Tool, brush: "pen" as BrushId });
  const sfx = useCallback((event: SoundEvent, set?: SoundSet) => {
    if (!live.current.sound) return;
    playSound(event, set ?? (live.current.retro ? "retro" : "clean"));
  }, []);
  useEffect(() => {
    setSoundEnabled(sound);
    safeStorage.set(SOUND_KEY, sound ? "on" : "off");
  }, [sound]);
  const toggleSound = () => {
    const next = !sound;
    live.current.sound = next;
    setSound(next);
    if (next) {
      unlockAudio();
      setSoundEnabled(true);
      sfx("click");
    }
  };
  // Picking anything in the panels (a brush, tool, color, symmetry, tab or shape) clicks.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        target?.closest(
          ".draw-tile, .swatch, .symmetry-tile, .panel-tabs__tab, .shape-menu__kind, .segmented-row__option, .segmented__option, .drawer__tab",
        )
      )
        sfx("click");
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, [sfx]);
  const onDrawTick = useCallback(
    (kind: "brush" | "spiro") => {
      if (kind === "spiro") return sfx("spiro");
      const b = live.current.brush;
      sfx(b === "hearts" || b === "sparkle" ? "stamp" : "brush");
    },
    [sfx],
  );
  const [shapeKind, setShapeKind] = useState<ShapeKind>("ellipse");
  const [shapeFilled, setShapeFilled] = useState(false);
  const [spiroWheel, setSpiroWheel] = useState(52);
  const [spiroHole, setSpiroHole] = useState(0.75);
  const [spiroRing, setSpiroRing] = useState<SpiroRing | null>(null);
  const [lineStyle, setLineStyle] = useState<LineStyle>("solid");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(store ? "idle" : "unavailable");
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
  // Retro mode: an optional 90s skin (src/retro.css), remembered on this device.
  const [retro, setRetro] = useState(() => {
    try {
      return localStorage.getItem(LOOK_KEY) === "retro";
    } catch {
      return false;
    }
  });
  /** Whether the "into 90s mode" animation is playing. */
  const [lookFx, setLookFx] = useState(false);
  const lookTimers = useRef<number[]>([]);
  const switchLook = (next: boolean) => {
    lookTimers.current.forEach((t) => window.clearTimeout(t));
    lookTimers.current = [];
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setLookFx(false);
      setRetro(next);
      return;
    }
    sfx(next ? "lookOn" : "lookOff", next ? "retro" : "clean");
    if (!next) {
      // Leaving 90s mode: no cover; the surfaces ease back for a moment (see retro.css).
      const root = document.documentElement;
      root.classList.add("look-easing");
      setLookFx(false);
      setRetro(false);
      lookTimers.current.push(window.setTimeout(() => root.classList.remove("look-easing"), 500));
      return;
    }
    // Into 90s mode: the look changes while the curtain covers the screen, then it lifts.
    setLookFx(true);
    lookTimers.current.push(
      window.setTimeout(() => setRetro(true), 520),
      window.setTimeout(() => setLookFx(false), 1150),
    );
  };
  useEffect(() => {
    const timers = lookTimers.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  live.current.retro = retro;
  live.current.tool = tool;
  live.current.brush = brush;
  useEffect(() => {
    document.documentElement.dataset.look = retro ? "retro" : "clean";
    try {
      localStorage.setItem(LOOK_KEY, retro ? "retro" : "clean");
    } catch {
      // No storage: the look lasts for this visit.
    }
  }, [retro]);
  const [smoothing, setSmoothing] = useState<SmoothingLevel>("medium");
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

  // --- Editing ------------------------------------------------------------------------------

  const apply = useCallback((action: Action) => setHistory((h) => commit(h, action)), []);

  /**
   * Background changes from dragging around a color picker arrive many times a second.
   * Changes within a moment of each other replace one another, so Undo goes back to the
   * color you had before you started, not one step of the drag.
   */
  const lastBackgroundAt = useRef(0);
  const applyBackground = useCallback((hex: string) => {
    const now = Date.now();
    const recent = now - lastBackgroundAt.current < 1200;
    lastBackgroundAt.current = now;
    setHistory((h) => {
      const last = h.past[h.past.length - 1];
      if (recent && last?.type === "background") {
        const before = { ...h, past: h.past.slice(0, -1) };
        return commit(before, { type: "background", color: hex });
      }
      return commit(h, { type: "background", color: hex });
    });
  }, []);

  const onCommit = useCallback(
    (stroke: Stroke) => {
      apply({ type: "stroke", stroke: compactStroke(stroke) });
      const t = live.current.tool;
      if (t === "shape" || t === "line") sfx("shape");
      // Teach the gesture once, right after someone's first mark on a phone.
      if (isPhone && !safeStorage.get(TAP_TIP_KEY)) {
        safeStorage.set(TAP_TIP_KEY, "shown");
        setMessage({ text: "Tip: tap with two fingers to undo, three to redo." });
      }
    },
    [apply, isPhone, sfx],
  );

  const doUndo = useCallback(() => {
    sfx("undo");
    setHistory(undo);
  }, [sfx]);
  const doRedo = useCallback(() => {
    sfx("undo");
    setHistory(redo);
  }, [sfx]);
  const gestureUndo = useCallback(() => {
    setHistory(undo);
    setMessage({ text: "Undone" });
  }, []);
  const gestureRedo = useCallback(() => {
    setHistory(redo);
    setMessage({ text: "Redone" });
  }, []);

  const clear = () => {
    sfx("clear");
    apply({ type: "clear" });
    setMessage({ text: "Canvas cleared.", undo: true });
  };

  const pickColor = useCallback((hex: string) => {
    setColor(hex);
    setHexDraft(hex);
    setRecent((list) => [hex, ...list.filter((c) => c !== hex)].slice(0, RECENT_MAX));
    setBrush((b) => (b === "eraser" ? "pen" : b));
  }, []);

  const setSize = useCallback(
    (value: number) => {
      setSizes((s) => ({
        ...s,
        [brush]: Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(value))),
      }));
      // Show the real brush size on the canvas while it's being changed.
      setSizePreview(true);
      if (sizePreviewTimer.current) clearTimeout(sizePreviewTimer.current);
      sizePreviewTimer.current = setTimeout(() => setSizePreview(false), 900);
    },
    [brush],
  );

  const exportImage = async (format: ImageFormat, transparent: boolean) => {
    try {
      await downloadImage(scene, format, meta.title, transparent);
      sfx("download");
      setMessage({ text: `${format === "jpeg" ? "JPG" : "PNG"} downloaded.` });
    } catch {
      setMessage({ text: "The image couldn't be created. Try PNG, or a different browser." });
    }
  };

  const options = brushOptions[brush];
  const template: StrokeTemplate = useMemo(
    () => ({
      brush,
      color,
      size,
      opacity,
      symmetry,
      symmetryCount,
      options,
      // Only the Line tool draws dashed or dotted.
      ...(tool === "line" && lineStyle !== "solid" ? { lineStyle } : {}),
    }),
    [brush, color, size, opacity, symmetry, symmetryCount, options, tool, lineStyle],
  );

  const setOption = (key: string, value: number) =>
    setBrushOptions((all) => ({ ...all, [brush]: { ...all[brush], [key]: value } }));

  useEffect(() => {
    if (!isPhone) return;
    document.getElementById("drawer-sheet")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [tool, isPhone]);

  const shapeSettings = useMemo(
    () => ({ kind: shapeKind, filled: shapeFilled }),
    [shapeKind, shapeFilled],
  );
  const spiro = useMemo(
    () => ({ ring: spiroRing, gear: { wheel: spiroWheel, hole: spiroHole } }),
    [spiroRing, spiroWheel, spiroHole],
  );

  /** Spirograph shortcut: draw the whole pattern in one undoable stroke. */
  const drawFullSpiro = () => {
    if (!spiroRing) return;
    apply({
      type: "stroke",
      stroke: compactStroke({
        ...template,
        id: `spiro-${Date.now().toString(36)}`,
        seed: Math.floor(Math.random() * 2 ** 31),
        points: fullPattern(spiroRing, spiro.gear, -Math.PI / 2),
      }),
    });
  };

  /** Fill tool: work out the area and add it as one undoable step. */
  const onFill = (point: { x: number; y: number }, slop: number) => {
    const result = computeFill(
      scene,
      point.x,
      point.y,
      color,
      FILL_TOLERANCE_INFO.normal.value,
      slop,
    );
    if (result.kind === "same-color") {
      setMessage({ text: "That area is already this color." });
      return;
    }
    if (result.kind === "outside") return;
    sfx("fill");
    apply({
      type: "stroke",
      stroke: {
        id: `fill-${Date.now().toString(36)}`,
        brush: "fill",
        color,
        size: 1,
        opacity,
        symmetry: "none",
        seed: 0,
        points: [{ x: Math.round(point.x), y: Math.round(point.y), p: 1 }],
        mask: result.mask,
      },
    });
  };

  /** Picking a brush while filling switches back to drawing. */
  /** Picking a brush tile means drawing with it. */
  const chooseBrush = useCallback((id: BrushId) => {
    setBrush(id);
    setTool("brush");
  }, []);

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
      if (shouldIgnoreShortcut(event)) return;
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
        else if (key === "e") {
          setBrush((b) => (b === "eraser" ? "pen" : "eraser"));
          setTool("brush");
        } else if (key === "b") setTool("brush");
        else if (key === "u") setTool("shape");
        else if (key === "g") setTool("fill");
        else if (key === "s") setTool("spiro");
        else if (key === "l") setTool("line");
        else if (/^[0-9]$/.test(key) && target.getAttribute("type") !== "range") {
          const index = key === "0" ? 9 : Number(key) - 1;
          const id = BRUSH_IDS[index];
          if (id) chooseBrush(id);
        } else return;
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doRedo, doUndo, setSize, size, chooseBrush]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), message.undo ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [message]);

  const statusText: Record<SaveStatus, string> = {
    idle: "Auto-saves",
    saving: "Saving…",
    saved: "Saved",
    error: "Couldn't save. Download to keep a copy.",
    unavailable: "Saving is off in this browser. Download to keep a copy.",
  };

  const toolLabel =
    tool === "fill"
      ? "Fill"
      : tool === "line"
        ? "Line"
        : tool === "spiro"
          ? "Spirograph"
          : tool === "shape"
            ? SHAPE_INFO[shapeKind].label
            : BRUSHES[brush].label;

  const brushOptionsPanel = (
    <BrushOptionsPanel brush={brush} values={options} onChange={setOption} collapsible={!isPhone} />
  );
  const symmetryPanel = (hideHeading: boolean, compact = false) => (
    <SymmetryPanel
      compact={compact}
      symmetry={symmetry}
      onSymmetry={setSymmetry}
      count={symmetryCount}
      onCount={setSymmetryCount}
      showGuides={showGuides}
      onShowGuides={setShowGuides}
      hideHeading={hideHeading}
    />
  );
  const backgroundPanel = (hideHeading: boolean) => (
    <BackgroundPanel
      background={scene.background}
      onBackground={applyBackground}
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

  const canvasPanel = (part: "all" | "shape" | "pen") => (
    <CanvasPanel
      part={part}
      shape={shapeId}
      hasMarks={scene.strokes.length > 0}
      onShape={changeShape}
      pressureCurve={pressureCurve}
      onPressureCurve={setPressureCurve}
      penOnly={penOnlySetting}
      onPenOnly={setPenOnlySetting}
      penDetected={penDetected}
      smoothing={smoothing}
      onSmoothing={setSmoothing}
    />
  );

  const panels = {
    // On phones, the selected brush's options come first: no scrolling past 12 tiles.
    // Tool, then that tool's settings, then the brush (used by Brush and by shape outlines).
    // The Draw palette, then settings for whatever is selected. On phones the settings come
    // first, so they're at the top of the sheet.
    brush: (() => {
      const palette = (
        <DrawPalette
          tool={tool}
          brush={brush}
          color={color}
          options={brushOptions}
          onBrush={chooseBrush}
          onTool={setTool}
          shapeKind={shapeKind}
          onShapeKind={setShapeKind}
          shapeFilled={shapeFilled}
          onShapeFilled={setShapeFilled}
          eyedropper={eyedropper}
          onEyedropper={setEyedropper}
        />
      );
      const settings = (
        <>
          {tool === "spiro" && isPhone && (
            <SpiroPanel
              wheel={spiroWheel}
              onWheel={setSpiroWheel}
              hole={spiroHole}
              onHole={setSpiroHole}
              hasRing={!!spiroRing}
              onDrawFull={drawFullSpiro}
              onNewRing={() => setSpiroRing(null)}
            />
          )}
          {tool === "line" && isPhone && <LinePanel style={lineStyle} onStyle={setLineStyle} />}
          {tool === "fill" && <FillPanel />}
          {tool === "brush" && brushOptionsPanel}
        </>
      );
      return isPhone ? (
        <>
          {settings}
          {palette}
        </>
      ) : (
        <>
          {palette}
          {settings}
        </>
      );
    })(),
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
    canvas: canvasPanel("all"),
  };

  const stage = (
    <CanvasStage
      scene={scene}
      template={template}
      showGuides={showGuides}
      pressureCurve={pressureCurve}
      smoothing={smoothing}
      tool={tool}
      shape={shapeSettings}
      spiro={spiro}
      onSpiroRing={setSpiroRing}
      onFill={onFill}
      showSizePreview={sizePreview}
      contextBar={
        tool === "line" && !isPhone ? (
          <LinePanel style={lineStyle} onStyle={setLineStyle} />
        ) : tool === "spiro" && !isPhone ? (
          <SpiroPanel
            wheel={spiroWheel}
            onWheel={setSpiroWheel}
            hole={spiroHole}
            onHole={setSpiroHole}
            hasRing={!!spiroRing}
            onDrawFull={drawFullSpiro}
            onNewRing={() => setSpiroRing(null)}
          />
        ) : null
      }
      compact={isPhone}
      quiet={isPhone && drawerTab !== null}
      penOnly={penOnlySetting && penDetected}
      onPenDetected={onPenDetected}
      eyedropper={eyedropper}
      onPickColor={onPickColor}
      onUndoGesture={gestureUndo}
      onRedoGesture={gestureRedo}
      onCommit={onCommit}
      onDrawTick={onDrawTick}
      onAnnounce={(text) => setMessage({ text })}
    />
  );

  return (
    <div className={`app ${isPhone ? "app--phone" : ""}`}>
      <a
        className="skip-link"
        href="#drawing-canvas"
        onClick={(e) => {
          e.preventDefault();
          document.querySelector<HTMLCanvasElement>("[data-testid=drawing-canvas]")?.focus();
        }}
      >
        Skip to canvas
      </a>
      {lookFx && <LookTransition />}
      <header className="topbar">
        <a className="topbar__home" href={HOME_URL} aria-label="Back to the Lab at jayfox.design">
          <Icon name="arrowLeft" />
          <span className="topbar__home-text">{HOME_LABEL}</span>
        </a>
        <div className="topbar__title">
          <h1>Tiny Canvas</h1>
          <div className="topbar__name">
            <label className="visually-hidden" htmlFor="drawing-title">
              Drawing title
            </label>
            <input
              id="drawing-title"
              className="title-input"
              title="Rename this drawing"
              value={meta.title}
              maxLength={80}
              size={Math.max(6, meta.title.length + 1)}
              onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
              onBlur={() =>
                setMeta((m) => (m.title.trim() ? m : { ...m, title: "Untitled drawing" }))
              }
            />
            <button
              type="button"
              className="topbar__rename"
              aria-label="Rename drawing"
              title="Rename drawing"
              onClick={() => {
                const input = document.getElementById("drawing-title") as HTMLInputElement | null;
                input?.focus();
                input?.select();
              }}
            >
              <Icon name="pencil" />
            </button>
            <p
              className={`save-status is-${saveStatus}`}
              role="status"
              title={
                saveStatus === "saved" || saveStatus === "idle"
                  ? "Saved in this browser as you draw"
                  : undefined
              }
            >
              {statusText[saveStatus]}
            </p>
          </div>
        </div>
        <div className="topbar__actions" role="toolbar" aria-label="Drawing actions">
          <LookSwitch on={retro} onChange={switchLook} short={isPhone} />
          {!isPhone && (
            <>
              <button
                type="button"
                className="icon-button"
                aria-pressed={sound}
                onClick={toggleSound}
                aria-label="Sound effects"
                title={sound ? "Sound on" : "Sound off"}
              >
                <Icon name={sound ? "soundOn" : "soundOff"} />
              </button>
              <ShortcutsHelp popover />
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
          {isPhone ? (
            <MoreMenu
              items={[
                {
                  label: sound ? "Sound off" : "Sound on",
                  icon: sound ? "soundOff" : "soundOn",
                  onSelect: toggleSound,
                },
                {
                  label: "Clear canvas",
                  icon: "trash",
                  onSelect: clear,
                  disabled: scene.strokes.length === 0,
                  danger: true,
                },
              ]}
            />
          ) : (
            <>
              <button
                type="button"
                className="button"
                onClick={clear}
                disabled={scene.strokes.length === 0}
                title="Clear the canvas"
                aria-label="Clear"
              >
                <Icon name="trash" />
                <span className="button__text">Clear</span>
              </button>
            </>
          )}
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
            symmetryCount={symmetryCount}
            toolLabel={toolLabel}
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
          <div className="panel panel--settings" role="region" aria-label="Brush settings">
            {sizePanel(false)}
            {symmetryPanel(false, true)}
            <PanelTabs
              label="Settings"
              tabs={[
                {
                  id: "color",
                  label: "Color",
                  summary: <span className="tab-chip" style={{ background: color }} />,
                  content: panels.color,
                },
                {
                  id: "paper",
                  label: "Paper",
                  summary: shapeLabel,
                  content: (
                    <>
                      {backgroundPanel(false)}
                      {canvasPanel("shape")}
                    </>
                  ),
                },
                {
                  id: "pen",
                  label: "Pen",
                  summary: smoothing === "off" ? "Raw" : "Smooth",
                  content: canvasPanel("pen"),
                },
              ]}
            />
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
    </div>
  );
}

/** The "90s mode" switch: a real on/off switch, in the top bar on every screen size. */
function LookSwitch({
  on,
  onChange,
  short,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  short: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="look-switch"
      onClick={() => onChange(!on)}
      title={on ? "Turn off 90s mode" : "Turn on 90s mode"}
    >
      <span className="look-switch__label">
        {short ? "90s" : "90s mode"}
        {short && <span className="visually-hidden"> mode</span>}
      </span>
      <span className="look-switch__track" aria-hidden="true">
        <span className="look-switch__knob" />
      </span>
    </button>
  );
}

/**
 * The switch animation into 90s mode: a dithered pixel curtain drops, a little window says
 * "Loading 90s mode..." while a chunky bar fills, then the curtain lifts on the new look.
 * (Leaving 90s mode has no cover: the surfaces ease back; see retro.css.) Decorative only.
 */
function LookTransition() {
  return (
    <div className="look-fx look-fx--retro" aria-hidden="true">
      <div className="look-fx__window">
        <p className="look-fx__title">Tiny Canvas</p>
        <p className="look-fx__text">Loading 90s mode...</p>
        <div className="look-fx__bar">
          <span />
        </div>
      </div>
    </div>
  );
}
