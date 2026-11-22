import { Component, inject, signal } from '@angular/core';
import { BookingStore } from '../../core/services/booking-store';
import { DisponibilidadSemana } from '../../core/models/disponibilidad.model';

const PROFESIONAL_ID = 'prof-andrea';

const DIAS_ORDEN: { diaSemana: number; label: string }[] = [
  { diaSemana: 1, label: 'Lunes' },
  { diaSemana: 2, label: 'Martes' },
  { diaSemana: 3, label: 'Miércoles' },
  { diaSemana: 4, label: 'Jueves' },
  { diaSemana: 5, label: 'Viernes' },
  { diaSemana: 6, label: 'Sábado' },
  { diaSemana: 0, label: 'Domingo' },
];

@Component({
  selector: 'app-disponibilidad',
  standalone: true,
  templateUrl: './disponibilidad.html',
  styleUrl: './disponibilidad.scss',
})
export class Disponibilidad {
  private store = inject(BookingStore);

  dias = DIAS_ORDEN;

  disponibilidad = signal<DisponibilidadSemana>(
    structuredClone(this.store.profesionales().find((p) => p.id === PROFESIONAL_ID)?.disponibilidad ?? []),
  );

  guardadoOk = signal(false);

  diaPor(diaSemana: number) {
    return this.disponibilidad().find((d) => d.diaSemana === diaSemana)!;
  }

  toggle(diaSemana: number) {
    this.disponibilidad.update((dias) =>
      dias.map((d) =>
        d.diaSemana === diaSemana
          ? {
              ...d,
              activo: !d.activo,
              rangos: d.rangos.length > 0 ? d.rangos : [{ desde: '09:00', hasta: '18:00' }],
            }
          : d,
      ),
    );
  }

  actualizarRango(diaSemana: number, campo: 'desde' | 'hasta', valor: string) {
    this.disponibilidad.update((dias) =>
      dias.map((d) =>
        d.diaSemana === diaSemana
          ? { ...d, rangos: [{ ...(d.rangos[0] ?? { desde: '09:00', hasta: '18:00' }), [campo]: valor }] }
          : d,
      ),
    );
  }

  guardar() {
    this.store.actualizarDisponibilidad(PROFESIONAL_ID, this.disponibilidad());
    this.guardadoOk.set(true);
    setTimeout(() => this.guardadoOk.set(false), 2000);
  }
}
