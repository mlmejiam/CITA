-- Horarios ocupados de varios días en una sola llamada (la página pública muestra 14 días).
-- No devuelve datos de las clientas, solo fecha y horas.
create or replace function horarios_ocupados_rango(p_profesional_id uuid, p_desde date, p_hasta date)
returns table (fecha date, hora_inicio time, hora_fin time)
language sql stable security definer set search_path = public as $$
  select r.fecha, r.hora_inicio, r.hora_fin
    from reservas r
   where r.profesional_id = p_profesional_id
     and r.fecha between p_desde and p_hasta
     and (r.estado in ('pendiente_pago', 'confirmada')
          or (r.estado = 'slot_bloqueado' and r.slot_expira_en > now()))
   order by r.fecha, r.hora_inicio;
$$;

grant execute on function horarios_ocupados_rango(uuid, date, date) to anon, authenticated;
