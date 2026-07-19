import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sitzungsplaner OV Grüne",
  description: "Wöchentliche Verfügbarkeit für Sitzungstermine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
