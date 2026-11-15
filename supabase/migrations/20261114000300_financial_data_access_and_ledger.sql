-- INCOROVA Transportes — finance data access boundary and legacy ledger sync.
-- Branch-only migration. Do not apply to the active project until the frontend
-- has been migrated to the safe column lists and finance views below.
--
-- Monetary values remain in their source tables for compatibility, but
-- authenticated users can no longer SELECT those columns directly.
-- Finance-only views expose the amounts after an explicit permission check.

begin;

-- Private trigger code is not exposed through the Supabase Data API.
create schema if not exists incorova_private;
revoke all on schema incorova_private from public, anon, authenticated;

-- Internal permission check for database triggers. This function is not exposed.
create or replace function incorova_private.has_finance_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_module_permissions ump on ump.user_id = p.id
    where p.id = auth.uid()
      and p.status = 'active'
      and ump.module_code = 'finanzas'
      and ump.can_access = true
  );
$$;


-- Finance views deliberately run with the view owner's privileges. Each view
-- has its own explicit finance authorization predicate; do not remove it.
create or replace view public.finance_trips
with (security_barrier = true) as
select t.id, t.date, t.vehicle_id, t.origin, t.destination, t.responsible,
       t.service_type, t.income, t.status, t.notes, t.created_by,
       t.created_at, t.updated_at
from public.trips t
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid())
       and p.status = 'active'
       and ump.module_code = 'finanzas'
       and ump.can_access = true
   );

create or replace view public.finance_fuel_entries
with (security_barrier = true) as
select f.id, f.vehicle_id, f.entry_date, f.liters, f.price_per_liter,
       f.gallons, f.price_per_gallon, f.previous_odometer, f.odometer,
       f.kilometers_driven, f.total_cost, f.supplier, f.notes,
       f.created_by, f.created_at, f.updated_at
from public.fuel_entries f
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

create or replace view public.finance_maintenance_records
with (security_barrier = true) as
select m.id, m.vehicle_id, m.service_date, m.maintenance_type,
       m.description, m.provider, m.cost, m.odometer, m.next_service_date,
       m.status, m.notes, m.created_by, m.created_at, m.updated_at
from public.maintenance_records m
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

create or replace view public.finance_vehicle_parts
with (security_barrier = true) as
select v.id, v.vehicle_id, v.replacement_date, v.part_name, v.action,
       v.quantity, v.unit_cost, v.total_cost, v.supplier, v.odometer,
       v.notes, v.created_by, v.created_at, v.updated_at
from public.vehicle_parts v
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

create or replace view public.finance_employees
with (security_barrier = true) as
select e.id, e.full_name, e.dpi, e.position, e.phone, e.hire_date,
       e.status, e.notes, c.monthly_base_salary, c.monthly_kpi_bonus_max,
       c.currency, c.effective_from, e.created_by, e.created_at, e.updated_at
from public.employees e
left join public.employee_compensation c on c.employee_id = e.id
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

create or replace view public.finance_employee_loans
with (security_barrier = true) as
select l.id, l.employee_id, l.reason, l.amount, l.balance,
       l.installment_amount, l.installments_total, l.installments_paid,
       l.start_date, l.status, l.notes, l.created_by, l.created_at, l.updated_at
from public.employee_loans l
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

create or replace view public.finance_payroll_records
with (security_barrier = true) as
select r.id, r.employee_id, r.period, r.fortnight, r.base_salary,
       r.bonuses, r.other_deductions, r.loan_deduction, r.net_pay,
       r.kpi_complaints, r.kpi_cleanliness, r.kpi_delays, r.kpi_percentage,
       r.status, r.payment_date, r.notes, r.created_by, r.created_at, r.updated_at
from public.payroll_records r
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

create or replace view public.finance_movements
with (security_barrier = true) as
select m.*
from public.financial_movements m
where public.is_superadmin()
   or exists (
     select 1 from public.profiles p
     join public.user_module_permissions ump on ump.user_id = p.id
     where p.id = (select auth.uid()) and p.status = 'active'
       and ump.module_code = 'finanzas' and ump.can_access = true
   );

grant select on public.finance_trips,
  public.finance_fuel_entries,
  public.finance_maintenance_records,
  public.finance_vehicle_parts,
  public.finance_employees,
  public.finance_employee_loans,
  public.finance_payroll_records,
  public.finance_movements
to authenticated;

revoke all on public.finance_trips,
  public.finance_fuel_entries,
  public.finance_maintenance_records,
  public.finance_vehicle_parts,
  public.finance_employees,
  public.finance_employee_loans,
  public.finance_payroll_records,
  public.finance_movements
from anon;

-- These operational tables have no anonymous API access.
revoke all on public.trips, public.fuel_entries, public.maintenance_records,
  public.vehicle_parts, public.employees, public.employee_loans,
  public.payroll_records
from anon;

-- Remove broad table-level SELECT, then allow only operational columns.
-- Existing INSERT/UPDATE/DELETE policies remain in force; sensitive values
-- are still written by their owning module but cannot be read back there.
revoke select on public.trips from anon, authenticated;
grant select (id, date, vehicle_id, origin, destination, responsible,
  service_type, status, notes, created_by, created_at, updated_at)
on public.trips to authenticated;

revoke select on public.fuel_entries from anon, authenticated;
grant select (id, vehicle_id, entry_date, liters, gallons,
  previous_odometer, odometer, kilometers_driven, supplier, notes,
  created_by, created_at, updated_at)
on public.fuel_entries to authenticated;

revoke select on public.maintenance_records from anon, authenticated;
grant select (id, vehicle_id, service_date, maintenance_type, description,
  provider, odometer, next_service_date, status, notes, created_by,
  created_at, updated_at)
on public.maintenance_records to authenticated;

revoke select on public.vehicle_parts from anon, authenticated;
grant select (id, vehicle_id, replacement_date, part_name, action,
  quantity, supplier, odometer, notes, created_by, created_at, updated_at)
on public.vehicle_parts to authenticated;

revoke select on public.employees from anon, authenticated;
grant select (id, full_name, dpi, position, phone, hire_date, status,
  notes, created_by, created_at, updated_at)
on public.employees to authenticated;

revoke select on public.employee_loans from anon, authenticated;
grant select (id, employee_id, reason, installments_total, installments_paid,
  start_date, status, notes, created_by, created_at, updated_at)
on public.employee_loans to authenticated;

revoke select on public.payroll_records from anon, authenticated;
grant select (id, employee_id, period, fortnight, kpi_complaints,
  kpi_cleanliness, kpi_delays, status, payment_date, notes, created_by,
  created_at, updated_at)
on public.payroll_records to authenticated;

-- Finance is the only role allowed to create or modify monetary loan and
-- payroll records. Personal-module users can still read the non-monetary fields.
create policy employee_loans_finance_write
  on public.employee_loans as restrictive for insert to authenticated
  with check (public.is_superadmin() or incorova_private.has_finance_access());
create policy employee_loans_finance_update
  on public.employee_loans as restrictive for update to authenticated
  using (public.is_superadmin() or incorova_private.has_finance_access())
  with check (public.is_superadmin() or incorova_private.has_finance_access());
create policy employee_loans_finance_delete
  on public.employee_loans as restrictive for delete to authenticated
  using (public.is_superadmin() or incorova_private.has_finance_access());

create policy payroll_records_finance_write
  on public.payroll_records as restrictive for insert to authenticated
  with check (public.is_superadmin() or incorova_private.has_finance_access());
create policy payroll_records_finance_update
  on public.payroll_records as restrictive for update to authenticated
  using (public.is_superadmin() or incorova_private.has_finance_access())
  with check (public.is_superadmin() or incorova_private.has_finance_access());
create policy payroll_records_finance_delete
  on public.payroll_records as restrictive for delete to authenticated
  using (public.is_superadmin() or incorova_private.has_finance_access());

-- A Finance user may create or update employee salary; other staff may still
-- manage the non-financial employee profile.
create or replace function incorova_private.protect_employee_salary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_superadmin() or incorova_private.has_finance_access()) then
    if tg_op = 'INSERT' and new.base_salary <> 0 then
      raise exception 'Solo Finanzas puede asignar el sueldo base';
    elsif tg_op = 'UPDATE' and old.base_salary is distinct from new.base_salary then
      raise exception 'Solo Finanzas puede modificar el sueldo base';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_employee_salary on public.employees;
create trigger protect_employee_salary
before insert or update of base_salary on public.employees
for each row execute function incorova_private.protect_employee_salary();

-- Keep the protected compensation table in sync with the legacy salary field.
create or replace function incorova_private.sync_employee_compensation_salary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.employee_compensation
    (employee_id, monthly_base_salary, monthly_kpi_bonus_max, currency)
  values (new.id, new.base_salary, 0, 'GTQ')
  on conflict (employee_id) do update
    set monthly_base_salary = excluded.monthly_base_salary,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_employee_compensation_salary on public.employees;
create trigger sync_employee_compensation_salary
after insert or update of base_salary on public.employees
for each row execute function incorova_private.sync_employee_compensation_salary();

-- Prevent operational users from changing existing expense amounts after
-- creation. They may submit a new expense, but only Finance can alter its cost.
create or replace function incorova_private.protect_legacy_financial_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_superadmin() or incorova_private.has_finance_access() then
    return new;
  end if;

  case tg_table_name
    when 'fuel_entries' then
      if old.price_per_liter is distinct from new.price_per_liter
         or old.total_cost is distinct from new.total_cost
         or old.price_per_gallon is distinct from new.price_per_gallon then
        raise exception 'Solo Finanzas puede modificar importes de combustible';
      end if;
    when 'maintenance_records' then
      if old.cost is distinct from new.cost then
        raise exception 'Solo Finanzas puede modificar el costo de mantenimiento';
      end if;
    when 'vehicle_parts' then
      if old.unit_cost is distinct from new.unit_cost
         or old.total_cost is distinct from new.total_cost then
        raise exception 'Solo Finanzas puede modificar costos de repuestos';
      end if;
    when 'trips' then
      if old.income is distinct from new.income then
        raise exception 'Solo Finanzas puede modificar el ingreso del viaje';
      end if;
  end case;
  return new;
end;
$$;

drop trigger if exists protect_trip_financial_update on public.trips;
create trigger protect_trip_financial_update
before update on public.trips
for each row execute function incorova_private.protect_legacy_financial_updates();

drop trigger if exists protect_fuel_financial_update on public.fuel_entries;
create trigger protect_fuel_financial_update
before update on public.fuel_entries
for each row execute function incorova_private.protect_legacy_financial_updates();

drop trigger if exists protect_maintenance_financial_update on public.maintenance_records;
create trigger protect_maintenance_financial_update
before update on public.maintenance_records
for each row execute function incorova_private.protect_legacy_financial_updates();

drop trigger if exists protect_parts_financial_update on public.vehicle_parts;
create trigger protect_parts_financial_update
before update on public.vehicle_parts
for each row execute function incorova_private.protect_legacy_financial_updates();

-- These tables are finance-only already at the RLS layer. Remove anonymous
-- SQL privileges explicitly as a second boundary.
revoke all on public.financial_receivables, public.financial_collections,
  public.financial_expenses, public.financial_movements,
  public.employee_compensation, public.school_student_payments
from anon;

-- Keep the legacy salary column out of new employee writes. The authoritative
-- salary lives in employee_compensation, populated for old employees in phase 2.
create or replace function incorova_private.create_employee_compensation_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.employee_compensation
    (employee_id, monthly_base_salary, monthly_kpi_bonus_max, currency)
  values (new.id, 0, 0, 'GTQ')
  on conflict (employee_id) do nothing;
  return new;
end;
$$;

drop trigger if exists employees_create_compensation on public.employees;
create trigger employees_create_compensation
after insert on public.employees
for each row execute function incorova_private.create_employee_compensation_row();

-- Synchronize legacy cash events into the central ledger. The deterministic
-- key makes replays and retries safe; deleting a source row annuls its movement.
create or replace function incorova_private.sync_legacy_financial_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_amount numeric(12,2);
  v_date date;
  v_direction text;
  v_category text;
  v_concept text;
  v_status text := 'registrado';
  v_employee_id uuid;
  v_created_by uuid;
  v_key uuid;
  v_deleted boolean := (tg_op = 'DELETE');
begin
  if v_deleted then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_id := (v_row ->> 'id')::uuid;
  v_created_by := nullif(v_row ->> 'created_by', '')::uuid;

  case tg_table_name
    when 'fuel_entries' then
      v_amount := coalesce(nullif(v_row ->> 'total_cost', '')::numeric, 0);
      v_date := (v_row ->> 'entry_date')::date;
      v_direction := 'egreso';
      v_category := 'Combustible';
      v_concept := 'Carga de combustible';
    when 'maintenance_records' then
      v_amount := coalesce(nullif(v_row ->> 'cost', '')::numeric, 0);
      v_date := (v_row ->> 'service_date')::date;
      v_direction := 'egreso';
      v_category := 'Mantenimiento';
      v_concept := coalesce(nullif(v_row ->> 'maintenance_type', ''), 'Mantenimiento');
      if lower(coalesce(v_row ->> 'status', '')) = 'cancelado' then
        v_status := 'anulado';
      elsif lower(coalesce(v_row ->> 'status', '')) not in ('completado', 'pagado') then
        v_status := 'pendiente';
      end if;
    when 'vehicle_parts' then
      v_amount := coalesce(nullif(v_row ->> 'total_cost', '')::numeric, 0);
      v_date := (v_row ->> 'replacement_date')::date;
      v_direction := 'egreso';
      v_category := 'Repuestos';
      v_concept := coalesce(nullif(v_row ->> 'part_name', ''), 'Repuesto');
    when 'employee_loans' then
      v_amount := coalesce(nullif(v_row ->> 'amount', '')::numeric, 0);
      v_date := (v_row ->> 'start_date')::date;
      v_direction := 'egreso';
      v_category := 'Préstamo a trabajador';
      v_concept := coalesce(nullif(v_row ->> 'reason', ''), 'Préstamo a trabajador');
      v_employee_id := nullif(v_row ->> 'employee_id', '')::uuid;
      if lower(coalesce(v_row ->> 'status', '')) = 'cancelado' then
        v_status := 'anulado';
      end if;
    when 'payroll_records' then
      v_amount := coalesce(nullif(v_row ->> 'net_pay', '')::numeric, 0);
      v_date := coalesce(nullif(v_row ->> 'payment_date', '')::date,
                         nullif(v_row ->> 'period', '')::date);
      v_direction := 'egreso';
      v_category := 'Planilla';
      v_concept := 'Pago de planilla';
      v_employee_id := nullif(v_row ->> 'employee_id', '')::uuid;
      if lower(coalesce(v_row ->> 'status', '')) not in ('pagada', 'paid') then
        v_status := 'pendiente';
      end if;
    when 'financial_collections' then
      v_amount := coalesce(nullif(v_row ->> 'amount', '')::numeric, 0);
      v_date := (v_row ->> 'payment_date')::date;
      v_direction := 'ingreso';
      v_category := 'Cobros';
      v_concept := 'Cobro de cuenta por cobrar';
    when 'financial_expenses' then
      v_amount := coalesce(nullif(v_row ->> 'amount', '')::numeric, 0);
      v_date := coalesce(nullif(v_row ->> 'payment_date', '')::date,
                         nullif(v_row ->> 'expense_date', '')::date);
      v_direction := 'egreso';
      v_category := coalesce(nullif(v_row ->> 'category', ''), 'Otros gastos');
      v_concept := coalesce(nullif(v_row ->> 'concept', ''), 'Gasto');
      if lower(coalesce(v_row ->> 'status', '')) = 'cancelado' then
        v_status := 'anulado';
      elsif lower(coalesce(v_row ->> 'status', '')) not in ('pagado', 'paid') then
        v_status := 'pendiente';
      end if;
    else
      raise exception 'No existe mapeo financiero para la tabla %', tg_table_name;
  end case;

  v_key := md5('legacy:' || tg_table_name || ':' || v_id::text)::uuid;

  if v_deleted or v_amount <= 0 then
    update public.financial_movements
       set status = 'anulado', updated_at = now()
     where idempotency_key = v_key;
    if v_deleted then return old; end if;
    return new;
  end if;

  insert into public.financial_movements (
    direction, movement_date, category, concept, amount, currency,
    status, source_table, source_id, employee_id, created_by,
    idempotency_key
  ) values (
    v_direction,
    (v_date::timestamp at time zone 'America/Guatemala'),
    v_category, v_concept, round(v_amount, 2), 'GTQ',
    v_status, tg_table_name, v_id, v_employee_id, v_created_by, v_key
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set
    direction = excluded.direction,
    movement_date = excluded.movement_date,
    category = excluded.category,
    concept = excluded.concept,
    amount = excluded.amount,
    status = excluded.status,
    employee_id = excluded.employee_id,
    created_by = coalesce(excluded.created_by, public.financial_movements.created_by),
    updated_at = now();

  if v_deleted then return old; end if;
  return new;
end;
$$;

-- Remove only our own trigger names before recreating them, making this block
-- safe to re-run during local review.
drop trigger if exists sync_fuel_ledger on public.fuel_entries;
create trigger sync_fuel_ledger after insert or update or delete on public.fuel_entries
for each row execute function incorova_private.sync_legacy_financial_movement();

drop trigger if exists sync_maintenance_ledger on public.maintenance_records;
create trigger sync_maintenance_ledger after insert or update or delete on public.maintenance_records
for each row execute function incorova_private.sync_legacy_financial_movement();

drop trigger if exists sync_parts_ledger on public.vehicle_parts;
create trigger sync_parts_ledger after insert or update or delete on public.vehicle_parts
for each row execute function incorova_private.sync_legacy_financial_movement();

drop trigger if exists sync_employee_loan_ledger on public.employee_loans;
create trigger sync_employee_loan_ledger after insert or update or delete on public.employee_loans
for each row execute function incorova_private.sync_legacy_financial_movement();

drop trigger if exists sync_payroll_ledger on public.payroll_records;
create trigger sync_payroll_ledger after insert or update or delete on public.payroll_records
for each row execute function incorova_private.sync_legacy_financial_movement();

drop trigger if exists sync_collection_ledger on public.financial_collections;
create trigger sync_collection_ledger after insert or update or delete on public.financial_collections
for each row execute function incorova_private.sync_legacy_financial_movement();

drop trigger if exists sync_expense_ledger on public.financial_expenses;
create trigger sync_expense_ledger after insert or update or delete on public.financial_expenses
for each row execute function incorova_private.sync_legacy_financial_movement();

-- Backfill current records through the exact same idempotent trigger path.
update public.fuel_entries set updated_at = updated_at;
update public.maintenance_records set updated_at = updated_at;
update public.vehicle_parts set updated_at = updated_at;
update public.employee_loans set updated_at = updated_at;
update public.payroll_records set updated_at = updated_at;
update public.financial_collections set created_at = created_at;
update public.financial_expenses set updated_at = updated_at;

commit;
