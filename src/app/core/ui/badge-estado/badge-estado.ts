import { Component, computed, input } from '@angular/core';
import { EstadoReserva } from '../../models/reserva.model';

const ESTADO_INFO: Record<EstadoReserva, { label: string; bg: string; color: string }> = {
  slot_bloqueado: { label: 'Reservando...', bg: '#f6dfe5', color: '#bd4561' },
  pendiente_pago: { label: 'Por validar', bg: '#fff0c5', color: '#9d7800' },
  confirmada: { label: 'Confirmada', bg: '#e1f4e8', color: '#39815b' },
  rechazada: { label: 'Rechazada', bg: '#fbe4e4', color: '#df5f5f' },
  expirada: { label: 'Expirada', bg: '#f1eceb', color: '#a19698' },
  completada: { label: 'Completada', bg: '#eee', color: '#6b6062' },
  cancelada: { label: 'Cancelada', bg: '#fbe4e4', color: '#df5f5f' },
  no_show: { label: 'No asistió', bg: '#fbe4e4', color: '#df5f5f' },
};

@Component({
  selector: 'app-badge-estado',
  standalone: true,
  template: `<em [style.background]="info().bg" [style.color]="info().color">{{ info().label }}</em>`,
  styles: `em { font-style: normal; font-size: 9px; font-weight: 700; padding: 6px 9px; border-radius: 12px; display: inline-block; }`,
})
export class BadgeEstado {
  estado = input.required<EstadoReserva>();
  info = computed(() => ESTADO_INFO[this.estado()]);
}
