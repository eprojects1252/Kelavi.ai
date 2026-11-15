import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kilavi.Ai — Your AI Workspace",
  description: "One workspace for AI assistance, coding, projects and research.",
  applicationName: "Kilavi.Ai",
  icons: { icon: "/fonts/k2-brain-logo.png", shortcut: "/fonts/k2-brain-logo.png", apple: "/fonts/k2-brain-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080b16",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
