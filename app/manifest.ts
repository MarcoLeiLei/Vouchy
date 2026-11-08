import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vouchy",
    short_name: "Vouchy",
    description: "Gutscheine sammeln und rechtzeitig einlösen.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ff",
    theme_color: "#f4f1ff",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
