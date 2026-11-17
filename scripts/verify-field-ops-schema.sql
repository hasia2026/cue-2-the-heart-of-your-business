-- Run after the Field Ops / Housecall Pro migrations. Every value must be true
-- before the connector or /field-ops page is enabled in production.
select
  to_regclass('public.field_ops_rules') is not null as field_ops_rules,
  to_regclass('public.appointment_confirmations') is not null as appointment_confirmations,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'confirmed_at'
  ) as appointment_confirmed_at,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'external_id'
  ) as appointments_external_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'service_order_id'
  ) as appointments_service_order_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'external_id'
  ) as customers_external_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_orders' and column_name = 'external_id'
  ) as service_orders_external_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'external_id'
  ) as invoices_external_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'api_key_enc'
  ) as integrations_api_key_enc,
  exists (
    select 1 from integrations where key = 'housecall_pro'
  ) as housecall_pro_rows;