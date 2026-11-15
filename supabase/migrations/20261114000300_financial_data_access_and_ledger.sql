-- INCOROVA Transportes — finance data access boundary and legacy ledger sync.
-- Branch-only migration. Do not apply to the active project until all three
-- migrations have been reviewed and tested in an isolated database environment.
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

-- RLS policies need this one boolean helper. Client sessions cannot execute
-- any trigger helper directly.
grant usage on schema incorova_private to authenticated;
revoke execute on all functions in schema incorova_private from public, anon, authenticated;
grant execute on function incorova_private.has_finance_access() to authenticated;

alter default privileges in schema incorova_private
  revoke execute on functions from public, anon, authenticated;

-- Finance views deliberately run with the view owner's privileges. Each view
-- has its own explicit finance authorization predicate; do not remove it.
create or replace view public.finance_trips
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
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
with (security_barrier = true, security_invoker = false) as
select m.*, s.full_name as student_name, s.student_code
from public.financial_movements m
left join public.school_students s on s.id = m.student_id
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

-- The idempotency marker is only writable by the database trigger.
revoke update on public.payroll_records from authenticated;
grant update (employee_id, period, fortnight, base_salary, bonuses,
  other_deductions, loan_deduction, net_pay, kpi_complaints,
  kpi_cleanliness, kpi_delays, kpi_percentage, status, payment_date,
  notes, updated_at)
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
  using ((public.is_superadmin() or incorova_private.has_finance_access())
    and status <> 'Pagada')
  with check (public.is_superadmin() or incorova_private.has_finance_access());
create policy payroll_records_finance_delete
  on public.payroll_records as restrictive for delete to authenticated
  using ((public.is_superadmin() or incorova_private.has_finance_access())
    and status <> 'Pagada');

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

-- Keep compensation audit timestamps database-generated.
create or replace function incorova_private.touch_employee_compensation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_compensation_touch_updated_at on public.employee_compensation;
create trigger employee_compensation_touch_updated_at
before update on public.employee_compensation
for each row execute function incorova_private.touch_employee_compensation();

-- Keep the protected compensation table in sync with the legacy salary field.
create or replace function incorova_private.sync_employee_compensation_salary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if tg_op = 'UPDATE' and old.base_salary is not distinct from new.base_salary then
    return new;
  end if;

  insert into public.employee_compensation
    (employee_id, monthly_base_salary, monthly_kpi_bonus_max, currency)
  values (new.id, new.base_salary, 0, 'GTQ')
  on conflict (employee_id) do update
    set monthly_base_salary = excluded.monthly_base_salary,
        effective_from = current_date,
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
      if tg_op = 'INSERT' then
        if new.price_per_liter <> 0 or new.total_cost <> 0
           or new.price_per_gallon <> 0 then
          raise exception 'Solo Finanzas puede asignar importes de combustible';
        end if;
      elsif old.price_per_liter is distinct from new.price_per_liter
         or old.total_cost is distinct from new.total_cost
         or old.price_per_gallon is distinct from new.price_per_gallon then
        raise exception 'Solo Finanzas puede modificar importes de combustible';
      end if;
    when 'maintenance_records' then
      if tg_op = 'INSERT' then
        if new.cost <> 0 then raise exception 'Solo Finanzas puede asignar el costo de mantenimiento'; end if;
      elsif old.cost is distinct from new.cost then
        raise exception 'Solo Finanzas puede modificar el costo de mantenimiento';
      end if;
    when 'vehicle_parts' then
      if tg_op = 'INSERT' then
        if new.unit_cost <> 0 or new.total_cost <> 0 then
          raise exception 'Solo Finanzas puede asignar costos de repuestos';
        end if;
      elsif old.unit_cost is distinct from new.unit_cost
         or old.total_cost is distinct from new.total_cost then
        raise exception 'Solo Finanzas puede modificar costos de repuestos';
      end if;
    when 'trips' then
      if tg_op = 'INSERT' then
        if new.income <> 0 then raise exception 'Solo Finanzas puede asignar el ingreso del viaje'; end if;
      elsif old.income is distinct from new.income then
        raise exception 'Solo Finanzas puede modificar el ingreso del viaje';
      end if;
  end case;
  return new;
end;
$$;

drop trigger if exists protect_trip_financial_update on public.trips;
create trigger protect_trip_financial_update
before insert or update on public.trips
for each row execute function incorova_private.protect_legacy_financial_updates();

drop trigger if exists protect_fuel_financial_update on public.fuel_entries;
create trigger protect_fuel_financial_update
before insert or update on public.fuel_entries
for each row execute function incorova_private.protect_legacy_financial_updates();

drop trigger if exists protect_maintenance_financial_update on public.maintenance_records;
create trigger protect_maintenance_financial_update
before insert or update on public.maintenance_records
for each row execute function incorova_private.protect_legacy_financial_updates();

drop trigger if exists protect_parts_financial_update on public.vehicle_parts;
create trigger protect_parts_financial_update
before insert or update on public.vehicle_parts
for each row execute function incorova_private.protect_legacy_financial_updates();

-- The central ledger and received collections are append-only for client
-- sessions. Their writes happen through database triggers and checked RPCs.
revoke insert, update, delete on public.financial_movements from authenticated;
revoke insert, update, delete on public.financial_collections from authenticated;

-- Never cascade-delete a receivable that already has real collections.
create or replace function incorova_private.prevent_receivable_delete_with_collections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if exists (
    select 1 from public.financial_collections c
    where c.receivable_id = old.id
  ) then
    raise exception 'No se puede eliminar una cuenta que ya tiene cobros registrados';
  end if;
  return old;
end;
$;

drop trigger if exists prevent_receivable_delete_with_collections on public.financial_receivables;
create trigger prevent_receivable_delete_with_collections
before delete on public.financial_receivables
for each row execute function incorova_private.prevent_receivable_delete_with_collections();

-- These tables are finance-only already at the RLS layer. Remove anonymous
-- SQL privileges explicitly as a second boundary.
revoke all on public.financial_receivables, public.financial_collections,
  public.financial_expenses, public.financial_movements,
  public.employee_compensation, public.school_student_payments
from anon;

-- New loan records must track a valid installment count and cannot mark
-- more installments paid than were agreed. Existing null counts remain historical.
alter table public.employee_loans
  add constraint employee_loans_installments_paid_not_over_total
  check (installments_total is null or installments_paid <= installments_total);

-- Derive the scheduled installment from the principal and agreed count.
create or replace function incorova_private.calculate_loan_installment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.installments_total is null then
    raise exception 'Indica el número de cuotas del préstamo';
  elsif tg_op = 'UPDATE' and old.installments_total is not null
        and new.installments_total is null then
    raise exception 'El número de cuotas no puede quedar vacío';
  end if;

  if new.installments_total is not null then
    if new.amount < new.installments_total * 0.01 then
      raise exception 'El monto no alcanza para cubrir al menos Q0.01 por cuota';
    end if;
    new.installment_amount := round(new.amount / new.installments_total, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists employee_loans_calculate_installment on public.employee_loans;
create trigger employee_loans_calculate_installment
before insert or update of amount, installments_total, installment_amount
on public.employee_loans
for each row execute function incorova_private.calculate_loan_installment();

-- Quincenal payroll: the database calculates salary, KPI bonus and loan
-- deductions. Historical rows (fortnight = 0) are deliberately left untouched.
alter table public.payroll_records
  add column if not exists loan_deduction_applied_at timestamptz;

create or replace function incorova_private.prepare_payroll_calculation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monthly_salary numeric(12,2);
  v_monthly_bonus_max numeric(12,2);
  v_kpi_percentage numeric(5,2);
  v_loan_deduction numeric(12,2);
begin
  if not (public.is_superadmin() or incorova_private.has_finance_access()) then
    raise exception 'Solo Finanzas puede calcular y registrar planilla';
  end if;

  if tg_op = 'UPDATE' and old.status = 'Pagada' and new.status <> 'Pagada' then
    raise exception 'Una quincena pagada no puede volver a estado pendiente';
  end if;

  if new.fortnight = 0 then
    return new;
  end if;

  if new.fortnight not in (1, 2) then
    raise exception 'La quincena debe ser 1 o 2';
  end if;

  select c.monthly_base_salary, c.monthly_kpi_bonus_max
    into v_monthly_salary, v_monthly_bonus_max
  from public.employee_compensation c
  where c.employee_id = new.employee_id;

  if not found then
    raise exception 'El trabajador no tiene una configuración de sueldo en Finanzas';
  end if;

  new.base_salary := round(v_monthly_salary / 2, 2);

  if new.kpi_complaints is not null
     and new.kpi_cleanliness is not null
     and new.kpi_delays is not null then
    v_kpi_percentage := public.calculate_kpi_percentage(
      new.kpi_complaints, new.kpi_cleanliness, new.kpi_delays
    );
  else
    v_kpi_percentage := null;
  end if;

  new.kpi_percentage := v_kpi_percentage;
  new.bonuses := round(v_monthly_bonus_max * coalesce(v_kpi_percentage, 0) / 100 / 2, 2);

  select coalesce(sum(
    case
      when l.installments_total is not null
           and l.installments_paid + 1 >= l.installments_total then l.balance
      else least(l.installment_amount, l.balance)
    end
  ), 0)
    into v_loan_deduction
  from public.employee_loans l
  where l.employee_id = new.employee_id
    and l.status = 'Activo'
    and l.balance > 0
    and (l.installments_total is null or l.installments_paid < l.installments_total);

  new.loan_deduction := round(v_loan_deduction, 2);
  if coalesce(new.other_deductions, 0) + new.loan_deduction
     > new.base_salary + new.bonuses then
    raise exception 'Las deducciones no pueden superar el ingreso quincenal';
  end if;
  new.net_pay := round(
    new.base_salary + new.bonuses
    - coalesce(new.other_deductions, 0)
    - new.loan_deduction, 2
  );

  return new;
end;
$$;

drop trigger if exists payroll_records_calculate_kpi on public.payroll_records;
drop function if exists public.set_payroll_kpi_percentage();
drop trigger if exists payroll_records_prepare_calculation on public.payroll_records;
create trigger payroll_records_prepare_calculation
before insert or update of employee_id, period, fortnight, kpi_complaints,
  kpi_cleanliness, kpi_delays, kpi_percentage, other_deductions,
  loan_deduction, base_salary, bonuses, net_pay, status
on public.payroll_records
for each row execute function incorova_private.prepare_payroll_calculation();

create or replace function incorova_private.apply_payroll_loan_deductions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan record;
  v_remaining numeric(12,2);
  v_deduction numeric(12,2);
begin
  if not (public.is_superadmin() or incorova_private.has_finance_access()) then
    raise exception 'Solo Finanzas puede aplicar descuentos de préstamos';
  end if;

  if new.fortnight not in (1, 2)
     or new.status <> 'Pagada'
     or new.loan_deduction_applied_at is not null then
    return new;
  end if;

  v_remaining := coalesce(new.loan_deduction, 0);

  for v_loan in
    select l.id, l.installment_amount, l.balance,
           l.installments_total, l.installments_paid
    from public.employee_loans l
    where l.employee_id = new.employee_id
      and l.status = 'Activo'
      and l.balance > 0
      and (l.installments_total is null or l.installments_paid < l.installments_total)
    order by l.created_at, l.id
    for update
  loop
    exit when v_remaining <= 0;

    v_deduction := least(
      v_loan.balance,
      v_remaining,
      case
        when v_loan.installments_total is not null
             and v_loan.installments_paid + 1 >= v_loan.installments_total then v_loan.balance
        else v_loan.installment_amount
      end
    );
    if v_deduction <= 0 then
      continue;
    end if;

    update public.employee_loans
    set balance = greatest(0, balance - v_deduction),
        installments_paid = installments_paid + 1,
        status = case
          when balance - v_deduction <= 0 then 'Pagado'
          when installments_total is not null
               and installments_paid + 1 >= installments_total then 'Pagado'
          else 'Activo'
        end,
        updated_at = now()
    where id = v_loan.id;

    v_remaining := v_remaining - v_deduction;
  end loop;

  if v_remaining > 0.01 then
    raise exception 'No se pudo aplicar el descuento completo de préstamos; la quincena no se marcará como pagada';
  end if;

  update public.payroll_records
  set loan_deduction_applied_at = now()
  where id = new.id
    and loan_deduction_applied_at is null;

  return new;
end;
$$;

drop trigger if exists payroll_apply_loan_deductions on public.payroll_records;
create trigger payroll_apply_loan_deductions
after insert or update of status on public.payroll_records
for each row execute function incorova_private.apply_payroll_loan_deductions();

-- Atomic receivable collection: insert the collection, update the balance
-- status and let the ledger trigger run in the same database transaction.
alter table public.financial_collections
  add column if not exists request_key uuid;

create unique index if not exists financial_collections_request_key_uidx
  on public.financial_collections(request_key)
  where request_key is not null;

create or replace function public.register_financial_collection(
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_collection_id uuid;
  v_receivable_amount numeric(12,2);
  v_receivable_status text;
  v_collected numeric(12,2);
  v_remaining numeric(12,2);
  v_payment_amount numeric(12,2);
begin
  if not (public.is_superadmin() or incorova_private.has_finance_access()) then
    raise exception 'No tienes permiso para registrar cobros';
  end if;

  if p_request_key is null then
    raise exception 'Se requiere una clave de solicitud para evitar cobros duplicados';
  end if;

  select id into v_collection_id
  from public.financial_collections
  where request_key = p_request_key;

  if v_collection_id is not null then
    return v_collection_id;
  end if;

  select amount, status into v_receivable_amount, v_receivable_status
  from public.financial_receivables
  where id = p_receivable_id
  for update;

  if not found then
    raise exception 'La cuenta por cobrar no existe';
  end if;
  if v_receivable_status = 'Cancelada' then
    raise exception 'No se puede registrar un cobro en una cuenta cancelada';
  end if;

  -- Recheck after the receivable lock to serialize concurrent collection attempts.
  select id into v_collection_id
  from public.financial_collections
  where request_key = p_request_key;

  if v_collection_id is not null then
    return v_collection_id;
  end if;

  select coalesce(sum(amount), 0) into v_collected
  from public.financial_collections
  where receivable_id = p_receivable_id;

  v_remaining := v_receivable_amount - v_collected;

  v_payment_amount := round(coalesce(p_amount, 0), 2);
  if v_payment_amount <= 0 or v_payment_amount > v_remaining then
    raise exception 'El abono debe ser mayor a cero y no puede superar el saldo pendiente';
  end if;

  insert into public.financial_collections (
    receivable_id, amount, payment_date, payment_method,
    reference, notes, created_by, request_key
  ) values (
    p_receivable_id, v_payment_amount, coalesce(p_payment_date, current_date),
    coalesce(nullif(p_payment_method, ''), 'Transferencia'),
    coalesce(p_reference, ''), coalesce(p_notes, ''), auth.uid(), p_request_key
  )
  on conflict (request_key) where request_key is not null
  do nothing
  returning id into v_collection_id;

  if v_collection_id is null then
    select id into v_collection_id
    from public.financial_collections
    where request_key = p_request_key;
    return v_collection_id;
  end if;

  v_remaining := v_remaining - v_payment_amount;

  update public.financial_receivables
  set status = case when v_remaining <= 0.009 then 'Pagada' else 'Parcial' end,
      updated_at = now()
  where id = p_receivable_id;

  return v_collection_id;
end;
$$;

revoke all on function public.register_financial_collection(
  uuid, numeric, date, text, text, text, uuid
) from public, anon;
grant execute on function public.register_financial_collection(
  uuid, numeric, date, text, text, text, uuid
) to authenticated;

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

  insert into public.financial_movements as fm (
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
    created_by = coalesce(excluded.created_by, fm.created_by),
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

-- Reassert function execution boundaries after all internal functions exist.
revoke execute on all functions in schema incorova_private from public, anon, authenticated;
grant execute on function incorova_private.has_finance_access() to authenticated;

commit;
