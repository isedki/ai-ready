import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Readiness Assessment — by Issam Sedki",
  description: "An honest, evidence-based AI readiness interview. Not a survey. Find out if your organisation is actually ready to deploy AI to production.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-white">{children}</body>
    </html>
  );
}
