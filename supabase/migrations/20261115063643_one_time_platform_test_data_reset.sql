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

    -- Eliminar únicamente registros operativos/de prueba.
    -- No se usa TRUNCATE ni CASCADE: no se altera la estructura ni se borran
    -- perfiles, usuarios, permisos, módulos o preferencias del sistema.
    delete from public.activity_logs;
    delete from public.boardings;
    delete from public.trip_passenger_boardings;
    delete from public.contract_passengers;
    delete from public.financial_collections;
    delete from public.financial_movements;
    delete from public.financial_receivables;
    delete from public.financial_expenses;
    delete from public.employee_compensation;
    delete from public.employee_loans;
    delete from public.payroll_records;
    delete from public.fuel_entries;
    delete from public.maintenance_records;
    delete from public.vehicle_parts;
    delete from public.school_student_followups;
    delete from public.school_student_payments;
    delete from public.school_students;
    delete from public.transport_contracts;
    delete from public.transport_passengers;
    delete from public.trips;
    delete from public.employees;
    delete from public.vehicles;

    update public.platform_reset_state
       set reset_completed = true,
           completed_at = now(),
           completed_by = auth.uid()
     where id = true;

    return jsonb_build_object('success', true, 'completed_at', now());
end;
$$;

revoke all on function public.get_platform_reset_status() from public, anon;
revoke all on function public.reset_platform_test_data() from public, anon;
grant execute on function public.get_platform_reset_status() to authenticated;
grant execute on function public.reset_platform_test_data() to authenticated;
