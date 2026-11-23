import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseApi } from './supabase-api';
import { AuthService } from './auth.service';
import { ProfesionalRow, ReservaRow, ServicioRow, aProfesional, aReserva, aServicio } from './supabase-mappers';
import { Profesional } from '../models/profesional.model';
import { Reserva, EstadoReserva } from '../models/reserva.model';
import { Servicio } from '../models/servicio.model';
import { DisponibilidadSemana } from '../models/disponibilidad.model';
import { horaAMinutos } from '../utils/duracion.util';

/** Cuántos días hacia atrás trae el historial de reservas. */
const DIAS_HISTORIAL = 30;

function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hoyISO(): string {
  return fechaISO(new Date());
}

/**
 * Datos del panel de la profesional que inició sesión, guardados en Supabase.
 * Las reglas RLS de la base garantizan que solo ve y cambia lo suyo.
 */
@Injectable({ providedIn: 'root' })
export class BookingStore {
  private readonly api = inject(SupabaseApi);
  private readonly auth = inject(AuthService);

  private readonly profesionalSig = signal<Profesional | undefined>(undefined);
  private readonly reservasSig = signal<Reserva[]>([]);
  /** ruta del comprobante → enlace temporal para verlo */
  private readonly enlacesSig = signal<Record<string, string>>({});

  readonly cargando = signal(false);
  readonly listo = signal(false);
  readonly error = signal<string | undefined>(undefined);

  readonly profesional = this.profesionalSig.asReadonly();
  readonly reservas = this.reservasSig.asReadonly();
  readonly enlacesComprobantes = this.enlacesSig.asReadonly();

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

  /** Trae perfil, servicios, disponibilidad y reservas. Lanza el error para que la pantalla lo muestre. */
  async cargar(): Promise<void> {
    const sesion = this.auth.sesion();
    if (!sesion) return;

    this.cargando.set(true);
    this.error.set(undefined);
    try {
      // Antes de leer, la base marca bloqueos vencidos como 'expirada' y citas pasadas como 'completada'.
      await this.api.rpc('reconciliar_estados', {});

      const [perfil] = await this.api.select<ProfesionalRow>('profesionales', {
        usuario_id: `eq.${sesion.userId}`,
        select:
          'id,slug,nombre,foto_url,tiempo_preparacion_min,yape_numero,yape_titular,yape_qr_url,' +
          'servicios(*),disponibilidad(dia_semana,activo,rangos_horario(tipo,desde,hasta))',
      });
      if (!perfil) {
        this.profesionalSig.set(undefined);
        this.error.set('Tu cuenta todavía no tiene un perfil de profesional. Pide que lo creen con seed_demo.sql.');
        return;
      }
      const profesional = aProfesional(perfil);
      profesional.servicios.sort((a, b) => a.nombre.localeCompare(b.nombre));
      this.profesionalSig.set(profesional);

      const desde = new Date();
      desde.setDate(desde.getDate() - DIAS_HISTORIAL);
      const filas = await this.api.select<ReservaRow>('reservas', {
        profesional_id: `eq.${profesional.id}`,
        fecha: `gte.${fechaISO(desde)}`,
        estado: 'neq.slot_bloqueado',
        select: '*,comprobantes(*)',
        order: 'fecha.desc,hora_inicio.asc',
      });
      const reservas = filas.map(aReserva);
      this.reservasSig.set(reservas);

      const rutas = reservas.flatMap((r) => (r.comprobante ? [r.comprobante.archivoPath] : []));
      this.enlacesSig.set(await this.api.enlacesFirmados('comprobantes', rutas));
      this.listo.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Borra los datos en memoria (al cerrar sesión). */
  limpiar() {
    this.profesionalSig.set(undefined);
    this.reservasSig.set([]);
    this.enlacesSig.set({});
    this.listo.set(false);
    this.error.set(undefined);
  }

  confirmarReserva(reservaId: string): Promise<void> {
    return this.cambiarEstado(reservaId, 'confirmada');
  }

  rechazarReserva(reservaId: string, motivo?: string): Promise<void> {
    return this.cambiarEstado(reservaId, 'rechazada', motivo);
  }

  cancelarReserva(reservaId: string, motivo?: string): Promise<void> {
    return this.cambiarEstado(reservaId, 'cancelada', motivo);
  }

  marcarNoShow(reservaId: string): Promise<void> {
    return this.cambiarEstado(reservaId, 'no_show');
  }

  async actualizarServicio(servicioId: string, cambios: Partial<Pick<Servicio, 'activo' | 'precio' | 'adelanto'>>) {
    const [fila] = await this.api.update<ServicioRow>('servicios', { id: `eq.${servicioId}` }, cambios);
    if (!fila) return;
    const actualizado = aServicio(fila);
    this.profesionalSig.update((p) =>
      p ? { ...p, servicios: p.servicios.map((s) => (s.id === servicioId ? actualizado : s)) } : p,
    );
  }

  async actualizarDisponibilidad(disponibilidad: DisponibilidadSemana) {
    await this.api.rpc('guardar_disponibilidad', { p_dias: disponibilidad });
    this.profesionalSig.update((p) => (p ? { ...p, disponibilidad: structuredClone(disponibilidad) } : p));
  }

  private async cambiarEstado(reservaId: string, estado: EstadoReserva, motivo?: string) {
    const cambios: Record<string, unknown> = { estado };
    if (motivo !== undefined) cambios['motivo'] = motivo;
    const [fila] = await this.api.update<ReservaRow>('reservas', { id: `eq.${reservaId}`, select: '*,comprobantes(*)' }, cambios);
    if (!fila) return;
    const actualizada = aReserva(fila);
    this.reservasSig.update((rs) => rs.map((r) => (r.id === reservaId ? actualizada : r)));
  }
}
