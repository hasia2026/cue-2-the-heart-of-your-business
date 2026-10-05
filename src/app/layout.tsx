import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CUE — The Heart of Your Business",
  description:
    "CUE is an AI Business Operating System: capture what your business knows, understand what is happening, improve how it operates, execute decisions, and expand.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
