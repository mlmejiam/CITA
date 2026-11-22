import { Servicio } from './servicio.model';
import { DisponibilidadSemana } from './disponibilidad.model';

export interface DatosYape {
  numero: string;
  titular: string;
  qrUrl?: string;
}

export interface Profesional {
  id: string;
  slug: string;
  nombre: string;
  fotoUrl?: string;
  servicios: Servicio[];
  disponibilidad: DisponibilidadSemana;
  tiempoPreparacionDefaultMin: number;
  yape: DatosYape;
}
