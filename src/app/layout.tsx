import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AmbassadorWidget from "@/components/AmbassadorWidget";
import { getT } from "@/lib/locale";
import { TEXT_SCALE_COOKIE, getTextScalePercent } from "@/lib/text-scale";

export const metadata: Metadata = {
  title: "CUE — The Heart of Your Business",
  description:
    "CUE is an AI Business Operating System: capture what your business knows, understand what is happening, improve how it operates, execute decisions, and expand.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, rtl } = await getT();
  const jar = await cookies();
  const scale = getTextScalePercent(jar.get(TEXT_SCALE_COOKIE)?.value);
  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} suppressHydrationWarning
      // Accessibility: root font-size scale (Settings → Text size). Applied
      // server-side from the cookie so the first paint is already correct.
      style={{ fontSize: `${scale}%` }}>
      <head>
        {/* Apply the saved theme before first paint — no light/dark flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('cue-theme')==='light')document.documentElement.classList.add('light')}catch(e){}",
          }}
        />
      </head>
      <body>
        {children}
        <AmbassadorWidget />
      </body>
    </html>
  );
}
