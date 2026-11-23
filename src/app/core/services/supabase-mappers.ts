// Convierte las filas de la base (snake_case, horas 'HH:MM:SS')
// a los modelos que ya usa la app (camelCase, horas 'HH:MM').
import { Profesional } from '../models/profesional.model';
import { Servicio } from '../models/servicio.model';
import { DisponibilidadSemana } from '../models/disponibilidad.model';
import { EstadoReserva, Reserva } from '../models/reserva.model';
import { Comprobante } from '../models/comprobante.model';
import { formatMinutos } from '../utils/duracion.util';

export interface ServicioRow {
  id: string;
  icono: string;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: number;
  adelanto: number;
  tiempo_preparacion_min: number | null;
  activo: boolean;
}

export interface RangoRow {
  tipo: 'rango' | 'pausa';
  desde: string;
  hasta: string;
}

export interface DisponibilidadRow {
  dia_semana: number;
  activo: boolean;
  rangos_horario: RangoRow[];
}

export interface ProfesionalRow {
  id: string;
  slug: string;
  nombre: string;
  foto_url: string | null;
  tiempo_preparacion_min: number;
  yape_numero: string | null;
  yape_titular: string | null;
  yape_qr_url: string | null;
  servicios: ServicioRow[];
  disponibilidad: DisponibilidadRow[];
}

export interface ComprobanteRow {
  id: string;
  archivo_path: string;
  nombre_archivo: string | null;
  tipo: string | null;
  monto: number;
  subido_en: string;
}

export interface ReservaRow {
  id: string;
  profesional_id: string;
  servicio_id: string | null;
  servicio_nombre: string;
  precio: number;
  duracion_min: number;
  adelanto: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoReserva;
  slot_expira_en: string | null;
  motivo: string | null;
  creado_en: string;
  actualizado_en: string;
  /** Solo viene si se pide con select=*,comprobantes(*). Puede llegar como objeto o lista. */
  comprobantes?: ComprobanteRow | ComprobanteRow[] | null;
}

export interface OcupadoRow {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
}

/** '09:00:00' → '09:00' */
export const hhmm = (hora: string): string => hora.slice(0, 5);

export function aServicio(row: ServicioRow): Servicio {
  return {
    id: row.id,
    icono: row.icono,
    nombre: row.nombre,
    descripcion: row.descripcion ?? undefined,
    duracion: formatMinutos(row.duracion_min),
    duracionMin: row.duracion_min,
    precio: Number(row.precio),
    adelanto: Number(row.adelanto),
    tiempoPreparacionMin: row.tiempo_preparacion_min ?? undefined,
    activo: row.activo,
  };
}

/** Siempre devuelve los 7 días (0 = domingo … 6 = sábado), aunque falten en la base. */
export function aDisponibilidad(rows: DisponibilidadRow[]): DisponibilidadSemana {
  return [0, 1, 2, 3, 4, 5, 6].map((dia) => {
    const row = rows.find((r) => r.dia_semana === dia);
    const ordenados = [...(row?.rangos_horario ?? [])].sort((a, b) => a.desde.localeCompare(b.desde));
    const tramo = (r: RangoRow) => ({ desde: hhmm(r.desde), hasta: hhmm(r.hasta) });
    return {
      diaSemana: dia,
      activo: row?.activo ?? false,
      rangos: ordenados.filter((r) => r.tipo === 'rango').map(tramo),
      pausas: ordenados.filter((r) => r.tipo === 'pausa').map(tramo),
    };
  });
}

export function aProfesional(row: ProfesionalRow): Profesional {
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.nombre,
    fotoUrl: row.foto_url ?? undefined,
    servicios: row.servicios.map(aServicio),
    disponibilidad: aDisponibilidad(row.disponibilidad),
    tiempoPreparacionDefaultMin: row.tiempo_preparacion_min,
    yape: {
      numero: row.yape_numero ?? '',
      titular: row.yape_titular ?? row.nombre,
      qrUrl: row.yape_qr_url ?? undefined,
    },
  };
}

function aComprobante(row: ReservaRow['comprobantes']): Comprobante | undefined {
  const c = Array.isArray(row) ? row[0] : row;
  if (!c) return undefined;
  return {
    id: c.id,
    archivoPath: c.archivo_path,
    nombreArchivo: c.nombre_archivo ?? 'comprobante',
    tipo: c.tipo ?? '',
    monto: Number(c.monto),
    subidoEn: Date.parse(c.subido_en),
  };
}

export function aReserva(row: ReservaRow): Reserva {
  return {
    id: row.id,
    profesionalId: row.profesional_id,
    servicioId: row.servicio_id ?? '',
    servicioNombre: row.servicio_nombre,
    precio: Number(row.precio),
    duracionMin: row.duracion_min,
    adelanto: Number(row.adelanto),
    clienteNombre: row.cliente_nombre,
    clienteTelefono: row.cliente_telefono ?? undefined,
    fecha: row.fecha,
    horaInicio: hhmm(row.hora_inicio),
    horaFin: hhmm(row.hora_fin),
    estado: row.estado,
    slotExpiraEn: row.slot_expira_en ? Date.parse(row.slot_expira_en) : undefined,
    motivo: row.motivo ?? undefined,
    comprobante: aComprobante(row.comprobantes),
    creadoEn: Date.parse(row.creado_en),
    actualizadoEn: Date.parse(row.actualizado_en),
  };
}
