import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { baseAppUrl, plainPlansUrl } from "@/lib/plan-links";
import ServicePlans from "../ServicePlans";
import { savePlan, deletePlan, convertSignup, dismissSignup } from "../actions";

export const dynamic = "force-dynamic";

export default async function ServicePlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const planErr = sp.planErr instanceof Array ? sp.planErr[0]! : sp.planErr ?? null;
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const planRows = await sql`
    select id, name, blurb, annual_value, visits_per_year, featured, active
    from service_plans where organization_id = ${orgId}
    order by featured desc, position asc, name asc`;
  const signupRows = await sql`
    select s.id, s.plan_name, s.contact_name, s.contact_email, s.contact_phone,
      s.address, s.message, s.source, s.source_ref, s.customer_matched as "customerMatched",
      s.status, s.submitted_at as "submittedAt", c.name as "customerName"
    from plan_signups s
    left join customers c on c.id = s.customer_id
    where s.organization_id = ${orgId}
    order by (s.status = 'PENDING') desc, s.submitted_at desc
    limit 50`;
  const base = await baseAppUrl();
  const localeUrls: Record<string, string> = {};
  const plain = plainPlansUrl(base, orgId);
  for (const l of ["en", "es", "ar", "vi"]) {
    localeUrls[l] = l === "en" ? plain : `${plain}?lang=${l}`;
  }
  const plans = planRows.map((p) => ({
    id: String(p.id), name: String(p.name), blurb: p.blurb ? String(p.blurb) : null,
    annualValue: Number(p.annual_value) || 0, visitsPerYear: p.visits_per_year != null ? Number(p.visits_per_year) : null,
    featured: p.featured === true, active: p.active === true,
  }));
  const signups = signupRows.map((s) => ({
    id: String(s.id), planName: String(s.plan_name), contactName: String(s.contact_name),
    contactEmail: s.contact_email ? String(s.contact_email) : null,
    contactPhone: s.contact_phone ? String(s.contact_phone) : null,
    address: s.address ? String(s.address) : null,
    message: s.message ? String(s.message) : null,
    source: String(s.source), sourceRef: s.source_ref ? String(s.source_ref) : null,
    customerMatched: s.customerMatched === true,
    customerName: s.customerName ? String(s.customerName) : null,
    status: String(s.status), submittedAt: new Date(s.submittedAt as string).toISOString(),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/enhance" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Enhance</Link>
        <h1 className="page-title mt-2">Service Plans</h1>
        <p className="page-sub">Build the offer ladder, share tracked sign-up links, and turn interested owners into active agreements.</p>
      </div>

      <ServicePlans
        plans={plans}
        signups={signups}
        plansUrl={plain}
        localeUrls={localeUrls}
        canEdit={session.role !== "MEMBER"}
        planErr={planErr}
        actions={{ savePlan, deletePlan, convertSignup, dismissSignup }}
      />
    </div>
  );
}
