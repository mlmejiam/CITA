import { Component, computed, inject, output } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingStore } from '../../core/services/booking-store';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private auth = inject(AuthService);
  private store = inject(BookingStore);
  private router = inject(Router);

  linkClick = output<void>();

  nombre = computed(() => this.store.profesional()?.nombre ?? this.auth.sesion()?.email ?? '');
  iniciales = computed(() =>
    this.nombre()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
  );

  async salir() {
    this.linkClick.emit();
    await this.auth.logout();
    this.store.limpiar();
    await this.router.navigateByUrl('/login');
  }

  items = [
    ['dashboard', '⌂', 'Inicio'],
    ['agenda', '▦', 'Mi agenda'],
    ['disponibilidad', '◷', 'Disponibilidad'],
    ['servicios', '✦', 'Servicios'],
    ['reservas', '♡', 'Reservas'],
    ['planes', '◇', 'Mi plan'],
  ];
}
