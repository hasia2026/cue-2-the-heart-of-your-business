-- Training module upgrades: imported lessons/videos + quizzes + employee attempt tracking.
-- Idempotent; safe to re-run.

alter table training_modules
  add column if not exists content_url text,
  add column if not exists quiz jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid;

create table if not exists training_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  module_id uuid not null references training_modules(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  score int not null,
  total int not null,
  created_at timestamptz not null default now()
);
create index if not exists attempts_org_idx on training_attempts(organization_id);
create index if not exists attempts_module_idx on training_attempts(module_id);

-- Demo seed: two imported modules with quizzes for the demo org (idempotent by title).
insert into training_modules (organization_id, title, summary, category, source, content, quiz)
select o.id, 'Trade-in appraisal pitch', 'Turn service visits into appraisal leads with a 30-second pitch.',
       'CUSTOMER', 'IMPORTED',
       E'Step 1 — Notice the car. Every service customer owns a vehicle with trade-in value.\nStep 2 — Ask the one question: "Curious what it is worth these days?"\nStep 3 — Offer the free appraisal while they wait: 10 minutes, no obligation, written number.\nStep 4 — Log it as an appraisal lead in Pipeline the same day, tagged to the service RO.',
       '[
         {"q": "When should you mention the trade-in appraisal?", "choices": ["After they pay", "During the service visit", "Only if they ask", "In a monthly email"], "answer": 2},
         {"q": "What do you promise in the appraisal offer?", "choices": ["Instant cash", "A written number, no obligation", "A discount coupon", "A free detail"], "answer": 2},
         {"q": "Where does the lead go after the conversation?", "choices": ["Nowhere", "Post-it note", "Pipeline, same day, tagged to the RO", "Tell a manager someday"], "answer": 3}
       ]'::jsonb
from organizations o
where o.name = 'Northgate Auto Group'
  and not exists (select 1 from training_modules t where t.organization_id = o.id and t.title = 'Trade-in appraisal pitch');

insert into training_modules (organization_id, title, summary, category, source, content_url, content, quiz)
select o.id, 'Service lane to sales handoff', 'The five-minute handoff that converts fixed-ops trust into a sales conversation.',
       'PROCESS', 'IMPORTED',
       'https://www.youtube.com/results?search_query=service+drive+to+sales+handoff+dealership',
       'Watch the short video (or read below), then take the quiz.\nThe handoff happens at invoice signing: the service advisor introduces the salesperson by name, mentions today''s appraisal number, and books a concrete next step before the customer leaves. Nothing is pushed — the customer is offered information they already asked for. The handoff is logged in Pipeline so CUE can measure conversion.',
       '[
         {"q": "When does the handoff happen?", "choices": ["At invoice signing", "Next day by phone", "After the first oil change", "Never"], "answer": 1},
         {"q": "What must be booked before the customer leaves?", "choices": ["Another service visit", "A concrete next step", "A survey link", "Nothing"], "answer": 2},
         {"q": "Why log the handoff in Pipeline?", "choices": ["It is required by law", "To look busy", "So CUE can measure conversion", "For the newsletter"], "answer": 3}
       ]'::jsonb
from organizations o
where o.name = 'Northgate Auto Group'
  and not exists (select 1 from training_modules t where t.organization_id = o.id and t.title = 'Service lane to sales handoff');
