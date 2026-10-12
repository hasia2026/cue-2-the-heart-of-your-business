import { updateIndustryPack } from "./actions";
import { getVocab, INDUSTRY_PACKS } from "@/lib/vocab";

// Server-rendered switcher: pick a pack (Auto Dealership | HVAC | Custom),
// save, and every dashboard/pipeline/inventory/compass label flips. Custom
// keeps per-label overrides unchanged (see VocabForm).
export default async function IndustryPackForm({ orgId }: { orgId: string }) {
  const vocab = await getVocab(orgId);
  return (
    <form action={updateIndustryPack} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="label" htmlFor="industryPack">Pack</label>
        <select id="industryPack" name="industryPack" defaultValue={vocab.pack} className="input">
          {INDUSTRY_PACKS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <button className="btn-primary">Switch pack</button>
    </form>
  );
}
