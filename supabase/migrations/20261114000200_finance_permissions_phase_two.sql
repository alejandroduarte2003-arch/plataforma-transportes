-- INCOROVA Transportes — finance and permissions phase 2.
-- Branch-only migration. Do not apply to production until frontend is migrated
-- to the RPCs and the security review is complete.

begin;

-- Correct the ledger's idempotency model: one source can generate many events
-- (e.g. multiple partial collections), but one request key must never duplicate.
alter table public.financial_movements
  drop constraint if exists financial_movements_source_table_source_id_key,
  add column if not exists idempotency_key uuid;

create unique index if not exists financial_movements_idempotency_key_uidx
  on public.financial_movements (idempotency_key)
  where idempotency_key is not null;

alter table public.financial_movements
  add constraint financial_movements_student_id_fkey
  foreign key (student_id) references public.school_students(id) on delete restrict;

-- The source key belongs to the event, not only to its source record.
alter table public.school_student_payments
  add column if not exists request_key uuid;

create unique index if not exists school_student_payments_request_key_uidx
  on public.school_student_payments (request_key)
  where request_key is not null;

-- Per-user capabilities for the school module. Module access alone does not
-- grant edit rights or payment registration.
create table if not exists public.school_user_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  can_edit_students boolean not null default false,
  can_edit_followups boolean not null default false,
  can_register_payments boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.school_user_permissions enable row level security;

grant select, insert, update, delete on public.school_user_permissions to authenticated;
revoke all on public.school_user_permissions from anon;

create policy school_user_permissions_superadmin_manage
  on public.school_user_permissions for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Read access is still controlled by the school module. Restrictive write
-- policies override the broad module policy created in phase 1.
create policy school_students_insert_capability
  on public.school_students as restrictive for insert to authenticated
  with check (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_students = true)
  );
create policy school_students_update_capability
  on public.school_students as restrictive for update to authenticated
  using (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_students = true)
  )
  with check (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_students = true)
  );
create policy school_students_delete_capability
  on public.school_students as restrictive for delete to authenticated
  using (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_students = true)
  );

create policy school_student_followups_insert_capability
  on public.school_student_followups as restrictive for insert to authenticated
  with check (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_followups = true)
  );
create policy school_student_followups_update_capability
  on public.school_student_followups as restrictive for update to authenticated
  using (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_followups = true)
  )
  with check (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_followups = true)
  );
create policy school_student_followups_delete_capability
  on public.school_student_followups as restrictive for delete to authenticated
  using (
    public.is_superadmin()
    or exists (select 1 from public.school_user_permissions s
      where s.user_id = (select auth.uid()) and s.can_edit_followups = true)
  );

-- A server-side KPI calculation guarantees equal weighting and the agreed
-- 1..5 => 0,25,50,75,100 conversion.
create or replace function public.calculate_kpi_percentage(
  p_complaints smallint,
  p_cleanliness smallint,
  p_delays smallint
) returns numeric
language sql immutable
set search_path = public
as $$
  select round((
    ((p_complaints - 1) * 25.0) +
    ((p_cleanliness - 1) * 25.0) +
    ((p_delays - 1) * 25.0)
  ) / 3.0, 2)
  where p_complaints between 1 and 5
    and p_cleanliness between 1 and 5
    and p_delays between 1 and 5;
$$;

create or replace function public.set_payroll_kpi_percentage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kpi_complaints is not null
     and new.kpi_cleanliness is not null
     and new.kpi_delays is not null then
    new.kpi_percentage := public.calculate_kpi_percentage(
      new.kpi_complaints, new.kpi_cleanliness, new.kpi_delays
    );
  else
    new.kpi_percentage := null;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_records_calculate_kpi on public.payroll_records;
create trigger payroll_records_calculate_kpi
before insert or update of kpi_complaints, kpi_cleanliness, kpi_delays
on public.payroll_records
for each row execute function public.set_payroll_kpi_percentage();

-- Keep employee compensation values in the protected table. Existing monthly
-- salary values are copied without changing the source records.
insert into public.employee_compensation (employee_id, monthly_base_salary, monthly_kpi_bonus_max)
select e.id, e.base_salary, 0
from public.employees e
on conflict (employee_id) do nothing;

-- Loan terms are limited to the agreed maximum of twelve installments.
alter table public.employee_loans
  add constraint employee_loans_installments_max_12
  check (installments_total is null or installments_total between 1 and 12);

-- Fuel records preserve historical liters while allowing new gallon-based
-- capture. Kilometer difference is calculated only when both odometer values
-- exist and never permits a negative distance.
alter table public.fuel_entries
  add column if not exists gallons numeric(12,3),
  add column if not exists price_per_gallon numeric(12,3),
  add column if not exists previous_odometer integer;

-- Convert historical fuel records without changing their original cost.
update public.fuel_entries
set gallons = round((liters / 3.785411784)::numeric, 3),
    price_per_gallon = round((price_per_liter * 3.785411784)::numeric, 3)
where gallons is null or price_per_gallon is null;

alter table public.fuel_entries
  alter column gallons set not null,
  alter column price_per_gallon set not null;

-- Keep older clients compatible during the frontend transition. If a client
-- still submits liters and price_per_liter only, derive the gallon fields
-- before NOT NULL constraints are checked.
create or replace function public.sync_fuel_measurement_units()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if tg_op = 'INSERT' then
    if new.gallons is null then
      new.gallons := round((new.liters / 3.785411784)::numeric, 3);
    end if;
    if new.price_per_gallon is null then
      new.price_per_gallon := round((new.price_per_liter * 3.785411784)::numeric, 3);
    end if;
  else
    if new.liters is distinct from old.liters
       and new.gallons is not distinct from old.gallons then
      new.gallons := round((new.liters / 3.785411784)::numeric, 3);
    end if;
    if new.price_per_liter is distinct from old.price_per_liter
       and new.price_per_gallon is not distinct from old.price_per_gallon then
      new.price_per_gallon := round((new.price_per_liter * 3.785411784)::numeric, 3);
    end if;
  end if;
  return new;
end;
$;

revoke all on function public.sync_fuel_measurement_units() from public, anon, authenticated;
drop trigger if exists fuel_entries_sync_measurement_units on public.fuel_entries;
create trigger fuel_entries_sync_measurement_units
before insert or update of liters, price_per_liter, gallons, price_per_gallon
on public.fuel_entries
for each row execute function public.sync_fuel_measurement_units();

alter table public.fuel_entries
  add column if not exists kilometers_driven integer
    generated always as (
      case
        when odometer is not null and previous_odometer is not null
          then odometer - previous_odometer
        else null
      end
    ) stored;

alter table public.fuel_entries
  add constraint fuel_entries_gallons_positive check (gallons > 0),
  add constraint fuel_entries_price_per_gallon_nonnegative check (price_per_gallon >= 0),
  add constraint fuel_entries_odometer_order check (
    odometer is null or previous_odometer is null or odometer >= previous_odometer
  );

-- School payment RPC: atomic payment + income ledger insertion.
-- User can register payment only if explicitly enabled by superadmin.
create or replace function public.register_school_student_payment(
  p_student_id uuid,
  p_amount numeric,
  p_enrollment_status text,
  p_reference text default '',
  p_request_key uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_user_id uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Autenticación requerida';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  if p_enrollment_status not in ('Vigente', 'No vigente') then
    raise exception 'Estado de vigencia inválido';
  end if;

  select public.is_superadmin() into v_allowed;
  if not v_allowed then
    select exists (
      select 1
      from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      join public.school_user_permissions sup on sup.user_id = p.id
      where p.id = v_user_id
        and p.status = 'active'
        and ump.module_code = 'escolares'
        and ump.can_access = true
        and sup.can_register_payments = true
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'No tienes permiso para registrar pagos escolares';
  end if;

  -- Atomic idempotency: concurrent retries cannot create two payments.
  insert into public.school_student_payments (
    student_id, amount, currency, payment_status,
    enrollment_status, reference, created_by, request_key
  ) values (
    p_student_id, round(p_amount, 2), 'GTQ', 'Realizado',
    p_enrollment_status, coalesce(p_reference, ''), v_user_id, p_request_key
  )
  on conflict (request_key) where request_key is not null do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select id into v_payment_id
    from public.school_student_payments
    where request_key = p_request_key;
    return v_payment_id;
  end if;

  insert into public.financial_movements (
    direction, movement_date, category, concept, amount, currency,
    status, source_table, source_id, student_id, created_by, idempotency_key
  ) values (
    'ingreso', now(), 'Transporte escolar', 'Pago de transporte escolar',
    round(p_amount, 2), 'GTQ', 'registrado',
    'school_student_payments', v_payment_id, p_student_id, v_user_id,
    p_request_key
  );

  return v_payment_id;
end;
$$;

revoke all on function public.register_school_student_payment(uuid,numeric,text,text,uuid) from public, anon;
grant execute on function public.register_school_student_payment(uuid,numeric,text,text,uuid) to authenticated;


-- Frontend can read only the signed-in user's school capabilities.
create or replace function public.get_my_school_permissions()
returns table (
  can_edit_students boolean,
  can_edit_followups boolean,
  can_register_payments boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin() or coalesce(sup.can_edit_students, false),
    public.is_superadmin() or coalesce(sup.can_edit_followups, false),
    public.is_superadmin() or coalesce(sup.can_register_payments, false)
  from (select auth.uid() as user_id) u
  left join public.school_user_permissions sup on sup.user_id = u.user_id
  where u.user_id is not null;
$$;

revoke all on function public.get_my_school_permissions() from public, anon;
grant execute on function public.get_my_school_permissions() to authenticated;


-- Safe trip picker for Abordajes: exposes operational fields only, never trip income.
create or replace function public.get_abordajes_trips()
returns table (
  trip_id uuid,
  trip_date date,
  origin text,
  destination text,
  responsible text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select public.is_superadmin() or exists (
    select 1 from public.profiles p
    join public.user_module_permissions ump on ump.user_id = p.id
    where p.id = auth.uid() and p.status = 'active'
      and ump.module_code = 'abordajes' and ump.can_access = true
  ) into v_allowed;

  if not v_allowed then
    raise exception 'No tienes permiso para consultar los viajes de Abordajes';
  end if;

  return query
  select t.id, t.date, t.origin, t.destination, t.responsible, t.status
  from public.trips t
  order by t.date desc;
end;
$$;

revoke all on function public.get_abordajes_trips() from public, anon;
grant execute on function public.get_abordajes_trips() to authenticated;

commit;
