import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getLocale } from "@/lib/locale";
import { isRtl } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CUE — The Heart of Your Business",
  description:
    "CUE turns scattered business information into understanding, recommendations, and action. Real-Time Intelligence. Real Business Impact.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
