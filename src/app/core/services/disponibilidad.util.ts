import { DisponibilidadSemana } from '../models/disponibilidad.model';
import { Servicio } from '../models/servicio.model';
import { Reserva, ESTADOS_ACTIVOS } from '../models/reserva.model';
import { horaAMinutos, minutosAHora } from '../utils/duracion.util';

export const SLOT_STEP_MIN = 15;
export const MIN_ANTICIPACION_MIN = 30;

interface IntervaloOcupado {
  inicio: number;
  fin: number;
}

export function fechaADiaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function calcularHorariosDisponibles(
  fecha: string,
  servicio: Servicio,
  disponibilidad: DisponibilidadSemana,
  reservasDelDia: Reserva[],
  tiempoPreparacionDefaultMin: number,
  ahora: Date = new Date(),
): string[] {
  const diaSemana = fechaADiaSemana(fecha);
  const dia = disponibilidad.find((d) => d.diaSemana === diaSemana);
  if (!dia || !dia.activo) return [];

  const duracionServicio = servicio.duracionMin;
  const prepServicio = servicio.tiempoPreparacionMin ?? tiempoPreparacionDefaultMin;

  const ahoraMs = ahora.getTime();
  const ocupados: IntervaloOcupado[] = reservasDelDia
    .filter((r) => ESTADOS_ACTIVOS.includes(r.estado))
    .filter((r) => !(r.estado === 'slot_bloqueado' && (r.slotExpiraEn ?? 0) <= ahoraMs))
    .map((r) => ({
      inicio: horaAMinutos(r.horaInicio),
      fin: horaAMinutos(r.horaFin) + tiempoPreparacionDefaultMin,
    }));

  const pausas: IntervaloOcupado[] = dia.pausas.map((p) => ({
    inicio: horaAMinutos(p.desde),
    fin: horaAMinutos(p.hasta),
  }));

  const bloqueados = [...ocupados, ...pausas];

  const esHoy = esMismaFecha(fecha, ahora);
  const minutoActual = ahora.getHours() * 60 + ahora.getMinutes();
  const limiteAnticipacion = minutoActual + MIN_ANTICIPACION_MIN;

  const disponibles: string[] = [];

  for (const rango of dia.rangos) {
    const inicioRango = horaAMinutos(rango.desde);
    const finRango = horaAMinutos(rango.hasta);

    for (let candidato = inicioRango; candidato + duracionServicio <= finRango; candidato += SLOT_STEP_MIN) {
      const finCandidato = candidato + duracionServicio + prepServicio;

      if (esHoy && candidato < limiteAnticipacion) continue;

      const seSolapa = bloqueados.some((b) => candidato < b.fin && finCandidato > b.inicio);
      if (seSolapa) continue;

      disponibles.push(minutosAHora(candidato));
    }
  }

  return disponibles;
}

function esMismaFecha(fecha: string, ahora: Date): boolean {
  const [y, m, d] = fecha.split('-').map(Number);
  return y === ahora.getFullYear() && m === ahora.getMonth() + 1 && d === ahora.getDate();
}
