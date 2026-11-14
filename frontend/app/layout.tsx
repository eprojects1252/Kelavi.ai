import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kelavi.ai — Your AI Workspace",
  description: "One workspace for AI assistance, coding, projects and research.",
  applicationName: "Kelavi.ai",
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
