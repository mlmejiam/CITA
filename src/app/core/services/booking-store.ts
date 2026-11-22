import { Injectable, computed, effect, signal } from '@angular/core';
import { Profesional } from '../models/profesional.model';
import { Reserva, EstadoReserva } from '../models/reserva.model';
import { Comprobante } from '../models/comprobante.model';
import { calcularHorariosDisponibles as calcularHorarios } from './disponibilidad.util';
import { horaAMinutos, minutosAHora } from '../utils/duracion.util';

const KEY_PROFESIONALES = 'citalinda.profesionales.v1';
const KEY_RESERVAS = 'citalinda.reservas.v1';
const DURACION_BLOQUEO_MIN = 10;

function seedProfesionales(): Profesional[] {
  return [
    {
      id: 'prof-andrea',
      slug: 'andrea',
      nombre: 'Andrea M.',
      servicios: [
        { id: 'svc-clasico', icono: '💅', nombre: 'Manicure clásico', duracion: '1 h', duracionMin: 60, precio: 25, adelanto: 10, activo: true },
        { id: 'svc-gel', icono: '✨', nombre: 'Manicure en gel', duracion: '1 h 30 min', duracionMin: 90, precio: 40, adelanto: 10, activo: true },
        { id: 'svc-acrilicas', icono: '🌸', nombre: 'Uñas acrílicas', duracion: '2 h', duracionMin: 120, precio: 65, adelanto: 10, activo: true },
        { id: 'svc-retiro', icono: '🫧', nombre: 'Retiro de gel', duracion: '30 min', duracionMin: 30, precio: 15, adelanto: 10, activo: false },
      ],
      disponibilidad: [
        { diaSemana: 0, activo: false, rangos: [], pausas: [] },
        { diaSemana: 1, activo: true, rangos: [{ desde: '09:00', hasta: '18:00' }], pausas: [] },
        { diaSemana: 2, activo: false, rangos: [], pausas: [] },
        { diaSemana: 3, activo: true, rangos: [{ desde: '09:00', hasta: '18:00' }], pausas: [] },
        { diaSemana: 4, activo: true, rangos: [{ desde: '09:00', hasta: '18:00' }], pausas: [] },
        { diaSemana: 5, activo: false, rangos: [], pausas: [] },
        { diaSemana: 6, activo: true, rangos: [{ desde: '09:00', hasta: '18:00' }], pausas: [] },
      ],
      tiempoPreparacionDefaultMin: 15,
      yape: { numero: '987 654 321', titular: 'Andrea M.' },
    },
  ];
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seedReservas(): Reserva[] {
  const fecha = hoyISO();
  const base = { profesionalId: 'prof-andrea', fecha, creadoEn: Date.now(), actualizadoEn: Date.now() };
  return [
    { ...base, id: 'seed-1', servicioId: 'svc-gel', servicioNombre: 'Manicure en gel', precio: 40, duracionMin: 90, adelanto: 10, clienteNombre: 'Camila Torres', horaInicio: '09:00', horaFin: '10:30', estado: 'confirmada' },
    { ...base, id: 'seed-2', servicioId: 'svc-acrilicas', servicioNombre: 'Uñas acrílicas', precio: 65, duracionMin: 120, adelanto: 10, clienteNombre: 'Lucía Vega', horaInicio: '11:00', horaFin: '13:00', estado: 'confirmada' },
    { ...base, id: 'seed-3', servicioId: 'svc-clasico', servicioNombre: 'Manicure clásico', precio: 25, duracionMin: 60, adelanto: 10, clienteNombre: 'Sofía Rojas', horaInicio: '15:30', horaFin: '16:30', estado: 'pendiente_pago' },
  ];
}

function cargar<T>(key: string, seed: () => T): T {
  if (typeof localStorage === 'undefined') return seed();
  const raw = localStorage.getItem(key);
  if (!raw) return seed();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return seed();
  }
}

function generarId(): string {
  return `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

@Injectable({ providedIn: 'root' })
export class BookingStore {
  private readonly profesionalesSig = signal<Profesional[]>(cargar(KEY_PROFESIONALES, seedProfesionales));
  private readonly reservasSig = signal<Reserva[]>(cargar(KEY_RESERVAS, seedReservas));

  readonly profesionales = this.profesionalesSig.asReadonly();
  readonly reservas = this.reservasSig.asReadonly();

  readonly reservasHoy = computed(() => {
    const hoy = hoyISO();
    return this.reservasSig()
      .filter((r) => r.fecha === hoy && r.estado !== 'expirada' && r.estado !== 'slot_bloqueado')
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  });

  readonly reservasPendientesValidacion = computed(() =>
    this.reservasSig().filter((r) => r.estado === 'pendiente_pago'),
  );

  readonly proximaCita = computed(() => {
    const hoy = hoyISO();
    const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    return this.reservasSig()
      .filter((r) => r.fecha === hoy && r.estado === 'confirmada' && horaAMinutos(r.horaInicio) >= ahoraMin)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))[0];
  });

  constructor() {
    this.reconciliarEstados();

    effect(() => {
      const data = this.profesionalesSig();
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_PROFESIONALES, JSON.stringify(data));
    });
    effect(() => {
      const data = this.reservasSig();
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_RESERVAS, JSON.stringify(data));
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === KEY_RESERVAS && e.newValue) {
          this.reservasSig.set(JSON.parse(e.newValue));
        }
        if (e.key === KEY_PROFESIONALES && e.newValue) {
          this.profesionalesSig.set(JSON.parse(e.newValue));
        }
      });
    }
  }

  profesionalPorSlug(slug: string): Profesional | undefined {
    return this.profesionalesSig().find((p) => p.slug === slug);
  }

  calcularHorariosDisponibles(profesionalId: string, servicioId: string, fecha: string): string[] {
    const profesional = this.profesionalesSig().find((p) => p.id === profesionalId);
    const servicio = profesional?.servicios.find((s) => s.id === servicioId);
    if (!profesional || !servicio) return [];

    const reservasDelDia = this.reservasSig().filter((r) => r.profesionalId === profesionalId && r.fecha === fecha);

    return calcularHorarios(
      fecha,
      servicio,
      profesional.disponibilidad,
      reservasDelDia,
      profesional.tiempoPreparacionDefaultMin,
    );
  }

  bloquearSlot(
    profesionalId: string,
    servicioId: string,
    fecha: string,
    horaInicio: string,
    cliente: { nombre: string; telefono?: string },
  ): Reserva | undefined {
    this.reconciliarEstados();
    const disponibles = this.calcularHorariosDisponibles(profesionalId, servicioId, fecha);
    if (!disponibles.includes(horaInicio)) return undefined;

    const profesional = this.profesionalesSig().find((p) => p.id === profesionalId);
    const servicio = profesional?.servicios.find((s) => s.id === servicioId);
    if (!profesional || !servicio) return undefined;

    const horaFin = minutosAHora(horaAMinutos(horaInicio) + servicio.duracionMin);
    const ahora = Date.now();
    const nueva: Reserva = {
      id: generarId(),
      profesionalId,
      servicioId,
      servicioNombre: servicio.nombre,
      precio: servicio.precio,
      duracionMin: servicio.duracionMin,
      adelanto: servicio.adelanto,
      clienteNombre: cliente.nombre,
      clienteTelefono: cliente.telefono,
      fecha,
      horaInicio,
      horaFin,
      estado: 'slot_bloqueado',
      slotExpiraEn: ahora + DURACION_BLOQUEO_MIN * 60_000,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };

    this.reservasSig.update((rs) => [...rs, nueva]);
    return nueva;
  }

  subirComprobante(reservaId: string, comprobante: Omit<Comprobante, 'id' | 'subidoEn'>): boolean {
    this.reconciliarEstados();
    const reserva = this.reservasSig().find((r) => r.id === reservaId);
    if (!reserva || reserva.estado !== 'slot_bloqueado') return false;

    this.actualizarReserva(reservaId, {
      estado: 'pendiente_pago',
      comprobante: { ...comprobante, id: generarId(), subidoEn: Date.now() },
    });
    return true;
  }

  confirmarReserva(reservaId: string): void {
    this.actualizarReserva(reservaId, { estado: 'confirmada' });
  }

  rechazarReserva(reservaId: string, motivo?: string): void {
    this.actualizarReserva(reservaId, { estado: 'rechazada', motivo });
  }

  cancelarReserva(reservaId: string, motivo?: string): void {
    this.actualizarReserva(reservaId, { estado: 'cancelada', motivo });
  }

  marcarNoShow(reservaId: string): void {
    this.actualizarReserva(reservaId, { estado: 'no_show' });
  }

  liberarSlotExpirado(reservaId: string): void {
    const reserva = this.reservasSig().find((r) => r.id === reservaId);
    if (reserva && reserva.estado === 'slot_bloqueado') {
      this.actualizarReserva(reservaId, { estado: 'expirada' });
    }
  }

  agregarServicio(profesionalId: string, servicio: Profesional['servicios'][number]): void {
    this.profesionalesSig.update((ps) =>
      ps.map((p) => (p.id === profesionalId ? { ...p, servicios: [...p.servicios, servicio] } : p)),
    );
  }

  actualizarServicio(profesionalId: string, servicioId: string, cambios: Partial<Profesional['servicios'][number]>): void {
    this.profesionalesSig.update((ps) =>
      ps.map((p) =>
        p.id === profesionalId
          ? { ...p, servicios: p.servicios.map((s) => (s.id === servicioId ? { ...s, ...cambios } : s)) }
          : p,
      ),
    );
  }

  actualizarDisponibilidad(profesionalId: string, disponibilidad: Profesional['disponibilidad']): void {
    this.profesionalesSig.update((ps) => ps.map((p) => (p.id === profesionalId ? { ...p, disponibilidad } : p)));
  }

  private actualizarReserva(reservaId: string, cambios: Partial<Reserva>): void {
    this.reservasSig.update((rs) =>
      rs.map((r) => (r.id === reservaId ? { ...r, ...cambios, actualizadoEn: Date.now() } : r)),
    );
  }

  private reconciliarEstados(): void {
    const ahora = Date.now();
    const hoy = hoyISO();
    const minutoActual = new Date().getHours() * 60 + new Date().getMinutes();

    this.reservasSig.update((rs) =>
      rs.map((r) => {
        if (r.estado === 'slot_bloqueado' && r.slotExpiraEn && r.slotExpiraEn <= ahora) {
          return { ...r, estado: 'expirada' as EstadoReserva, actualizadoEn: ahora };
        }
        if (r.estado === 'confirmada' && (r.fecha < hoy || (r.fecha === hoy && horaAMinutos(r.horaFin) <= minutoActual))) {
          return { ...r, estado: 'completada' as EstadoReserva, actualizadoEn: ahora };
        }
        return r;
      }),
    );
  }
}
