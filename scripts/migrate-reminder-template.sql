-- Owner-editable payment-reminder template, per-org. null = the built-in
-- localized drafts; a saved template overrides the free-text wrapper while
-- placeholder fills ({name} {days} {overdue} {invoices} {total}) stay in the
-- customer's language.
alter table business_profiles
  add column if not exists reminder_template text;
