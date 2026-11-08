import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: "Vouchy – kein Gutschein verfällt mehr",
  description: "Gutscheine fotografieren, sammeln und rechtzeitig einlösen.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Vouchy", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f4f1ff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
