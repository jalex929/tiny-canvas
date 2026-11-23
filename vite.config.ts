import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Share previews (Open Graph / X cards) need the image's full web address. Set VITE_SITE_URL
 * when building for a live site (e.g. https://tiny-canvas.example.com); without it the tags
 * fall back to a relative path, which some apps can still use.
 */
/** Canonical address and structured data, only when the live address is known. */
function seoTags(site: string): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Tiny Canvas",
    description:
      "A drawing toy for 90s kids who miss Kid Pix: rainbow and heart brushes, glowing neon, kaleidoscopes and symmetry, shapes and fill, a hand-turned spirograph, and an optional 90s mode. Free, no sign-up.",
    applicationCategory: "DesignApplication",
    operatingSystem: "Any (runs in a web browser)",
    browserRequirements: "Requires JavaScript",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: "Jay Fox",
      url: "https://jayfox.design",
    },
    isPartOf: {
      "@type": "CollectionPage",
      name: "Lab",
      url: "https://jayfox.design/lab",
    },
    license: "https://opensource.org/licenses/MIT",
    sameAs: "https://github.com/jalex929/tiny-canvas",
  };
  return [
    `<link rel="canonical" href="${site}/" />`,
    `<script type="application/ld+json">${JSON.stringify({ ...schema, url: `${site}/`, image: `${site}/og-image.png` })}</script>`,
  ].join("\n    ");
}

function shareTags(): Plugin {
  const site = process.env.VITE_SITE_URL?.replace(/\/+$/, "");
  return {
    name: "share-tags",
    transformIndexHtml: (html) =>
      html
        .replaceAll("%SHARE_IMAGE%", site ? `${site}/og-image.png` : "./og-image.png")
        .replace("%SHARE_URL_TAG%", site ? `<meta property="og:url" content="${site}/" />` : "")
        .replace("%SEO_TAGS%", site ? seoTags(site) : ""),
  };
}

// Plain Vite config so any host (Bolt, StackBlitz, Netlify, a laptop) can start it as is.
export default defineConfig({
  // Relative base so the build works at /, /tiny-canvas/, /games/tiny-canvas/, or anywhere else.
  base: "./",
  plugins: [react(), shareTags()],
});
