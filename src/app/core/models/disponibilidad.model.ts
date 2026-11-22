export interface RangoHorario {
  desde: string;
  hasta: string;
}

export interface Pausa {
  desde: string;
  hasta: string;
}

export interface DiaDisponibilidad {
  diaSemana: number;
  activo: boolean;
  rangos: RangoHorario[];
  pausas: Pausa[];
}

export type DisponibilidadSemana = DiaDisponibilidad[];
