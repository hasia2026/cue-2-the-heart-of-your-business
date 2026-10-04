import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

const CATEGORY_ORDER = ["ACCOUNTING", "CRM", "SCHEDULING", "PAYMENTS", "EMAIL", "STORAGE", "HR", "ECOMMERCE"];

export default async function EcosystemPage() {
  const session = await requireSession();
  const integrations = await prisma.integration.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { name: "asc" },
  });

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: integrations.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <AppShell crumb="Connected Ecosystem">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Connected Ecosystem</h1>
          <p className="muted mt-1">
            CUE's architecture is built for integrations. Demo connections use realistic local data; nothing pretends to be live. {integrations.filter((i) => i.status === "DEMO").length} demo · {integrations.filter((i) => i.status === "AVAILABLE").length} available to connect.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>Honesty note:</strong> no live connections exist in this workspace. “Demo” integrations describe the local seeded data CUE reads; “Available” integrations are architecturally supported but not connected. CUE never fakes a live integration.
        </div>

        {byCategory.map(({ cat, items }) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-2.5">{cat}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((i) => (
                <div key={i.id} className="card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-navy-900">{i.name}</span>
                    <span className={i.status === "DEMO" ? "badge-medium ml-auto" : "badge-low ml-auto"}>{i.status}</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-navy-600"><span className="font-semibold text-navy-700">Data available:</span> {i.dataAvailable}</p>
                    <p className="text-navy-600"><span className="font-semibold text-navy-700">What CUE can do:</span> {i.capabilities}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
