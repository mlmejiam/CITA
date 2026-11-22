import { Component, computed, inject } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';
import { BadgeEstado } from '../../core/ui/badge-estado/badge-estado';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [BadgeEstado],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private store = inject(BookingStore);

  hoy = new Date();

  citasHoy = this.store.reservasHoy;
  proximaCita = this.store.proximaCita;

  private validadasHoy = computed(() =>
    this.citasHoy().filter((c) => c.estado === 'confirmada' || c.estado === 'completada'),
  );
  private porValidarHoy = computed(() => this.citasHoy().filter((c) => c.estado === 'pendiente_pago'));

  ingresoEstimado = computed(() => this.validadasHoy().reduce((sum, c) => sum + c.precio, 0));
  adelantosValidados = computed(() => this.validadasHoy().reduce((sum, c) => sum + c.adelanto, 0));

  pendientesHoy = computed(() => this.porValidarHoy().length);
  confirmadasHoy = computed(() => this.validadasHoy().length);

  faltaConfigurarProximaSemana = computed(() => {
    const disponibilidad = this.store.profesionalPorSlug('andrea')?.disponibilidad ?? [];
    return disponibilidad.every((d) => !d.activo);
  });
}
