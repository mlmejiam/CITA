import { Reserva } from '../models/reserva.model';
import { Profesional } from '../models/profesional.model';

function icsFecha(fecha: string, hora: string): string {
  return `${fecha.replace(/-/g, '')}T${hora.replace(':', '')}00`;
}

export function generarIcs(reserva: Reserva, profesional: Profesional): string {
  const inicio = icsFecha(reserva.fecha, reserva.horaInicio);
  const fin = icsFecha(reserva.fecha, reserva.horaFin);
  const ahora = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cita Linda//Reservas//ES',
    'BEGIN:VEVENT',
    `UID:${reserva.id}@citalinda`,
    `DTSTAMP:${ahora}`,
    `DTSTART:${inicio}`,
    `DTEND:${fin}`,
    `SUMMARY:${reserva.servicioNombre} con ${profesional.nombre}`,
    `DESCRIPTION:Cita reservada en Cita Linda. Adelanto pagado S/ ${reserva.adelanto}.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function descargarIcs(reserva: Reserva, profesional: Profesional): void {
  const contenido = generarIcs(reserva, profesional);
  const blob = new Blob([contenido], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cita-${reserva.fecha}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
