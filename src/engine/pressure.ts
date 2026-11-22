/** How strongly a stylus's pressure changes the line. */
export const PRESSURE_CURVES = ["off", "soft", "normal", "firm"] as const;
export type PressureCurve = (typeof PRESSURE_CURVES)[number];

export const PRESSURE_INFO: Record<PressureCurve, { label: string; hint: string }> = {
  off: { label: "Off", hint: "Every line is full size" },
  soft: { label: "Soft", hint: "A light touch already draws thick" },
  normal: { label: "Normal", hint: "Even response" },
  firm: { label: "Firm", hint: "Press harder for thick lines" },
};

const GAMMA: Record<Exclude<PressureCurve, "off">, number> = { soft: 0.55, normal: 1, firm: 1.7 };

/**
 * Turns a raw stylus reading (0–1) into the stored pressure. Mouse, finger and keyboard
 * input always store 1 (full size), so only real pressure makes lines thinner.
 */
export function shapePressure(raw: number, curve: PressureCurve): number {
  if (curve === "off") return 1;
  const clamped = Math.min(1, Math.max(0, raw));
  return Math.round(clamped ** GAMMA[curve] * 1000) / 1000;
}

/**
 * Smooths readings within a stroke. Stylus pressure is noisy; without this, lines
 * wobble in width. `amount` 0 = no smoothing, closer to 1 = smoother but laggier.
 */
export function smoothPressure(previous: number | undefined, next: number, amount = 0.55) {
  if (previous === undefined) return next;
  return Math.round((previous * amount + next * (1 - amount)) * 1000) / 1000;
}
