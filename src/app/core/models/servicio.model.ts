export interface Servicio {
  id: string;
  icono: string;
  nombre: string;
  descripcion?: string;
  duracion: string;
  duracionMin: number;
  precio: number;
  adelanto: number;
  tiempoPreparacionMin?: number;
  activo: boolean;
}
