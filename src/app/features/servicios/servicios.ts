import { Component, computed, inject } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';

const PROFESIONAL_ID = 'prof-andrea';

@Component({
  selector: 'app-servicios',
  standalone: true,
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
})
export class Servicios {
  private store = inject(BookingStore);

  items = computed(() => this.store.profesionales().find((p) => p.id === PROFESIONAL_ID)?.servicios ?? []);

  toggle(servicioId: string, activo: boolean) {
    this.store.actualizarServicio(PROFESIONAL_ID, servicioId, { activo: !activo });
  }
}
