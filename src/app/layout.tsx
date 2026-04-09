import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sorteo Feria Sanrio - 63 Ganadores",
  description: "Mega sorteo con 63 ganadores para la Feria de Sanrio",
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
