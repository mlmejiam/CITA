# Backend de Cita Linda en Supabase

## 1. Crear el proyecto
1. Entra a https://supabase.com y crea una cuenta (puedes usar tu GitHub).
2. **New project** → nombre `cita-linda`, región **South America (São Paulo)**, guarda bien la contraseña de la base.

## 2. Crear las tablas
1. En el proyecto: **SQL Editor → New query**.
2. Copia todo `migrations/20261122000000_esquema_inicial.sql`, pégalo y pulsa **Run**.
3. En **Table Editor** deberías ver: `planes`, `profesionales`, `suscripciones`, `servicios`,
   `disponibilidad`, `rangos_horario`, `reservas`, `comprobantes`.

## 2b. Scripts posteriores (en orden, cada uno una sola vez)
1. `migrations/20261122010000_horarios_ocupados_rango.sql`
2. `migrations/20261123000000_panel_profesional.sql`
3. `seed_demo.sql` (después de crear tu usuario en Authentication → Users)

## 3. Datos que necesitará Angular
En **Project Settings → API** copia:
- **Project URL** (`https://xxxx.supabase.co`)
- **anon public key**

La anon key puede ir en el frontend: la seguridad la dan las políticas RLS del script.
**Nunca** pongas la `service_role` key en el frontend ni en GitHub.

## Qué hace el script
| Pieza | Para qué |
|---|---|
| `reservas_sin_cruce` | La base rechaza dos reservas activas que se crucen (incluye el tiempo de preparación). |
| `bloquear_slot()` | La clienta aparta un horario por 10 min mientras paga el adelanto. |
| `registrar_comprobante()` | Guarda la captura de Yape y pasa la reserva a `pendiente_pago`. |
| `horarios_ocupados()` | Devuelve horas ocupadas sin exponer datos de otras clientas. |
| `reconciliar_estados()` | Marca bloqueos vencidos como `expirada` y citas pasadas como `completada`. |
| Bucket `comprobantes` | Archivos privados: la clienta sube, solo la profesional los ve. |

Errores que devuelven las funciones: `SERVICIO_NO_DISPONIBLE`, `HORARIO_MUY_PRONTO`,
`FUERA_DE_HORARIO`, `HORARIO_OCUPADO`, `RESERVA_NO_VALIDA`.

## Migrar después a tu propio PostgreSQL
El script es SQL estándar salvo `auth.users`, `auth.uid()` y `storage.*`, que son de Supabase.
Cuando hagamos nuestro backend, esas tres piezas se reemplazan por una tabla `usuarios`,
el login de la API y un almacenamiento de archivos.
