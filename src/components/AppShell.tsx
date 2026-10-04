import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadThreads } from "@/lib/messages";
import { getLocale } from "@/lib/locale";
import { isRtl } from "@/lib/i18n";
import NavClient from "./NavClient";
import LanguageSwitcher from "./LanguageSwitcher";

export default async function AppShell({
  children,
  crumb,
}: {
  children: React.ReactNode;
  crumb?: string;
}) {
  const session = await requireSession();
  const locale = await getLocale();
  const rtl = isRtl(locale);

  const [pendingRecs, openTasks, unreadMsgs, newSignals, leadsWaiting] = await Promise.all([
    prisma.recommendation.count({
      where: { organizationId: session.organizationId, status: "PENDING" },
    }),
    prisma.task.count({
      where: {
        organizationId: session.organizationId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    countUnreadThreads(session.organizationId),
    prisma.marketSignal.count({ where: { organizationId: session.organizationId, status: "NEW" } }),
    prisma.lead.count({
      where: { organizationId: session.organizationId, status: "NEW", lastContactAt: null },
    }),
  ]);

  return (
    <div className="min-h-screen flex">
      <NavClient
        orgName={session.organizationName}
        userName={session.user.name}
        pendingRecs={pendingRecs}
        openTasks={openTasks}
        unreadMsgs={unreadMsgs}
        newSignals={newSignals}
        leadsWaiting={leadsWaiting}
        locale={locale}
      />
      <div className={`flex-1 min-w-0 flex flex-col lg:pl-64 ${rtl ? "rtl-main" : ""}`}>
        <header className="sticky top-0 z-30 bg-ink-950/70 backdrop-blur-md border-b border-navy-100">
          <div className="flex items-center gap-3 px-4 sm:px-8 h-14">
            <div className="text-sm text-navy-400">
              CUE <span className="mx-1.5 text-navy-300">/</span>
              <span className="text-navy-800 font-medium">
                {crumb ?? "Dashboard"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher current={locale} compact />
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple text-white text-xs font-semibold flex items-center justify-center">
                {session.user.name.split(" ").map((p) => p[0]).join("")}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
