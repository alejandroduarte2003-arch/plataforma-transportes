-- One-time cleanup of test records before the transport platform handoff.
-- Keeps profiles, Auth users, permissions, module definitions and dashboard preferences.

create table if not exists public.platform_reset_state (
    id boolean primary key default true check (id = true),
    reset_completed boolean not null default false,
    completed_at timestamptz,
    completed_by uuid references public.profiles(id)
);

insert into public.platform_reset_state (id, reset_completed)
values (true, false)
on conflict (id) do nothing;

alter table public.platform_reset_state enable row level security;
revoke all on public.platform_reset_state from anon, authenticated;

create or replace function public.get_platform_reset_status()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_completed boolean;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión activa.';
    end if;

    select reset_completed
      into v_completed
      from public.platform_reset_state
     where id = true;

    return coalesce(v_completed, false);
end;
$$;

create or replace function public.reset_platform_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_completed boolean;
begin
    if auth.uid() is null or not public.is_superadmin() then
        raise exception 'Solo el superadministrador puede limpiar la información de prueba.';
    end if;

    select reset_completed
      into v_completed
      from public.platform_reset_state
     where id = true
     for update;

    if coalesce(v_completed, false) then
        raise exception 'La limpieza inicial ya fue ejecutada.';
    end if;

    truncate table
        public.activity_logs,
        public.boardings,
        public.contract_passengers,
        public.employee_compensation,
        public.employee_loans,
        public.employees,
        public.financial_collections,
        public.financial_expenses,
        public.financial_movements,
        public.financial_receivables,
        public.fuel_entries,
        public.maintenance_records,
        public.payroll_records,
        public.school_student_followups,
        public.school_student_payments,
        public.school_students,
        public.transport_contracts,
        public.transport_passengers,
        public.trip_passenger_boardings,
        public.trips,
        public.vehicle_parts,
        public.vehicles
    restart identity cascade;

    update public.platform_reset_state
       set reset_completed = true,
           completed_at = now(),
           completed_by = auth.uid()
     where id = true;

    return jsonb_build_object(
        'success', true,
        'completed_at', now()
    );
end;
$$;

revoke all on function public.get_platform_reset_status() from public, anon;
revoke all on function public.reset_platform_test_data() from public, anon;
grant execute on function public.get_platform_reset_status() to authenticated;
grant execute on function public.reset_platform_test_data() to authenticated;
