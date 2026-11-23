import { Component, computed, inject, signal } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';
import { mensajeDeError } from '../../core/services/supabase-api';
import { BadgeEstado } from '../../core/ui/badge-estado/badge-estado';

@Component({
  selector: 'app-reservas',
  standalone: true,
  imports: [BadgeEstado],
  templateUrl: './reservas.html',
  styleUrl: './reservas.scss',
})
export class Reservas {
  private store = inject(BookingStore);

  /** Primero las que esperan validación; luego las más recientes. */
  reservas = computed(() =>
    [...this.store.reservas()].sort((a, b) => {
      const pa = a.estado === 'pendiente_pago' ? 0 : 1;
      const pb = b.estado === 'pendiente_pago' ? 0 : 1;
      return pa - pb || b.creadoEn - a.creadoEn;
    }),
  );
  enlaces = this.store.enlacesComprobantes;

  // document.baseURI incluye la subcarpeta de GitHub Pages (/CITA/)
  enlacePublico = computed(() => new URL(`reservar/${this.store.profesional()?.slug ?? ''}`, document.baseURI).href);
  enlaceCopiado = signal(false);

  /** id de la reserva que se está guardando (para desactivar sus botones) */
  procesando = signal<string | undefined>(undefined);
  error = signal<string | undefined>(undefined);

  confirmar(id: string) {
    return this.ejecutar(id, () => this.store.confirmarReserva(id));
  }

  rechazar(id: string) {
    if (!confirm('¿Rechazar esta reserva? El horario quedará libre.')) return;
    return this.ejecutar(id, () => this.store.rechazarReserva(id, 'Comprobante no válido'));
  }

  private async ejecutar(id: string, accion: () => Promise<void>) {
    this.procesando.set(id);
    this.error.set(undefined);
    try {
      await accion();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.procesando.set(undefined);
    }
  }

  /** Abre el chat de WhatsApp con la clienta (números de Perú: 51 + 9 dígitos). */
  enlaceWhatsapp(telefono: string): string {
    const digitos = telefono.replace(/\D/g, '');
    const numero = digitos.length === 9 ? `51${digitos}` : digitos;
    return `https://wa.me/${numero}`;
  }

  async copiarEnlace() {
    await navigator.clipboard.writeText(this.enlacePublico());
    this.enlaceCopiado.set(true);
    setTimeout(() => this.enlaceCopiado.set(false), 2000);
  }
}
