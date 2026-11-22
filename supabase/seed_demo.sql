-- =====================================================================
-- Datos de prueba: crea la profesional "andrea" con servicios y horario.
-- Antes de correrlo:
--   1. Supabase → Authentication → Users → Add user → Create new user
--      (tu correo y una contraseña; marca "Auto Confirm User").
--   2. Cambia TU_CORREO@ejemplo.com por ese correo (línea de abajo).
-- Luego pega todo en SQL Editor y dale Run.
-- =====================================================================
do $$
declare
  v_correo text := 'TU_CORREO@ejemplo.com';
  v_user   uuid;
  v_prof   uuid;
  v_disp   uuid;
  d        int;
begin
  select id into v_user from auth.users where email = v_correo;
  if v_user is null then
    raise exception 'No existe el usuario %. Créalo primero en Authentication → Users', v_correo;
  end if;

  insert into profesionales (usuario_id, slug, nombre, tiempo_preparacion_min, yape_numero, yape_titular)
  values (v_user, 'andrea', 'Andrea M.', 15, '987 654 321', 'Andrea M.')
  returning id into v_prof;

  insert into servicios (profesional_id, icono, nombre, duracion_min, precio, adelanto, activo) values
    (v_prof, '💅', 'Manicure clásico', 60,  25, 10, true),
    (v_prof, '✨', 'Manicure en gel',  90,  40, 10, true),
    (v_prof, '🌸', 'Uñas acrílicas',   120, 65, 10, true),
    (v_prof, '🫧', 'Retiro de gel',    30,  15, 10, false);

  -- Lunes, miércoles, jueves y sábado de 09:00 a 18:00
  for d in 0..6 loop
    insert into disponibilidad (profesional_id, dia_semana, activo)
    values (v_prof, d, d in (1, 3, 4, 6))
    returning id into v_disp;

    if d in (1, 3, 4, 6) then
      insert into rangos_horario (disponibilidad_id, tipo, desde, hasta)
      values (v_disp, 'rango', '09:00', '18:00');
    end if;
  end loop;
end $$;
