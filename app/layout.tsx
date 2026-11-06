import type { Metadata } from "next";
import "./globals.css";
import "./tueste.css";
import "./tueste-v2.css";
import "./tueste-v4.css";

export const metadata: Metadata = {
  title: "Tueste Café | Encuentra tu ritual de café",
  description: "Explora los packs de Tueste Café, compara formatos y registra tu solicitud para Costa Rica. Prototipo académico, precios piloto en USD y sin cobros reales activos.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
