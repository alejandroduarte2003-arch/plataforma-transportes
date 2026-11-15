-- INCOROVA Transportes — foundation for the restructuring.
-- IMPORTANT: branch artifact only. Do not apply to the active Supabase project
-- until the frontend/RPC migration and backup plan have been reviewed.
-- Existing operational/financial columns are intentionally preserved.

begin;

-- New navigation modules.
insert into public.modules (code, name, description)
values
  ('abordajes', 'Abordajes', 'Pasajeros por contrato y registros de abordaje por viaje.'),
  ('escolares', 'Transporte escolares', 'Expedientes, seguimientos y pagos de estudiantes.')
on conflict (code) do update
set name = excluded.name, description = excluded.description;

-- Planilla: keep old monthly rows as fortnight = 0 (historical monthly record).
-- New records use 1 or 2. No historical payroll row is duplicated.
alter table public.payroll_records
  add column if not exists fortnight smallint;

update public.payroll_records
set fortnight = 0
where fortnight is null;

alter table public.payroll_records
  alter column fortnight set default 1,
  alter column fortnight set not null;

alter table public.payroll_records
  add constraint payroll_records_fortnight_check
  check (fortnight in (0, 1, 2));

alter table public.payroll_records
  drop constraint if exists payroll_records_employee_period_unique;

drop index if exists public.payroll_records_employee_period_unique;

create unique index if not exists payroll_records_employee_period_fortnight_uidx
  on public.payroll_records (employee_id, period, fortnight);

alter table public.payroll_records
  add column if not exists kpi_complaints smallint,
  add column if not exists kpi_cleanliness smallint,
  add column if not exists kpi_delays smallint,
  add column if not exists kpi_percentage numeric(5,2);

alter table public.payroll_records
  add constraint payroll_records_kpi_complaints_check
    check (kpi_complaints is null or kpi_complaints between 1 and 5),
  add constraint payroll_records_kpi_cleanliness_check
    check (kpi_cleanliness is null or kpi_cleanliness between 1 and 5),
  add constraint payroll_records_kpi_delays_check
    check (kpi_delays is null or kpi_delays between 1 and 5),
  add constraint payroll_records_kpi_percentage_check
    check (kpi_percentage is null or kpi_percentage between 0 and 100);

-- Protected compensation settings: monthly salary and individual monthly KPI cap.
create table if not exists public.employee_compensation (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  monthly_base_salary numeric(12,2) not null default 0 check (monthly_base_salary >= 0),
  monthly_kpi_bonus_max numeric(12,2) not null default 0 check (monthly_kpi_bonus_max >= 0),
  currency text not null default 'GTQ' check (currency = 'GTQ'),
  effective_from date not null default current_date,
  updated_at timestamptz not null default now()
);

-- Immutable-ish financial ledger foundation. Source references are deliberately
-- generic so each originating module can be connected transactionally in a later phase.
create table if not exists public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('ingreso', 'egreso')),
  movement_date timestamptz not null default now(),
  category text not null,
  concept text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GTQ' check (currency = 'GTQ'),
  status text not null default 'registrado'
    check (status in ('pendiente', 'registrado', 'anulado')),
  source_table text,
  source_id uuid,
  employee_id uuid references public.employees(id) on delete restrict,
  student_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_movements_date_idx
  on public.financial_movements (movement_date desc);
create index if not exists financial_movements_category_idx
  on public.financial_movements (category, movement_date desc);

-- Transport contracts and passenger roster.
create table if not exists public.transport_contracts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text not null default '',
  start_date date,
  end_date date,
  status text not null default 'Activo'
    check (status in ('Activo', 'Inactivo', 'Finalizado')),
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_passengers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  contact text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_passengers (
  contract_id uuid not null references public.transport_contracts(id) on delete cascade,
  passenger_id uuid not null references public.transport_passengers(id) on delete cascade,
  pickup_point text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (contract_id, passenger_id)
);

create table if not exists public.trip_passenger_boardings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  passenger_id uuid not null references public.transport_passengers(id) on delete restrict,
  boarded_at timestamptz not null default now(),
  boarding_point text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (trip_id, passenger_id)
);

create index if not exists trip_passenger_boardings_trip_idx
  on public.trip_passenger_boardings (trip_id);
create index if not exists contract_passengers_passenger_idx
  on public.contract_passengers (passenger_id);

-- School transport student records and follow-up history.
create table if not exists public.school_students (
  id uuid primary key default gen_random_uuid(),
  student_code bigint generated always as identity unique,
  full_name text not null,
  address_am text not null default '',
  address_pm text not null default '',
  guardian_phone text not null default '',
  guardian_relationship text not null default '',
  school_name text not null default '',
  status text not null default 'Activo'
    check (status in ('Activo', 'Inactivo')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_student_followups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.school_students(id) on delete cascade,
  followup_date timestamptz not null default now(),
  subject text not null,
  detail text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists school_student_followups_student_idx
  on public.school_student_followups (student_id, followup_date desc);

-- Student payments are financial records. The school module will later write
-- through a validated transaction/RPC; direct table access stays Finance-only.
create table if not exists public.school_student_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.school_students(id) on delete restrict,
  paid_at timestamptz not null default now(),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GTQ' check (currency = 'GTQ'),
  payment_status text not null default 'Realizado'
    check (payment_status in ('Realizado', 'Anulado')),
  enrollment_status text not null default 'Vigente'
    check (enrollment_status in ('Vigente', 'No vigente')),
  reference text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists school_student_payments_student_idx
  on public.school_student_payments (student_id, paid_at desc);

-- New tables are private by default at the row level. No broad authenticated policies.
alter table public.employee_compensation enable row level security;
alter table public.financial_movements enable row level security;
alter table public.transport_contracts enable row level security;
alter table public.transport_passengers enable row level security;
alter table public.contract_passengers enable row level security;
alter table public.trip_passenger_boardings enable row level security;
alter table public.school_students enable row level security;
alter table public.school_student_followups enable row level security;
alter table public.school_student_payments enable row level security;

-- Compensation and ledger amounts: Finance permission or superadmin only.
create policy employee_compensation_finance_select
  on public.employee_compensation for select to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  );

create policy employee_compensation_finance_write
  on public.employee_compensation for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  );

create policy financial_movements_finance_access
  on public.financial_movements for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  );

-- Operational passenger/contract data: Abordajes module.
create policy transport_contracts_module_access
  on public.transport_contracts for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  );

create policy transport_passengers_module_access
  on public.transport_passengers for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  );

create policy contract_passengers_module_access
  on public.contract_passengers for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  );

create policy trip_passenger_boardings_module_access
  on public.trip_passenger_boardings for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'abordajes' and ump.can_access = true
    )
  );

-- School student data: Transporte escolares module.
create policy school_students_module_access
  on public.school_students for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'escolares' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'escolares' and ump.can_access = true
    )
  );

create policy school_student_followups_module_access
  on public.school_student_followups for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'escolares' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'escolares' and ump.can_access = true
    )
  );

create policy school_student_payments_finance_access
  on public.school_student_payments for all to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.profiles p
      join public.user_module_permissions ump on ump.user_id = p.id
      where p.id = (select auth.uid()) and p.status = 'active'
        and ump.module_code = 'finanzas' and ump.can_access = true
    )
  );

-- Trip editing is superadmin-only even if an operational user has read/write
-- access to trips. A restrictive policy ANDs with the existing permissive policy.
create policy trips_update_superadmin_only
  on public.trips as restrictive for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

commit;
