import "./globals.css";
import type { Metadata, Viewport } from "next";
import BannerConexion from "@/components/BannerConexion";

export const metadata: Metadata = {
  title: "ICAO POS",
  description: "Punto de venta ICAO Buencafé — Paseo El Hatillo",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#3B2314",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // evita el zoom accidental al tocar inputs en tablet
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <BannerConexion />
        {children}
      </body>
    </html>
  );
}
