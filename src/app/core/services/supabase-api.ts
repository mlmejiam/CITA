import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Cliente mínimo de Supabase usando HttpClient (sin librerías extra).
 *  - /rest/v1      → tablas y funciones (PostgREST)
 *  - /storage/v1   → archivos
 * Si la profesional inició sesión, las peticiones van con su token y las reglas RLS
 * le muestran sus datos; si no, van como visitante anónimo (anon key).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = environment.supabaseUrl;
  private readonly key = environment.supabaseAnonKey;

  private async headers(extra: Record<string, string> = {}): Promise<HttpHeaders> {
    const token = (await this.auth.tokenVigente()) ?? this.key;
    return new HttpHeaders({ apikey: this.key, Authorization: `Bearer ${token}`, ...extra });
  }

  /** GET /rest/v1/<tabla>?<filtros>. Ej: select('profesionales', { slug: 'eq.andrea', select: '*' }) */
  async select<T>(tabla: string, params: Record<string, string>): Promise<T[]> {
    const headers = await this.headers();
    return firstValueFrom(this.http.get<T[]>(`${this.url}/rest/v1/${tabla}`, { headers, params }));
  }

  /** PATCH /rest/v1/<tabla>?<filtros>: actualiza y devuelve las filas cambiadas. */
  async update<T>(tabla: string, filtros: Record<string, string>, cambios: Record<string, unknown>): Promise<T[]> {
    const headers = await this.headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' });
    return firstValueFrom(
      this.http.patch<T[]>(`${this.url}/rest/v1/${tabla}`, cambios, { headers, params: filtros }),
    );
  }

  /** POST /rest/v1/rpc/<funcion>: llama a una función de PostgreSQL. */
  async rpc<T>(funcion: string, params: Record<string, unknown>): Promise<T> {
    const headers = await this.headers({ 'Content-Type': 'application/json' });
    return firstValueFrom(this.http.post<T>(`${this.url}/rest/v1/rpc/${funcion}`, params, { headers }));
  }

  /** Sube un archivo a un bucket de Storage. */
  async subirArchivo(bucket: string, ruta: string, archivo: File): Promise<void> {
    const headers = await this.headers({
      'Content-Type': archivo.type || 'application/octet-stream',
      'x-upsert': 'false',
    });
    await firstValueFrom(this.http.post(`${this.url}/storage/v1/object/${bucket}/${ruta}`, archivo, { headers }));
  }

  /**
   * Enlaces temporales para ver archivos privados (ej. comprobantes).
   * Devuelve un mapa ruta → URL que vence en `segundos`.
   */
  async enlacesFirmados(bucket: string, rutas: string[], segundos = 3600): Promise<Record<string, string>> {
    if (rutas.length === 0) return {};
    const headers = await this.headers({ 'Content-Type': 'application/json' });
    const r = await firstValueFrom(
      this.http.post<{ path: string; signedURL: string | null }[]>(
        `${this.url}/storage/v1/object/sign/${bucket}`,
        { expiresIn: segundos, paths: rutas },
        { headers },
      ),
    );
    const mapa: Record<string, string> = {};
    for (const f of r) if (f.signedURL) mapa[f.path] = `${this.url}/storage/v1${f.signedURL}`;
    return mapa;
  }
}

const MENSAJES: Record<string, string> = {
  HORARIO_OCUPADO: 'Alguien acaba de tomar ese horario. Elige otro, por favor.',
  HORARIO_MUY_PRONTO: 'Ese horario ya está muy cerca. Elige uno con al menos 30 minutos de anticipación.',
  FUERA_DE_HORARIO: 'Ese horario ya no está disponible. Elige otro.',
  SERVICIO_NO_DISPONIBLE: 'Este servicio ya no está disponible.',
  SIN_PERFIL: 'Tu cuenta todavía no tiene un perfil de profesional.',
  RESERVA_NO_VALIDA: 'Se acabó el tiempo para pagar y el horario se liberó. Vuelve a elegir uno.',
};

/** Convierte un error de Supabase en un mensaje para la clienta. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    const codigo: string | undefined = error.error?.message;
    if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
    if (error.error?.code === '23514') return 'Revisa los horarios: la hora de fin debe ser mayor que la de inicio.';
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
