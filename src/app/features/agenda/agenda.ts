import { Component, inject } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';
import { BadgeEstado } from '../../core/ui/badge-estado/badge-estado';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [BadgeEstado],
  templateUrl: './agenda.html',
  styleUrl: './agenda.scss',
})
export class Agenda {
  private store = inject(BookingStore);
  citas = this.store.reservasHoy;
  hoy = new Date();
}
