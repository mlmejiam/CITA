import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, startWith } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';
import { BookingStore } from '../../core/services/booking-store';
import { mensajeDeError } from '../../core/services/supabase-api';

/** Cada cuánto se buscan reservas nuevas mientras el panel está abierto. */
const REFRESCO_MS = 60_000;

@Component({
  selector: 'app-panel-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, Sidebar],
  templateUrl: './panel-layout.html',
  styleUrl: './panel-layout.scss',
})
export class PanelLayout {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  store = inject(BookingStore);

  menu = signal(false);

  private navigationEnd = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
    ),
  );

  titulo = computed(() => {
    this.navigationEnd();
    let route = this.route.firstChild;
    while (route?.firstChild) route = route.firstChild;
    return route?.snapshot.data['title'] ?? 'Cita Linda';
  });

  fechaHoy = new Date()
    .toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  constructor() {
    this.actualizar();
    const handle = setInterval(() => this.actualizar(true), REFRESCO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }

  /** Recarga los datos. En segundo plano no muestra errores para no molestar. */
  async actualizar(silencioso = false) {
    if (this.store.cargando()) return;
    try {
      await this.store.cargar();
    } catch (e) {
      if (!silencioso || !this.store.listo()) this.store.error.set(mensajeDeError(e));
    }
  }
}
