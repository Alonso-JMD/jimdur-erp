import type { Metadata, Viewport } from "next";
import "./globals.css";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "JIMDUR ERP",
  description:
    "Sistema de inventario, pedidos y despachos de Grupo JIMDUR.",
  applicationName: "JIMDUR ERP",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/jimdur-icon-192.png",
    apple: "/jimdur-icon-192.png",
  },
  openGraph: {
    title: "JIMDUR ERP",
    description: "Pedidos, despachos y stock en línea.",
    type: "website",
    images: [
      {
        url: `${appUrl}/og.png`,
        width: 1200,
        height: 630,
        alt: "JIMDUR ERP — Inventario, pedidos y despachos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JIMDUR ERP",
    description: "Pedidos, despachos y stock en línea.",
    images: [`${appUrl}/og.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123b67",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
