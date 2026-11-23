/**
 * Sound effects, synthesized live with the Web Audio API: no audio files to download or license.
 * Two sets with the same moments: "retro" (chunky and bleepy, for 90s mode) and "clean" (soft
 * and round, for the default look). Off unless the person turns sound on. The audio context is
 * only created from a tap or click, because browsers require that.
 */

export type SoundEvent =
  | "brush"
  | "stamp"
  | "click"
  | "shape"
  | "fill"
  | "spiro"
  | "undo"
  | "clear"
  | "download"
  | "lookOn"
  | "lookOff";

export type SoundSet = "retro" | "clean";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from the tap that turns sound on, so the browser lets it play. */
export function unlockAudio() {
  const a = audio();
  if (a?.state === "suspended") void a.resume();
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

// Sound left on from an earlier visit: wake audio on the first tap of this one.
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      if (enabled) unlockAudio();
    },
    { capture: true },
  );
}

function tone(
  a: AudioContext,
  o: {
    type?: OscillatorType;
    from: number;
    to?: number;
    at?: number;
    len: number;
    vol?: number;
    cutoff?: number;
  },
) {
  const { type = "square", from, to = from, at = 0, len, vol = 0.4, cutoff = 4000 } = o;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(filter).connect(gain).connect(master!);
  osc.start(t);
  osc.stop(t + len + 0.03);
}

function noise(
  a: AudioContext,
  o: {
    at?: number;
    len: number;
    vol?: number;
    from?: number;
    to?: number;
    q?: number;
    crush?: number;
  },
) {
  const { at = 0, len, vol = 0.3, from = 2000, to = from, q = 0.9, crush = 1 } = o;
  const t = a.currentTime + at;
  const frames = Math.ceil(a.sampleRate * len);
  const buffer = a.createBuffer(1, frames, a.sampleRate);
  const data = buffer.getChannelData(0);
  // "Crushed" noise holds each value for a few samples: a grainier, more digital texture.
  let held = 0;
  for (let i = 0; i < frames; i++) {
    if (i % crush === 0) held = Math.random() * 2 - 1;
    data[i] = held;
  }
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + len);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter).connect(gain).connect(master!);
  src.start(t);
}

type Player = (a: AudioContext) => void;

const RETRO: Record<SoundEvent, Player> = {
  // One short scratch per tick; the app calls it a few times a second while drawing.
  brush: (a) =>
    noise(a, { len: 0.09, vol: 0.18, from: 2600 + Math.random() * 1200, to: 1800, crush: 2 }),
  stamp: (a) => {
    tone(a, { type: "sine", from: 180, to: 620, len: 0.12, vol: 0.4 });
    tone(a, { type: "sine", from: 620, to: 260, at: 0.12, len: 0.3, vol: 0.32 });
  },
  click: (a) => {
    tone(a, { type: "square", from: 1500, to: 900, len: 0.035, vol: 0.2 });
    noise(a, { len: 0.03, vol: 0.12, from: 4000 });
  },
  shape: (a) => {
    tone(a, { type: "sine", from: 900, to: 160, len: 0.14, vol: 0.45 });
    tone(a, { type: "triangle", from: 1800, at: 0.02, len: 0.05, vol: 0.1 });
  },
  fill: (a) => {
    tone(a, { type: "sine", from: 420, to: 120, len: 0.35, vol: 0.4, cutoff: 900 });
    tone(a, { type: "sine", from: 260, to: 520, at: 0.18, len: 0.18, vol: 0.22, cutoff: 900 });
    noise(a, { at: 0.05, len: 0.3, vol: 0.1, from: 500, to: 250, crush: 3 });
  },
  spiro: (a) => tone(a, { type: "square", from: 700 + Math.random() * 360, len: 0.03, vol: 0.1 }),
  undo: (a) => noise(a, { len: 0.28, vol: 0.3, from: 600, to: 3600, q: 1.4 }),
  clear: (a) => {
    for (let i = 0; i < 6; i++)
      noise(a, {
        at: i * 0.05 + Math.random() * 0.03,
        len: 0.07,
        vol: 0.3,
        from: 1200 + Math.random() * 2400,
        crush: 5,
      });
    tone(a, { type: "sawtooth", from: 220, to: 60, at: 0.05, len: 0.3, vol: 0.15, cutoff: 800 });
  },
  download: (a) => {
    [523, 659, 784].forEach((f, i) =>
      tone(a, { type: "square", from: f, at: i * 0.09, len: 0.12, vol: 0.2, cutoff: 3000 }),
    );
    tone(a, { type: "square", from: 1047, at: 0.3, len: 0.45, vol: 0.22, cutoff: 3000 });
    tone(a, { type: "triangle", from: 523, at: 0.3, len: 0.45, vol: 0.18 });
  },
  lookOn: (a) => {
    [262, 330, 392, 523].forEach((f, i) =>
      tone(a, { type: "triangle", from: f, at: i * 0.1, len: 0.9 - i * 0.1, vol: 0.2 }),
    );
    tone(a, { type: "sine", from: 1047, at: 0.45, len: 0.6, vol: 0.1 });
  },
  lookOff: (a) =>
    [523, 659, 784].forEach((f) => tone(a, { type: "sine", from: f, len: 0.7, vol: 0.12 })),
};

const CLEAN: Record<SoundEvent, Player> = {
  brush: (a) => noise(a, { len: 0.12, vol: 0.07, from: 1400, to: 900, q: 0.6 }),
  stamp: (a) => tone(a, { type: "sine", from: 520, to: 880, len: 0.09, vol: 0.26 }),
  click: (a) =>
    tone(a, { type: "triangle", from: 1100, to: 700, len: 0.05, vol: 0.2, cutoff: 2600 }),
  shape: (a) => tone(a, { type: "sine", from: 660, to: 620, len: 0.18, vol: 0.26 }),
  fill: (a) => {
    tone(a, { type: "sine", from: 700, to: 300, len: 0.22, vol: 0.28, cutoff: 1500 });
    tone(a, { type: "sine", from: 400, to: 600, at: 0.15, len: 0.15, vol: 0.12, cutoff: 1500 });
  },
  spiro: (a) => tone(a, { type: "triangle", from: 1500, len: 0.025, vol: 0.08, cutoff: 3000 }),
  undo: (a) => noise(a, { len: 0.25, vol: 0.11, from: 1800, to: 700, q: 0.7 }),
  clear: (a) => noise(a, { len: 0.4, vol: 0.14, from: 900, to: 2600, q: 0.6 }),
  download: (a) => {
    tone(a, { type: "sine", from: 784, len: 0.5, vol: 0.22 });
    tone(a, { type: "sine", from: 1175, at: 0.12, len: 0.6, vol: 0.18 });
  },
  lookOn: (a) => RETRO.lookOn(a),
  lookOff: (a) =>
    [523, 659, 784].forEach((f) => tone(a, { type: "sine", from: f, len: 0.7, vol: 0.12 })),
};

/** The least time between two of the same sound, so a busy brush never turns into a buzz. */
const MIN_GAP: Partial<Record<SoundEvent, number>> = {
  brush: 170,
  stamp: 220,
  spiro: 110,
  click: 40,
};
const lastPlayed: Partial<Record<SoundEvent, number>> = {};

/** Plays `event` from `set`, if sound is on (and it isn't too soon after the same sound). */
export function playSound(event: SoundEvent, set: SoundSet) {
  if (!enabled) return;
  const now = performance.now();
  const gap = MIN_GAP[event] ?? 0;
  if (gap && now - (lastPlayed[event] ?? -Infinity) < gap) return;
  lastPlayed[event] = now;
  const a = audio();
  if (!a || !master) return;
  if (a.state === "suspended") void a.resume();
  (set === "retro" ? RETRO : CLEAN)[event](a);
}
