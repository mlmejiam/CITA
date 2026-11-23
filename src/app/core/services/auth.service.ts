import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const KEY_SESION = 'citalinda.sesion.v1';
/** Renovamos el token un minuto antes de que venza. */
const MARGEN_RENOVACION_MS = 60_000;

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  expiraEn: number; // ms desde 1970
  userId: string;
  email: string;
}

/** Respuesta de Supabase Auth (POST /auth/v1/token) */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // segundos
  user: { id: string; email: string };
}

function leerSesion(): Sesion | null {
  try {
    const raw = localStorage.getItem(KEY_SESION);
    return raw ? (JSON.parse(raw) as Sesion) : null;
  } catch {
    return null;
  }
}

/**
 * Login de la profesional con Supabase Auth (correo + contraseña), sin librerías extra.
 * Guarda la sesión en localStorage y renueva el token cuando está por vencer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.supabaseUrl}/auth/v1`;
  private readonly headers = new HttpHeaders({
    apikey: environment.supabaseAnonKey,
    'Content-Type': 'application/json',
  });

  private readonly sesionSig = signal<Sesion | null>(leerSesion());
  private renovando?: Promise<Sesion | null>;

  readonly sesion = this.sesionSig.asReadonly();
  readonly logueado = computed(() => this.sesionSig() !== null);

  async login(email: string, password: string): Promise<void> {
    const r = await firstValueFrom(
      this.http.post<TokenResponse>(
        `${this.url}/token?grant_type=password`,
        { email: email.trim(), password },
        { headers: this.headers },
      ),
    );
    this.guardar(r);
  }

  async logout(): Promise<void> {
    const sesion = this.sesionSig();
    this.limpiar();
    if (!sesion) return;
    try {
      await firstValueFrom(
        this.http.post(`${this.url}/logout`, {}, {
          headers: this.headers.set('Authorization', `Bearer ${sesion.accessToken}`),
        }),
      );
    } catch {
      // Si falla, igual la sesión local ya se borró.
    }
  }

  /** Token vigente para llamar a la API (lo renueva si hace falta), o null si no hay sesión. */
  async tokenVigente(): Promise<string | null> {
    const sesion = this.sesionSig();
    if (!sesion) return null;
    if (sesion.expiraEn - MARGEN_RENOVACION_MS > Date.now()) return sesion.accessToken;

    // Evita dos renovaciones a la vez si varias peticiones salen juntas.
    this.renovando ??= this.renovar(sesion.refreshToken).finally(() => (this.renovando = undefined));
    const nueva = await this.renovando;
    return nueva?.accessToken ?? null;
  }

  private async renovar(refreshToken: string): Promise<Sesion | null> {
    try {
      const r = await firstValueFrom(
        this.http.post<TokenResponse>(
          `${this.url}/token?grant_type=refresh_token`,
          { refresh_token: refreshToken },
          { headers: this.headers },
        ),
      );
      return this.guardar(r);
    } catch (e) {
      // Sin internet: mantenemos la sesión e intentamos luego. Token rechazado: hay que volver a entrar.
      if (e instanceof HttpErrorResponse && e.status !== 0) this.limpiar();
      return null;
    }
  }

  private guardar(r: TokenResponse): Sesion {
    const sesion: Sesion = {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expiraEn: Date.now() + r.expires_in * 1000,
      userId: r.user.id,
      email: r.user.email,
    };
    localStorage.setItem(KEY_SESION, JSON.stringify(sesion));
    this.sesionSig.set(sesion);
    return sesion;
  }

  private limpiar() {
    localStorage.removeItem(KEY_SESION);
    this.sesionSig.set(null);
  }
}

/** Mensaje amigable para errores de login. */
export function mensajeDeLogin(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No hay conexión. Revisa tu internet.';
    if (error.status === 400) return 'Correo o contraseña incorrectos.';
    if (error.status === 429) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}
