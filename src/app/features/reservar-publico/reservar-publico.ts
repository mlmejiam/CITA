import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BookingStore } from '../../core/services/booking-store';
import { Servicio } from '../../core/models/servicio.model';
import { Reserva } from '../../core/models/reserva.model';
import { descargarIcs } from '../../core/utils/ics.util';

type Paso = 'servicio' | 'horario' | 'datos' | 'pago' | 'confirmacion';

const TAMANO_MAX_COMPROBANTE = 1.5 * 1024 * 1024;
const DIAS_A_MOSTRAR = 14;

@Component({
  selector: 'app-reservar-publico',
  standalone: true,
  templateUrl: './reservar-publico.html',
  styleUrl: './reservar-publico.scss',
})
export class ReservarPublico {
  private store = inject(BookingStore);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  slug = this.route.snapshot.paramMap.get('slug') ?? '';
  profesional = this.store.profesionalPorSlug(this.slug);

  paso = signal<Paso>('servicio');
  servicioSeleccionado = signal<Servicio | undefined>(undefined);
  fechaSeleccionada = signal<string | undefined>(undefined);
  horaSeleccionada = signal<string | undefined>(undefined);
  reservaActual = signal<Reserva | undefined>(undefined);

  clienteNombre = signal('');
  clienteTelefono = signal('');

  comprobanteDataUrl = signal<string | undefined>(undefined);
  comprobanteNombre = signal<string | undefined>(undefined);
  comprobanteTipo = signal<string | undefined>(undefined);
  errorComprobante = signal<string | undefined>(undefined);

  restanteSeg = signal(0);
  private timerHandle?: ReturnType<typeof setInterval>;

  fechasDisponibles = computed(() => {
    const profesional = this.profesional;
    const servicio = this.servicioSeleccionado();
    if (!profesional || !servicio) return [];
    const resultado: { fecha: string; label: string }[] = [];
    for (let i = 0; i < DIAS_A_MOSTRAR; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const tieneHorarios = this.store.calcularHorariosDisponibles(profesional.id, servicio.id, fecha).length > 0;
      if (!tieneHorarios) continue;
      const label = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
      resultado.push({ fecha, label });
    }
    return resultado;
  });

  horariosDisponibles = computed(() => {
    const servicio = this.servicioSeleccionado();
    const fecha = this.fechaSeleccionada();
    if (!this.profesional || !servicio || !fecha) return [];
    return this.store.calcularHorariosDisponibles(this.profesional.id, servicio.id, fecha);
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.limpiarCountdown());
  }

  elegirServicio(servicio: Servicio) {
    this.servicioSeleccionado.set(servicio);
    const primeraFecha = this.fechasDisponibles()[0]?.fecha;
    this.fechaSeleccionada.set(primeraFecha);
    this.horaSeleccionada.set(undefined);
    this.paso.set('horario');
  }

  elegirFecha(fecha: string) {
    this.fechaSeleccionada.set(fecha);
    this.horaSeleccionada.set(undefined);
  }

  elegirHora(hora: string) {
    this.horaSeleccionada.set(hora);
    this.paso.set('datos');
  }

  confirmarDatos() {
    const profesional = this.profesional;
    const servicio = this.servicioSeleccionado();
    const fecha = this.fechaSeleccionada();
    const hora = this.horaSeleccionada();
    if (!profesional || !servicio || !fecha || !hora || !this.clienteNombre().trim()) return;

    const reserva = this.store.bloquearSlot(profesional.id, servicio.id, fecha, hora, {
      nombre: this.clienteNombre().trim(),
      telefono: this.clienteTelefono().trim() || undefined,
    });

    if (!reserva) {
      this.paso.set('horario');
      return;
    }

    this.reservaActual.set(reserva);
    this.iniciarCountdown(reserva);
    this.paso.set('pago');
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

    const reader = new FileReader();
    reader.onload = () => {
      this.comprobanteDataUrl.set(reader.result as string);
      this.comprobanteNombre.set(file.name);
      this.comprobanteTipo.set(file.type);
    };
    reader.readAsDataURL(file);
  }

  confirmarComprobante() {
    const reserva = this.reservaActual();
    const dataUrl = this.comprobanteDataUrl();
    const servicio = this.servicioSeleccionado();
    if (!reserva || !dataUrl || !servicio) return;

    const exito = this.store.subirComprobante(reserva.id, {
      dataUrl,
      nombreArchivo: this.comprobanteNombre() ?? 'comprobante',
      tipo: this.comprobanteTipo() ?? 'image/*',
      monto: servicio.adelanto,
    });

    if (!exito) {
      this.limpiarCountdown();
      this.reservaActual.set(undefined);
      this.paso.set('horario');
      return;
    }

    this.limpiarCountdown();
    this.paso.set('confirmacion');
  }

  agregarACalendario() {
    const reserva = this.reservaActual();
    if (!reserva || !this.profesional) return;
    descargarIcs(reserva, this.profesional);
  }

  private iniciarCountdown(reserva: Reserva) {
    this.limpiarCountdown();
    const tick = () => {
      const restante = Math.max(0, Math.floor(((reserva.slotExpiraEn ?? 0) - Date.now()) / 1000));
      this.restanteSeg.set(restante);
      if (restante <= 0) {
        this.limpiarCountdown();
        this.store.liberarSlotExpirado(reserva.id);
        this.reservaActual.set(undefined);
        this.paso.set('horario');
      }
    };
    tick();
    this.timerHandle = setInterval(tick, 1000);
  }

  private limpiarCountdown() {
    if (this.timerHandle) clearInterval(this.timerHandle);
  }
}
