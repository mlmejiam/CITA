import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Cliente mínimo de Supabase usando HttpClient (sin librerías extra).
 *  - /rest/v1      → tablas y funciones (PostgREST)
 *  - /storage/v1   → archivos
 */
@Injectable({ providedIn: 'root' })
export class SupabaseApi {
  private readonly http = inject(HttpClient);
  private readonly url = environment.supabaseUrl;
  private readonly key = environment.supabaseAnonKey;

  private headers(extra: Record<string, string> = {}): HttpHeaders {
    return new HttpHeaders({ apikey: this.key, Authorization: `Bearer ${this.key}`, ...extra });
  }

  /** GET /rest/v1/<tabla>?<filtros>. Ej: select('profesionales', { slug: 'eq.andrea', select: '*' }) */
  select<T>(tabla: string, params: Record<string, string>): Promise<T[]> {
    return firstValueFrom(
      this.http.get<T[]>(`${this.url}/rest/v1/${tabla}`, { headers: this.headers(), params }),
    );
  }

  /** POST /rest/v1/rpc/<funcion>: llama a una función de PostgreSQL. */
  rpc<T>(funcion: string, params: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(`${this.url}/rest/v1/rpc/${funcion}`, params, {
        headers: this.headers({ 'Content-Type': 'application/json' }),
      }),
    );
  }

  /** Sube un archivo a un bucket de Storage. */
  async subirArchivo(bucket: string, ruta: string, archivo: File): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.url}/storage/v1/object/${bucket}/${ruta}`, archivo, {
        headers: this.headers({ 'Content-Type': archivo.type || 'application/octet-stream', 'x-upsert': 'false' }),
      }),
    );
  }
}

const MENSAJES: Record<string, string> = {
  HORARIO_OCUPADO: 'Alguien acaba de tomar ese horario. Elige otro, por favor.',
  HORARIO_MUY_PRONTO: 'Ese horario ya está muy cerca. Elige uno con al menos 30 minutos de anticipación.',
  FUERA_DE_HORARIO: 'Ese horario ya no está disponible. Elige otro.',
  SERVICIO_NO_DISPONIBLE: 'Este servicio ya no está disponible.',
  RESERVA_NO_VALIDA: 'Se acabó el tiempo para pagar y el horario se liberó. Vuelve a elegir uno.',
};

/** Convierte un error de Supabase en un mensaje para la clienta. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    const codigo: string | undefined = error.error?.message;
    if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
    // Detalle técnico al final para poder diagnosticar (ej. "404 · PGRST202")
    const detalle = [error.status, error.error?.code].filter(Boolean).join(' · ');
    console.error('Error de Supabase', error);
    return `Ocurrió un error. Inténtalo de nuevo en un momento. (${detalle})`;
  }
  return 'Ocurrió un error. Inténtalo de nuevo en un momento.';
}

/** Código de negocio que devolvió la base (ej. 'HORARIO_OCUPADO'), si lo hay. */
export function codigoDeError(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? error.error?.message : undefined;
}
