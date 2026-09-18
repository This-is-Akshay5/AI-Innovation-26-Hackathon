import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medical Memory",
  description: "Unified, patient-controlled medical history with auditable, selective access.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
