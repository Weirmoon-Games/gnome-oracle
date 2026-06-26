import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Gnome Oracle",
  description: "Ask the wizard. Receive nonsense. Barely any answers, maximum vibes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
