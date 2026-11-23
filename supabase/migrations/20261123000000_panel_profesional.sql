-- =====================================================================
-- Funciones para el panel de la profesional (requieren sesión iniciada)
-- =====================================================================

-- Guarda toda la semana de una vez: cada día con sus rangos y pausas.
-- Recibe la misma forma que usa Angular:
--   [{"diaSemana":1,"activo":true,"rangos":[{"desde":"09:00","hasta":"18:00"}],"pausas":[]}, ...]
-- Todo ocurre en una transacción: si un horario es inválido no se guarda nada.
create or replace function guardar_disponibilidad(p_dias jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prof uuid;
  v_dia  jsonb;
  v_disp uuid;
  v_tramo jsonb;
begin
  select id into v_prof from profesionales where usuario_id = auth.uid();
  if v_prof is null then raise exception 'SIN_PERFIL'; end if;

  for v_dia in select * from jsonb_array_elements(p_dias) loop
    insert into disponibilidad (profesional_id, dia_semana, activo)
    values (v_prof, (v_dia->>'diaSemana')::smallint, (v_dia->>'activo')::boolean)
    on conflict (profesional_id, dia_semana) do update set activo = excluded.activo
    returning id into v_disp;

    delete from rangos_horario where disponibilidad_id = v_disp;

    for v_tramo in select * from jsonb_array_elements(coalesce(v_dia->'rangos', '[]')) loop
      insert into rangos_horario (disponibilidad_id, tipo, desde, hasta)
      values (v_disp, 'rango', (v_tramo->>'desde')::time, (v_tramo->>'hasta')::time);
    end loop;

    for v_tramo in select * from jsonb_array_elements(coalesce(v_dia->'pausas', '[]')) loop
      insert into rangos_horario (disponibilidad_id, tipo, desde, hasta)
      values (v_disp, 'pausa', (v_tramo->>'desde')::time, (v_tramo->>'hasta')::time);
    end loop;
  end loop;
end $$;

revoke execute on function guardar_disponibilidad(jsonb) from public, anon;
grant execute on function guardar_disponibilidad(jsonb) to authenticated;

-- La profesional solo puede confirmar/rechazar/cancelar/marcar no-show sus reservas.
-- No puede cambiar precios, horarios ni datos de la clienta desde la API.
revoke update on reservas from anon, authenticated;
grant update (estado, motivo) on reservas to authenticated;
