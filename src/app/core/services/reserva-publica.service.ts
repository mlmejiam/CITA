import { Injectable, inject } from '@angular/core';
import { SupabaseApi } from './supabase-api';
import { OcupadoRow, ProfesionalRow, ReservaRow, aProfesional, aReserva, hhmm } from './supabase-mappers';
import { calcularHorariosDisponibles } from './disponibilidad.util';
import { Profesional } from '../models/profesional.model';
import { Reserva } from '../models/reserva.model';
import { Servicio } from '../models/servicio.model';

export interface Ocupado {
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

/** Todo lo que necesita la página pública /reservar/:slug, contra Supabase. */
@Injectable({ providedIn: 'root' })
export class ReservaPublicaService {
  private readonly api = inject(SupabaseApi);

  /** Profesional + servicios activos + disponibilidad, en una sola consulta. */
  async cargarProfesional(slug: string): Promise<Profesional | undefined> {
    const filas = await this.api.select<ProfesionalRow>('profesionales', {
      slug: `eq.${slug}`,
      select:
        'id,slug,nombre,foto_url,tiempo_preparacion_min,yape_numero,yape_titular,yape_qr_url,' +
        'servicios(*),disponibilidad(dia_semana,activo,rangos_horario(tipo,desde,hasta))',
    });
    return filas[0] ? aProfesional(filas[0]) : undefined;
  }

  async cargarOcupados(profesionalId: string, desde: string, hasta: string): Promise<Ocupado[]> {
    const filas = await this.api.rpc<OcupadoRow[]>('horarios_ocupados_rango', {
      p_profesional_id: profesionalId,
      p_desde: desde,
      p_hasta: hasta,
    });
    return filas.map((f) => ({ fecha: f.fecha, horaInicio: hhmm(f.hora_inicio), horaFin: hhmm(f.hora_fin) }));
  }

  /** Reutiliza el cálculo que ya existía, alimentado con lo ocupado según la base. */
  horariosLibres(profesional: Profesional, servicio: Servicio, fecha: string, ocupados: Ocupado[]): string[] {
    const delDia = ocupados
      .filter((o) => o.fecha === fecha)
      .map((o) => ({ fecha, horaInicio: o.horaInicio, horaFin: o.horaFin, estado: 'confirmada' }) as Reserva);
    return calcularHorariosDisponibles(
      fecha,
      servicio,
      profesional.disponibilidad,
      delDia,
      profesional.tiempoPreparacionDefaultMin,
    );
  }

  /** Aparta el horario 10 minutos. La base rechaza si alguien lo tomó antes. */
  async bloquearSlot(
    servicioId: string,
    fecha: string,
    horaInicio: string,
    cliente: { nombre: string; telefono?: string },
  ): Promise<Reserva> {
    const fila = await this.api.rpc<ReservaRow>('bloquear_slot', {
      p_servicio_id: servicioId,
      p_fecha: fecha,
      p_hora_inicio: horaInicio,
      p_cliente_nombre: cliente.nombre,
      p_cliente_telefono: cliente.telefono ?? null,
    });
    return aReserva(fila);
  }

  /** Sube la captura a Storage y pasa la reserva a 'pendiente_pago'. */
  async enviarComprobante(reserva: Reserva, archivo: File): Promise<Reserva> {
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'comprobante';
    const ruta = `${reserva.profesionalId}/${reserva.id}/${Date.now()}-${nombreSeguro}`;
    await this.api.subirArchivo('comprobantes', ruta, archivo);

    const fila = await this.api.rpc<ReservaRow>('registrar_comprobante', {
      p_reserva_id: reserva.id,
      p_archivo_path: ruta,
      p_nombre_archivo: archivo.name,
      p_tipo: archivo.type,
    });
    return aReserva(fila);
  }
}
