import { Component, computed, inject, signal } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';
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

  reservas = computed(() =>
    this.store
      .reservas()
      .filter((r) => r.estado !== 'slot_bloqueado')
      .sort((a, b) => b.creadoEn - a.creadoEn),
  );

  enlacePublico = `${location.origin}/reservar/andrea`;
  enlaceCopiado = signal(false);

  confirmar(id: string) {
    this.store.confirmarReserva(id);
  }

  rechazar(id: string) {
    this.store.rechazarReserva(id, 'Comprobante no válido');
  }

  async copiarEnlace() {
    await navigator.clipboard.writeText(this.enlacePublico);
    this.enlaceCopiado.set(true);
    setTimeout(() => this.enlaceCopiado.set(false), 2000);
  }
}
