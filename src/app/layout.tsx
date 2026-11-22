import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/ui/Feedback";
import { themeBootstrapScript } from "@/lib/theme-bootstrap";
import "./globals.css";

const inter = localFont({
  src: "../../public/fonts/inter-latin.woff2",
  display: "swap",
  variable: "--font-inter",
  weight: "100 900",
});
const mono = localFont({
  src: "../../public/fonts/mono-latin.woff2",
  display: "swap",
  variable: "--font-mono-code",
  weight: "400",
  preload: false,
});

const siteOrigin =
  process.env.SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin || "http://localhost:3000"),
  title: {
    default: "Unikit Studio — Make every byte count",
    template: "%s · Unikit Studio",
  },
  description:
    "A developer workspace for static asset performance: convert and compress images, audit CSS font-display rules, and measure real byte savings.",
  applicationName: "Unikit Studio",
  icons: {
    icon: [
      { url: "/brand/unikit-symbol.svg", type: "image/svg+xml" },
      { url: "/icons/unikit-32.png", sizes: "32x32" },
    ],
    apple: "/icons/unikit-180.png",
  },
  manifest: "/manifest.webmanifest",
  authors: [{ name: "Unikit Studio" }],
  keywords: [
    "image optimization",
    "webp",
    "avif",
    "font-display",
    "css",
    "web performance",
  ],
  openGraph: {
    title: "Unikit Studio",
    description:
      "Make every byte count. Convert images, audit font-display, measure real savings.",
    type: "website",
    images: [
      {
        url: "/brand/social-card.png",
        width: 1200,
        height: 630,
        alt: "Unikit Studio — a privacy-first developer toolkit",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Unikit Studio",
    images: ["/brand/social-card.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Both palettes are declared so mobile browser chrome matches the active theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#090a10" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme attribute is set by the inline script
    // before React hydrates, so the server and client markup intentionally differ.
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
        >
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
