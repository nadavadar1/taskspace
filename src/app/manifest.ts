import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מרחב – ניהול משימות חכם",
    short_name: "מרחב",
    description: "מערכת אישית לניהול משימות במרחבים, עם סוכן AI",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#f6f7fb",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
