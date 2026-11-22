import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReservaPublicaService, Ocupado } from '../../core/services/reserva-publica.service';
import { codigoDeError, mensajeDeError } from '../../core/services/supabase-api';
import { Profesional } from '../../core/models/profesional.model';
import { Servicio } from '../../core/models/servicio.model';
import { Reserva } from '../../core/models/reserva.model';
import { descargarIcs } from '../../core/utils/ics.util';

type Paso = 'servicio' | 'horario' | 'datos' | 'pago' | 'confirmacion';

const TAMANO_MAX_COMPROBANTE = 1.5 * 1024 * 1024;
const DIAS_A_MOSTRAR = 14;

function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumarDias(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

@Component({
  selector: 'app-reservar-publico',
  standalone: true,
  templateUrl: './reservar-publico.html',
  styleUrl: './reservar-publico.scss',
})
export class ReservarPublico {
  private reservas = inject(ReservaPublicaService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  slug = this.route.snapshot.paramMap.get('slug') ?? '';

  cargando = signal(true);
  enviando = signal(false);
  errorCarga = signal<string | undefined>(undefined);
  errorReserva = signal<string | undefined>(undefined);

  profesional = signal<Profesional | undefined>(undefined);
  private ocupados = signal<Ocupado[]>([]);

  paso = signal<Paso>('servicio');
  servicioSeleccionado = signal<Servicio | undefined>(undefined);
  fechaSeleccionada = signal<string | undefined>(undefined);
  horaSeleccionada = signal<string | undefined>(undefined);
  reservaActual = signal<Reserva | undefined>(undefined);

  clienteNombre = signal('');
  clienteTelefono = signal('');

  comprobanteArchivo = signal<File | undefined>(undefined);
  comprobanteDataUrl = signal<string | undefined>(undefined);
  errorComprobante = signal<string | undefined>(undefined);

  restanteSeg = signal(0);
  private timerHandle?: ReturnType<typeof setInterval>;

  fechasDisponibles = computed(() => {
    const profesional = this.profesional();
    const servicio = this.servicioSeleccionado();
    if (!profesional || !servicio) return [];
    const resultado: { fecha: string; label: string }[] = [];
    for (let i = 0; i < DIAS_A_MOSTRAR; i++) {
      const d = sumarDias(i);
      const fecha = fechaISO(d);
      if (this.reservas.horariosLibres(profesional, servicio, fecha, this.ocupados()).length === 0) continue;
      const label = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
      resultado.push({ fecha, label });
    }
    return resultado;
  });

  horariosDisponibles = computed(() => {
    const profesional = this.profesional();
    const servicio = this.servicioSeleccionado();
    const fecha = this.fechaSeleccionada();
    if (!profesional || !servicio || !fecha) return [];
    return this.reservas.horariosLibres(profesional, servicio, fecha, this.ocupados());
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.limpiarCountdown());
    this.cargar();
  }

  private async cargar() {
    this.cargando.set(true);
    this.errorCarga.set(undefined);
    try {
      const profesional = await this.reservas.cargarProfesional(this.slug);
      this.profesional.set(profesional);
      if (profesional) await this.recargarOcupados();
    } catch (e) {
      this.errorCarga.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private async recargarOcupados() {
    const profesional = this.profesional();
    if (!profesional) return;
    const ocupados = await this.reservas.cargarOcupados(
      profesional.id,
      fechaISO(new Date()),
      fechaISO(sumarDias(DIAS_A_MOSTRAR - 1)),
    );
    this.ocupados.set(ocupados);
  }

  reintentar() {
    this.cargar();
  }

  elegirServicio(servicio: Servicio) {
    this.errorReserva.set(undefined);
    this.servicioSeleccionado.set(servicio);
    this.fechaSeleccionada.set(this.fechasDisponibles()[0]?.fecha);
    this.horaSeleccionada.set(undefined);
    this.paso.set('horario');
  }

  elegirFecha(fecha: string) {
    this.fechaSeleccionada.set(fecha);
    this.horaSeleccionada.set(undefined);
  }

  elegirHora(hora: string) {
    this.errorReserva.set(undefined);
    this.horaSeleccionada.set(hora);
    this.paso.set('datos');
  }

  async confirmarDatos() {
    const servicio = this.servicioSeleccionado();
    const fecha = this.fechaSeleccionada();
    const hora = this.horaSeleccionada();
    if (!servicio || !fecha || !hora || !this.clienteNombre().trim() || this.enviando()) return;

    this.enviando.set(true);
    this.errorReserva.set(undefined);
    try {
      const reserva = await this.reservas.bloquearSlot(servicio.id, fecha, hora, {
        nombre: this.clienteNombre().trim(),
        telefono: this.clienteTelefono().trim() || undefined,
      });
      this.reservaActual.set(reserva);
      this.iniciarCountdown(reserva);
      this.paso.set('pago');
    } catch (e) {
      await this.volverAHorarios(mensajeDeError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  onArchivoSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.errorComprobante.set(undefined);
    if (file.size > TAMANO_MAX_COMPROBANTE) {
      this.errorComprobante.set('La imagen es muy pesada. Usa una menor a 1.5 MB.');
      return;
    }

    this.comprobanteArchivo.set(file);
    const reader = new FileReader();
    reader.onload = () => this.comprobanteDataUrl.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  async confirmarComprobante() {
    const reserva = this.reservaActual();
    const archivo = this.comprobanteArchivo();
    if (!reserva || !archivo || this.enviando()) return;

    this.enviando.set(true);
    this.errorComprobante.set(undefined);
    try {
      const actualizada = await this.reservas.enviarComprobante(reserva, archivo);
      this.reservaActual.set(actualizada);
      this.limpiarCountdown();
      this.paso.set('confirmacion');
    } catch (e) {
      if (codigoDeError(e) === 'RESERVA_NO_VALIDA') {
        await this.volverAHorarios(mensajeDeError(e));
      } else {
        // Error de red o del archivo: la clienta puede reintentar mientras dure el bloqueo.
        this.errorComprobante.set(mensajeDeError(e));
      }
    } finally {
      this.enviando.set(false);
    }
  }

  agregarACalendario() {
    const reserva = this.reservaActual();
    const profesional = this.profesional();
    if (!reserva || !profesional) return;
    descargarIcs(reserva, profesional);
  }

  /** Vuelve al paso de horarios con un mensaje y lo ocupado actualizado. */
  private async volverAHorarios(mensaje: string) {
    this.limpiarCountdown();
    this.reservaActual.set(undefined);
    this.horaSeleccionada.set(undefined);
    this.comprobanteArchivo.set(undefined);
    this.comprobanteDataUrl.set(undefined);
    this.errorReserva.set(mensaje);
    this.paso.set('horario');
    try {
      await this.recargarOcupados();
    } catch {
      // Si falla la recarga se mantienen los datos anteriores.
    }
  }

  private iniciarCountdown(reserva: Reserva) {
    this.limpiarCountdown();
    const tick = () => {
      const restante = Math.max(0, Math.floor(((reserva.slotExpiraEn ?? 0) - Date.now()) / 1000));
      this.restanteSeg.set(restante);
      if (restante <= 0) {
        // La base marca el bloqueo como 'expirada' sola; aquí solo actualizamos la pantalla.
        this.volverAHorarios('Se acabó el tiempo para pagar y el horario se liberó. Vuelve a elegir uno.');
      }
    };
    tick();
    this.timerHandle = setInterval(tick, 1000);
  }

  private limpiarCountdown() {
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.timerHandle = undefined;
  }
}
