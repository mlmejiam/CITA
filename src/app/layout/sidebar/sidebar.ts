import { Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  linkClick = output<void>();

  items = [
    ['dashboard', '⌂', 'Inicio'],
    ['agenda', '▦', 'Mi agenda'],
    ['disponibilidad', '◷', 'Disponibilidad'],
    ['servicios', '✦', 'Servicios'],
    ['reservas', '♡', 'Reservas'],
    ['planes', '◇', 'Mi plan'],
  ];
}
