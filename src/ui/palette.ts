export interface NamedColor {
  name: string;
  hex: string;
}

/** 40 hand-picked colors: 8 hue families, light to deep, plus neutrals. */
export const PALETTE: NamedColor[] = [
  { name: "Lab navy", hex: "#000052" },
  { name: "Ink black", hex: "#141414" },
  { name: "Graphite", hex: "#4a4a57" },
  { name: "Pebble", hex: "#9a98a8" },
  { name: "Fog", hex: "#d9d7e3" },
  { name: "White", hex: "#ffffff" },
  { name: "Cream", hex: "#fff4d6" },
  { name: "Cocoa", hex: "#6b4226" },

  { name: "Cherry", hex: "#d7263d" },
  { name: "Tomato", hex: "#ff5a36" },
  { name: "Tangerine", hex: "#ff8c1a" },
  { name: "Marigold", hex: "#ffb703" },
  { name: "Lab yellow", hex: "#ffd23f" },
  { name: "Lemon", hex: "#fff275" },
  { name: "Lime", hex: "#b5e655" },
  { name: "Leaf", hex: "#4caf50" },

  { name: "Forest", hex: "#1b6b45" },
  { name: "Mint", hex: "#98f5c9" },
  { name: "Teal", hex: "#2ec4b6" },
  { name: "Lagoon", hex: "#0096a8" },
  { name: "Sky", hex: "#7cc6fe" },
  { name: "Cobalt", hex: "#2463eb" },
  { name: "Ultramarine", hex: "#3a2bd1" },
  { name: "Midnight", hex: "#14213d" },

  { name: "Lavender", hex: "#c9b6ff" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Grape", hex: "#5b2a86" },
  { name: "Orchid", hex: "#d16ba5" },
  { name: "Bubblegum", hex: "#ff6fb5" },
  { name: "Blush", hex: "#ffc2d1" },
  { name: "Peach", hex: "#ffcba4" },
  { name: "Coral", hex: "#ff7f6e" },

  { name: "Brick", hex: "#9c3d2e" },
  { name: "Clay", hex: "#c8754a" },
  { name: "Sand", hex: "#e8c99b" },
  { name: "Olive", hex: "#7a8b3a" },
  { name: "Sage", hex: "#a8c3a0" },
  { name: "Slate blue", hex: "#5c6f91" },
  { name: "Plum", hex: "#7d2e5c" },
  { name: "Electric pink", hex: "#ff2e93" },
];

export const BACKGROUNDS: NamedColor[] = [
  { name: "Paper white", hex: "#ffffff" },
  { name: "Cream", hex: "#fff6e0" },
  { name: "Sand", hex: "#f1e3c8" },
  { name: "Blush", hex: "#fde4ec" },
  { name: "Lavender mist", hex: "#ece6ff" },
  { name: "Pale sky", hex: "#e3f2ff" },
  { name: "Mint", hex: "#e2f6ec" },
  { name: "Fog gray", hex: "#e9e8ef" },
  { name: "Kraft", hex: "#c9a57a" },
  { name: "Forest", hex: "#173b2c" },
  { name: "Lab navy", hex: "#000052" },
  { name: "Night", hex: "#111018" },
];

export function colorName(hex: string): string {
  const match = [...PALETTE, ...BACKGROUNDS].find((c) => c.hex === hex.toLowerCase());
  return match ? match.name : `custom color ${hex.toUpperCase()}`;
}
