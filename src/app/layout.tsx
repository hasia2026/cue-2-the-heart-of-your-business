import type { Metadata } from "next";
import "./globals.css";
import AmbassadorWidget from "@/components/AmbassadorWidget";
import { getT } from "@/lib/locale";

export const metadata: Metadata = {
  title: "CUE — The Heart of Your Business",
  description:
    "CUE is an AI Business Operating System: capture what your business knows, understand what is happening, improve how it operates, execute decisions, and expand.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, rtl } = await getT();
  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"}>
      <body>
        {children}
        <AmbassadorWidget />
      </body>
    </html>
  );
}
