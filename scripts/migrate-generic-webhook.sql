-- Generic webhook integration (Zapier / Make / n8n and any hand-rolled sender):
-- one AVAILABLE row per org with a mintable secret. Traffic (not a toggle)
-- flips it to CONNECTED — same honest pattern as ReferPro.
insert into integrations (organization_id, key, name, category, status, data_available, capabilities, webhook_secret)
select o.id, 'webhook', 'Custom webhook (Zapier / Make / n8n)', 'AUTOMATION', 'AVAILABLE',
       'Leads and signals pushed from any automation platform, verified secret URL',
       'POST {title, text, source, url, id, author, timestamp} — lands in Market Signals, classified (BUY/SELL/SERVICE), deduped, and BUY/SERVICE pulses alert you instantly',
       gen_random_uuid()::text
from organizations o
where not exists (select 1 from integrations i where i.organization_id = o.id and i.key = 'webhook');

-- Mint secrets where the row predates this migration.
update integrations
set webhook_secret = gen_random_uuid()::text
where key = 'webhook' and webhook_secret is null;
