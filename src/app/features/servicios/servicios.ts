import { Component, computed, inject, signal } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';
import { mensajeDeError } from '../../core/services/supabase-api';

@Component({
  selector: 'app-servicios',
  standalone: true,
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
})
export class Servicios {
  private store = inject(BookingStore);

  items = computed(() => this.store.profesional()?.servicios ?? []);
  error = signal<string | undefined>(undefined);

  async toggle(servicioId: string, activo: boolean) {
    this.error.set(undefined);
    try {
      await this.store.actualizarServicio(servicioId, { activo: !activo });
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }
}
