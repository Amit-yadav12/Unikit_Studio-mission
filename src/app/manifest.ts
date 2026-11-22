import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unikit Studio",
    short_name: "Unikit",
    description: "Privacy-first developer performance tools",
    start_url: "/",
    display: "standalone",
    background_color: "#090a10",
    theme_color: "#090a10",
    icons: [
      { src: "/icons/unikit-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/unikit-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
