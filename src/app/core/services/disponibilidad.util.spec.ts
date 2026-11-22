import { describe, it, expect } from 'vitest';
import { calcularHorariosDisponibles } from './disponibilidad.util';
import { DisponibilidadSemana } from '../models/disponibilidad.model';
import { Servicio } from '../models/servicio.model';
import { Reserva } from '../models/reserva.model';

const servicio: Servicio = {
  id: 'svc-1',
  icono: '💅',
  nombre: 'Manicure clásico',
  duracion: '1 h',
  duracionMin: 60,
  precio: 25,
  adelanto: 10,
  activo: true,
};

const disponibilidad: DisponibilidadSemana = [
  { diaSemana: 0, activo: false, rangos: [], pausas: [] },
  { diaSemana: 1, activo: true, rangos: [{ desde: '09:00', hasta: '12:00' }], pausas: [] },
  { diaSemana: 2, activo: false, rangos: [], pausas: [] },
  { diaSemana: 3, activo: false, rangos: [], pausas: [] },
  { diaSemana: 4, activo: false, rangos: [], pausas: [] },
  { diaSemana: 5, activo: false, rangos: [], pausas: [] },
  { diaSemana: 6, activo: false, rangos: [], pausas: [] },
];

// 2026-07-13 es lunes (diaSemana 1)
const FECHA_LUNES = '2026-07-13';
const AHORA_FUERA_DE_HORARIO = new Date(2026, 5, 1, 6, 0);

function reserva(parcial: Partial<Reserva>): Reserva {
  return {
    id: 'r-1',
    profesionalId: 'p-1',
    servicioId: 'svc-1',
    servicioNombre: 'Manicure',
    precio: 25,
    duracionMin: 60,
    adelanto: 10,
    clienteNombre: 'Cliente',
    fecha: FECHA_LUNES,
    horaInicio: '09:00',
    horaFin: '10:00',
    estado: 'confirmada',
    creadoEn: 0,
    actualizadoEn: 0,
    ...parcial,
  };
}

describe('calcularHorariosDisponibles', () => {
  it('devuelve vacío si el día no está activo', () => {
    const resultado = calcularHorariosDisponibles(
      '2026-07-14',
      servicio,
      disponibilidad,
      [],
      15,
      AHORA_FUERA_DE_HORARIO,
    );
    expect(resultado).toEqual([]);
  });

  it('genera horarios cada 15 min dentro del rango activo cuando no hay reservas', () => {
    const resultado = calcularHorariosDisponibles(
      FECHA_LUNES,
      servicio,
      disponibilidad,
      [],
      15,
      AHORA_FUERA_DE_HORARIO,
    );
    // rango 09:00-12:00, servicio 60 min -> último inicio posible 11:00
    expect(resultado[0]).toBe('09:00');
    expect(resultado.at(-1)).toBe('11:00');
    expect(resultado).not.toContain('11:15');
  });

  it('excluye horarios que se solapan con una reserva activa (incluyendo preparación)', () => {
    const resultado = calcularHorariosDisponibles(
      FECHA_LUNES,
      servicio,
      disponibilidad,
      [reserva({ horaInicio: '09:00', horaFin: '10:00', estado: 'confirmada' })],
      15,
      AHORA_FUERA_DE_HORARIO,
    );
    expect(resultado).not.toContain('09:00');
    expect(resultado).not.toContain('09:30');
    // 10:00 + 15 min de preparación bloquea también 10:00
    expect(resultado).not.toContain('10:00');
    expect(resultado).toContain('10:15');
  });

  it('ignora reservas expiradas o rechazadas al calcular ocupación', () => {
    const resultado = calcularHorariosDisponibles(
      FECHA_LUNES,
      servicio,
      disponibilidad,
      [reserva({ horaInicio: '09:00', horaFin: '10:00', estado: 'expirada' })],
      15,
      AHORA_FUERA_DE_HORARIO,
    );
    expect(resultado).toContain('09:00');
  });

  it('respeta la anticipación mínima cuando la fecha es hoy', () => {
    const ahora = new Date(2026, 6, 13, 9, 30);
    const resultado = calcularHorariosDisponibles(FECHA_LUNES, servicio, disponibilidad, [], 15, ahora);
    // ahora 09:30 + 30 min anticipación = 10:00, todo antes queda excluido
    expect(resultado).not.toContain('09:30');
    expect(resultado).not.toContain('09:45');
    expect(resultado).toContain('10:00');
  });
});
