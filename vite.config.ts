import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Share previews (Open Graph / X cards) need the image's full web address. Set VITE_SITE_URL
 * when building for a live site (e.g. https://tiny-canvas.example.com); without it the tags
 * fall back to a relative path, which some apps can still use.
 */
function shareTags(): Plugin {
  const site = process.env.VITE_SITE_URL?.replace(/\/+$/, "");
  return {
    name: "share-tags",
    transformIndexHtml: (html) =>
      html
        .replaceAll("%SHARE_IMAGE%", site ? `${site}/og-image.png` : "./og-image.png")
        .replace("%SHARE_URL_TAG%", site ? `<meta property="og:url" content="${site}/" />` : ""),
  };
}

// Plain Vite config so any host (Bolt, StackBlitz, Netlify, a laptop) can start it as is.
export default defineConfig({
  // Relative base so the build works at /, /tiny-canvas/, /games/tiny-canvas/, or anywhere else.
  base: "./",
  plugins: [react(), shareTags()],
});
