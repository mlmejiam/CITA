import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, startWith } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';

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
}
