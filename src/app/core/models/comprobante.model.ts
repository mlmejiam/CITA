export interface Comprobante {
  id: string;
  /** Ruta del archivo en el bucket privado 'comprobantes' de Supabase Storage. */
  archivoPath: string;
  nombreArchivo: string;
  tipo: string;
  monto: number;
  subidoEn: number;
}
