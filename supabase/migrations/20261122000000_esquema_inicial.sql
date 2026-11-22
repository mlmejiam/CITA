-- =====================================================================
-- Cita Linda · Esquema inicial para Supabase (PostgreSQL)
-- Pégalo completo en Supabase → SQL Editor → Run.
-- =====================================================================

create extension if not exists btree_gist;   -- para impedir reservas que se crucen
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type estado_reserva as enum (
  'slot_bloqueado', 'pendiente_pago', 'confirmada', 'rechazada',
  'expirada', 'completada', 'cancelada', 'no_show'
);

create type tipo_rango as enum ('rango', 'pausa');

-- ---------------------------------------------------------------------
-- Trigger genérico para actualizado_en
-- ---------------------------------------------------------------------
create or replace function set_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Planes y suscripciones
-- ---------------------------------------------------------------------
create table planes (
  id              text primary key,                 -- 'basico', 'premium'
  nombre          text not null,
  precio_mensual  numeric(10,2) not null default 0,
  max_servicios   int,                              -- null = sin límite
  max_reservas_mes int,                             -- null = sin límite
  activo          boolean not null default true
);

insert into planes (id, nombre, precio_mensual, max_servicios, max_reservas_mes) values
  ('basico',  'Básico',  0,  5,    50),
  ('premium', 'Premium', 29, null, null);

-- ---------------------------------------------------------------------
-- Profesionales (una fila por usuaria de Supabase Auth)
-- ---------------------------------------------------------------------
create table profesionales (
  id                      uuid primary key default gen_random_uuid(),
  usuario_id              uuid not null unique references auth.users(id) on delete cascade,
  slug                    text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  nombre                  text not null,
  foto_url                text,
  tiempo_preparacion_min  int  not null default 15 check (tiempo_preparacion_min between 0 and 240),
  yape_numero             text,
  yape_titular            text,
  yape_qr_url             text,
  plan_id                 text not null default 'basico' references planes(id),
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);
create trigger trg_profesionales_act before update on profesionales
  for each row execute function set_actualizado_en();

create table suscripciones (
  id               uuid primary key default gen_random_uuid(),
  profesional_id   uuid not null references profesionales(id) on delete cascade,
  plan_id          text not null references planes(id),
  inicio           date not null default current_date,
  fin              date,
  estado           text not null default 'activa' check (estado in ('activa','vencida','cancelada')),
  creado_en        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------
create table servicios (
  id                      uuid primary key default gen_random_uuid(),
  profesional_id          uuid not null references profesionales(id) on delete cascade,
  icono                   text not null default '💅',
  nombre                  text not null,
  descripcion             text,
  duracion_min            int  not null check (duracion_min between 5 and 720),
  precio                  numeric(10,2) not null check (precio >= 0),
  adelanto                numeric(10,2) not null default 0 check (adelanto >= 0),
  tiempo_preparacion_min  int check (tiempo_preparacion_min between 0 and 240), -- null = usa el de la profesional
  activo                  boolean not null default true,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),
  check (adelanto <= precio)
);
create index on servicios (profesional_id);
create trigger trg_servicios_act before update on servicios
  for each row execute function set_actualizado_en();

-- ---------------------------------------------------------------------
-- Disponibilidad semanal: un día (0=domingo … 6=sábado) con rangos y pausas
-- ---------------------------------------------------------------------
create table disponibilidad (
  id              uuid primary key default gen_random_uuid(),
  profesional_id  uuid not null references profesionales(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  activo          boolean not null default false,
  unique (profesional_id, dia_semana)
);

create table rangos_horario (
  id                 uuid primary key default gen_random_uuid(),
  disponibilidad_id  uuid not null references disponibilidad(id) on delete cascade,
  tipo               tipo_rango not null default 'rango',
  desde              time not null,
  hasta              time not null,
  check (hasta > desde)
);
create index on rangos_horario (disponibilidad_id);

-- ---------------------------------------------------------------------
-- Reservas
-- Se copian nombre/precio/duración del servicio para conservar
-- lo que se cobró aunque el servicio cambie después.
-- ---------------------------------------------------------------------
create table reservas (
  id                uuid primary key default gen_random_uuid(),
  profesional_id    uuid not null references profesionales(id) on delete cascade,
  servicio_id       uuid references servicios(id) on delete set null,
  servicio_nombre   text not null,
  precio            numeric(10,2) not null,
  duracion_min      int not null,
  adelanto          numeric(10,2) not null,
  preparacion_min   int not null default 0,
  cliente_nombre    text not null check (length(trim(cliente_nombre)) between 2 and 80),
  cliente_telefono  text,
  fecha             date not null,
  hora_inicio       time not null,
  hora_fin          time not null,
  estado            estado_reserva not null default 'slot_bloqueado',
  slot_expira_en    timestamptz,
  motivo            text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  -- Intervalo que ocupa la cita en la agenda (incluye el tiempo de preparación)
  ocupa tsrange generated always as (
    tsrange(fecha + hora_inicio,
            fecha + hora_fin + preparacion_min * interval '1 minute',
            '[)')
  ) stored,
  check (hora_fin > hora_inicio),
  -- Dos reservas activas de la misma profesional nunca pueden cruzarse
  constraint reservas_sin_cruce exclude using gist (
    profesional_id with =,
    ocupa with &&
  ) where (estado in ('slot_bloqueado', 'pendiente_pago', 'confirmada'))
);
create index on reservas (profesional_id, fecha);
create index on reservas (estado);
create trigger trg_reservas_act before update on reservas
  for each row execute function set_actualizado_en();

-- ---------------------------------------------------------------------
-- Comprobantes de Yape (el archivo va en Storage, aquí solo la ruta)
-- ---------------------------------------------------------------------
create table comprobantes (
  id              uuid primary key default gen_random_uuid(),
  reserva_id      uuid not null unique references reservas(id) on delete cascade,
  archivo_path    text not null,          -- ruta dentro del bucket 'comprobantes'
  nombre_archivo  text,
  tipo            text,
  monto           numeric(10,2) not null,
  subido_en       timestamptz not null default now()
);

-- =====================================================================
-- Seguridad (Row Level Security)
-- =====================================================================
create or replace function es_mi_profesional(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profesionales where id = p_id and usuario_id = auth.uid());
$$;

alter table planes          enable row level security;
alter table profesionales   enable row level security;
alter table suscripciones   enable row level security;
alter table servicios       enable row level security;
alter table disponibilidad  enable row level security;
alter table rangos_horario  enable row level security;
alter table reservas        enable row level security;
alter table comprobantes    enable row level security;

-- Planes: lectura pública
create policy planes_lectura on planes for select using (true);

-- Profesionales: el perfil público se lee por slug; solo la dueña lo edita
create policy prof_lectura on profesionales for select using (true);
create policy prof_crear   on profesionales for insert with check (usuario_id = auth.uid());
create policy prof_editar  on profesionales for update using (usuario_id = auth.uid())
                                                      with check (usuario_id = auth.uid());

-- Suscripciones: solo la dueña las ve (se crean desde el panel de Supabase o un backend)
create policy sus_lectura on suscripciones for select using (es_mi_profesional(profesional_id));

-- Servicios: el público ve los activos; la dueña ve y gestiona todos
create policy svc_lectura on servicios for select using (activo or es_mi_profesional(profesional_id));
create policy svc_gestion on servicios for all using (es_mi_profesional(profesional_id))
                                              with check (es_mi_profesional(profesional_id));

-- Disponibilidad: lectura pública (la página de reservas la necesita)
create policy disp_lectura on disponibilidad for select using (true);
create policy disp_gestion on disponibilidad for all using (es_mi_profesional(profesional_id))
                                                    with check (es_mi_profesional(profesional_id));

create policy rang_lectura on rangos_horario for select using (true);
create policy rang_gestion on rangos_horario for all
  using (exists (select 1 from disponibilidad d where d.id = disponibilidad_id and es_mi_profesional(d.profesional_id)))
  with check (exists (select 1 from disponibilidad d where d.id = disponibilidad_id and es_mi_profesional(d.profesional_id)));

-- Reservas y comprobantes: solo la dueña. El público usa las funciones de abajo.
create policy res_lectura on reservas for select using (es_mi_profesional(profesional_id));
create policy res_editar  on reservas for update using (es_mi_profesional(profesional_id))
                                             with check (es_mi_profesional(profesional_id));

create policy comp_lectura on comprobantes for select
  using (exists (select 1 from reservas r where r.id = reserva_id and es_mi_profesional(r.profesional_id)));

-- =====================================================================
-- Funciones públicas (las llama la página /reservar/:slug)
-- =====================================================================

-- Pasa a 'expirada' los bloqueos vencidos y a 'completada' las citas ya pasadas.
-- Usa la hora de Lima porque fecha/hora se guardan como hora local.
create or replace function reconciliar_estados() returns void
language sql security definer set search_path = public as $$
  update reservas set estado = 'expirada'
   where estado = 'slot_bloqueado' and slot_expira_en <= now();
  update reservas set estado = 'completada'
   where estado = 'confirmada'
     and (fecha + hora_fin) <= (now() at time zone 'America/Lima');
$$;

-- Horarios ocupados de un día (sin datos de clientas), para calcular los libres en el front
create or replace function horarios_ocupados(p_profesional_id uuid, p_fecha date)
returns table (hora_inicio time, hora_fin time)
language sql stable security definer set search_path = public as $$
  select r.hora_inicio, r.hora_fin
    from reservas r
   where r.profesional_id = p_profesional_id
     and r.fecha = p_fecha
     and (r.estado in ('pendiente_pago', 'confirmada')
          or (r.estado = 'slot_bloqueado' and r.slot_expira_en > now()))
   order by r.hora_inicio;
$$;

-- Bloquea un horario 10 minutos mientras la clienta paga el adelanto.
-- Si otra persona ganó el horario, la restricción reservas_sin_cruce lo rechaza.
create or replace function bloquear_slot(
  p_servicio_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_cliente_nombre text,
  p_cliente_telefono text default null
) returns reservas
language plpgsql security definer set search_path = public as $$
declare
  v_svc  servicios;
  v_prof profesionales;
  v_res  reservas;
begin
  perform reconciliar_estados();

  select * into v_svc from servicios where id = p_servicio_id and activo;
  if not found then raise exception 'SERVICIO_NO_DISPONIBLE'; end if;
  select * into v_prof from profesionales where id = v_svc.profesional_id;

  if (p_fecha + p_hora_inicio) < (now() at time zone 'America/Lima') + interval '30 minutes' then
    raise exception 'HORARIO_MUY_PRONTO';
  end if;

  -- El horario debe caer dentro de un rango activo de ese día y fuera de las pausas
  if not exists (
    select 1 from disponibilidad d join rangos_horario rh on rh.disponibilidad_id = d.id
     where d.profesional_id = v_prof.id and d.activo
       and d.dia_semana = extract(dow from p_fecha)
       and rh.tipo = 'rango'
       and p_hora_inicio >= rh.desde
       and p_hora_inicio + v_svc.duracion_min * interval '1 minute' <= rh.hasta
  ) or exists (
    select 1 from disponibilidad d join rangos_horario rh on rh.disponibilidad_id = d.id
     where d.profesional_id = v_prof.id
       and d.dia_semana = extract(dow from p_fecha)
       and rh.tipo = 'pausa'
       and p_hora_inicio < rh.hasta
       and p_hora_inicio + v_svc.duracion_min * interval '1 minute' > rh.desde
  ) then
    raise exception 'FUERA_DE_HORARIO';
  end if;

  begin
    insert into reservas (
      profesional_id, servicio_id, servicio_nombre, precio, duracion_min, adelanto,
      preparacion_min, cliente_nombre, cliente_telefono, fecha, hora_inicio, hora_fin,
      estado, slot_expira_en
    ) values (
      v_prof.id, v_svc.id, v_svc.nombre, v_svc.precio, v_svc.duracion_min, v_svc.adelanto,
      coalesce(v_svc.tiempo_preparacion_min, v_prof.tiempo_preparacion_min),
      trim(p_cliente_nombre), p_cliente_telefono, p_fecha, p_hora_inicio,
      p_hora_inicio + v_svc.duracion_min * interval '1 minute',
      'slot_bloqueado', now() + interval '10 minutes'
    ) returning * into v_res;
  exception when exclusion_violation then
    raise exception 'HORARIO_OCUPADO';
  end;

  return v_res;
end $$;

-- Registra el comprobante ya subido a Storage y pasa la reserva a 'pendiente_pago'
create or replace function registrar_comprobante(
  p_reserva_id uuid,
  p_archivo_path text,
  p_nombre_archivo text,
  p_tipo text
) returns reservas
language plpgsql security definer set search_path = public as $$
declare
  v_res reservas;
begin
  select * into v_res from reservas where id = p_reserva_id for update;
  if not found or v_res.estado <> 'slot_bloqueado' or v_res.slot_expira_en <= now() then
    raise exception 'RESERVA_NO_VALIDA';
  end if;

  insert into comprobantes (reserva_id, archivo_path, nombre_archivo, tipo, monto)
  values (p_reserva_id, p_archivo_path, p_nombre_archivo, p_tipo, v_res.adelanto);

  update reservas set estado = 'pendiente_pago', slot_expira_en = null
   where id = p_reserva_id returning * into v_res;
  return v_res;
end $$;

grant execute on function horarios_ocupados(uuid, date) to anon, authenticated;
grant execute on function bloquear_slot(uuid, date, time, text, text) to anon, authenticated;
grant execute on function registrar_comprobante(uuid, text, text, text) to anon, authenticated;
grant execute on function reconciliar_estados() to authenticated;

-- =====================================================================
-- Storage: bucket privado para las capturas de Yape
-- La clienta puede subir (sin login); solo la profesional dueña puede verlas.
-- Ruta esperada del archivo: <profesional_id>/<reserva_id>/<nombre>
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

create policy comprobantes_subir on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'comprobantes');

create policy comprobantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and es_mi_profesional(((storage.foldername(name))[1])::uuid));

-- =====================================================================
-- (Opcional) Ejecutar reconciliar_estados() cada minuto.
-- Activa primero la extensión pg_cron en Database → Extensions y luego corre:
--   select cron.schedule('reconciliar-reservas', '* * * * *', 'select reconciliar_estados()');
-- =====================================================================
