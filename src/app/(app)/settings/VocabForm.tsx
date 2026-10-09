import { updateVocab } from "./actions";
import { VOCAB_LABELS } from "@/lib/vocab";

// Client-side not needed: a plain server-rendered form posts to the action.
export default function VocabForm({ overrides }: { overrides: Record<string, string> }) {
  return (
    <form action={updateVocab} className="grid gap-4 md:grid-cols-2">
      {VOCAB_LABELS.map(([key, label]) => (
        <div key={key} className={key === "pipelineSub" ? "md:col-span-2" : ""}>
          <label className="label" htmlFor={`vocab-${key}`}>{label}</label>
          {key === "pipelineSub" ? (
            <textarea id={`vocab-${key}`} name={key} rows={2} defaultValue={overrides[key] ?? ""} className="input" />
          ) : (
            <input id={`vocab-${key}`} name={key} defaultValue={overrides[key] ?? ""} className="input" />
          )}
        </div>
      ))}
      <div className="md:col-span-2">
        <button className="btn-primary">Save vocabulary</button>
      </div>
    </form>
  );
}
