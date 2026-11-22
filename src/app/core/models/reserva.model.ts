import { Comprobante } from './comprobante.model';

export type EstadoReserva =
  | 'slot_bloqueado'
  | 'pendiente_pago'
  | 'confirmada'
  | 'rechazada'
  | 'expirada'
  | 'completada'
  | 'cancelada'
  | 'no_show';

export const ESTADOS_ACTIVOS: EstadoReserva[] = ['slot_bloqueado', 'pendiente_pago', 'confirmada'];

export interface Reserva {
  id: string;
  profesionalId: string;
  servicioId: string;
  servicioNombre: string;
  precio: number;
  duracionMin: number;
  adelanto: number;
  clienteNombre: string;
  clienteTelefono?: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: EstadoReserva;
  slotExpiraEn?: number;
  comprobante?: Comprobante;
  motivo?: string;
  creadoEn: number;
  actualizadoEn: number;
}
