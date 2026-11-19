-- Field Ops / Housecall Pro schema gate.
--
-- Run with --require-all-true so a missing column or index exits non-zero:
--   node --env-file=.env scripts/run-sql.mjs scripts/verify-field-ops-schema.sql --require-all-true
--
-- This checks schema only. Connector rows are created per organization by the
-- migration for existing orgs and by the connect action for new ones, so an
-- empty database is a valid pass.
with expected_columns(table_name, column_name) as (
  values
    ('housecall_webhook_events', 'organization_id'),
    ('housecall_webhook_events', 'provider_event_id'),
    ('housecall_webhook_events', 'event_name'),
    ('housecall_webhook_events', 'entity_type'),
    ('housecall_webhook_events', 'entity_external_id'),
    ('housecall_webhook_events', 'company_id'),
    ('housecall_webhook_events', 'event_occurred_at'),
    ('housecall_webhook_events', 'signature_status'),
    ('housecall_webhook_events', 'signature_verified'),
    ('housecall_webhook_events', 'status'),
    ('housecall_webhook_events', 'attempts'),
    ('housecall_webhook_events', 'last_error'),
    ('housecall_webhook_events', 'raw_body'),
    ('housecall_webhook_events', 'payload'),
    ('housecall_webhook_events', 'headers'),
    ('housecall_webhook_events', 'counts'),
    ('housecall_webhook_events', 'reconciliation'),
    ('housecall_webhook_events', 'received_at'),
    ('housecall_webhook_events', 'last_attempt_at'),
    ('housecall_webhook_events', 'processed_at'),
    ('housecall_webhook_events', 'replayed_at'),
    ('housecall_webhook_events', 'replayed_by')
),
checks(label, ok) as (
  values
    ('field_ops_rules table',
      to_regclass('public.field_ops_rules') is not null),
    ('field_ops_rules.rule_key',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'field_ops_rules' and column_name = 'rule_key')),
    ('field_ops_rules.enabled',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'field_ops_rules' and column_name = 'enabled')),
    ('field_ops_rules unique rule key',
      to_regclass('public.field_ops_rules_organization_id_rule_key_key') is not null),

    ('appointment_confirmations table',
      to_regclass('public.appointment_confirmations') is not null),
    ('appointment_confirmations.appointment_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'appointment_id')),
    ('appointment_confirmations.token',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'token')),
    ('appointment_confirmations.status',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'status')),
    ('appointment_confirmations.method',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'method')),
    ('appointment_confirmations.sent_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'sent_at')),
    ('appointment_confirmations.confirmed_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'confirmed_at')),
    ('appointment_confirmations.confirmed_by',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'confirmed_by')),
    ('appointment_confirmations unique appointment',
      to_regclass('public.appointment_confirmations_appointment_id_key') is not null),
    ('appointment_confirmations unique token',
      to_regclass('public.appointment_confirmations_token_key') is not null),
    ('appointment_confirmations.auto_send_attempted_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'auto_send_attempted_at')),
    ('appointment_confirmations.auto_send_error',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointment_confirmations' and column_name = 'auto_send_error')),

    ('booking_deposits table',
      to_regclass('public.booking_deposits') is not null),
    ('booking_deposits.appointment_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'booking_deposits' and column_name = 'appointment_id')),
    ('booking_deposits.status',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'booking_deposits' and column_name = 'status')),

    ('appointments.confirmed_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'confirmed_at')),
    ('appointments.external_source',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'external_source')),
    ('appointments.external_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'external_id')),
    ('appointments.external_job_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'external_job_id')),
    ('appointments.service_order_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'service_order_id')),
    ('appointments.ends_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'ends_at')),
    ('appointments.arrival_window_minutes',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'arrival_window_minutes')),
    ('appointments.external_confirmation_status',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'external_confirmation_status')),
    ('appointments.external_confirmed_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'external_confirmed_at')),
    ('appointments.last_synced_at',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'last_synced_at')),
    ('appointments external index',
      to_regclass('public.appointments_org_external_idx') is not null),
    ('appointments service-order index',
      to_regclass('public.appointments_service_order_idx') is not null),

    ('customers.external_source',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'customers' and column_name = 'external_source')),
    ('customers.external_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'customers' and column_name = 'external_id')),
    ('customers external index',
      to_regclass('public.customers_org_external_idx') is not null),
    ('service_orders.external_source',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'service_orders' and column_name = 'external_source')),
    ('service_orders.external_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'service_orders' and column_name = 'external_id')),
    ('service_orders external index',
      to_regclass('public.service_orders_org_external_idx') is not null),
    ('invoices.external_source',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices' and column_name = 'external_source')),
    ('invoices.external_id',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices' and column_name = 'external_id')),
    ('invoices external index',
      to_regclass('public.invoices_org_external_idx') is not null),

    ('integrations.api_key_enc',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'integrations' and column_name = 'api_key_enc')),
    ('integrations.account_name',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'integrations' and column_name = 'account_name')),
    ('integrations.webhook_secret',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'integrations' and column_name = 'webhook_secret')),
    ('integrations.webhook_signing_secret_enc',
      exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'integrations' and column_name = 'webhook_signing_secret_enc')),

    ('housecall_webhook_events table',
      to_regclass('public.housecall_webhook_events') is not null),

    ('housecall_webhook_events unique delivery',
      to_regclass('public.housecall_webhook_events_organization_id_provider_event_id_key') is not null),
    ('housecall_webhook_events org time index',
      to_regclass('public.housecall_webhook_events_org_time_idx') is not null),
    ('housecall_webhook_events org status index',
      to_regclass('public.housecall_webhook_events_org_status_idx') is not null)
  union all
  select format('%s.%s', e.table_name, e.column_name),
         c.column_name is not null
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name
)
select label, ok from checks order by label;
