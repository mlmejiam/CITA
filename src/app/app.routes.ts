import { Routes } from '@angular/router';
import { PanelLayout } from './layout/panel-layout/panel-layout';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: PanelLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
        data: { title: 'Inicio' },
      },
      {
        path: 'agenda',
        loadComponent: () => import('./features/agenda/agenda').then((m) => m.Agenda),
        data: { title: 'Mi agenda' },
      },
      {
        path: 'disponibilidad',
        loadComponent: () => import('./features/disponibilidad/disponibilidad').then((m) => m.Disponibilidad),
        data: { title: 'Disponibilidad' },
      },
      {
        path: 'servicios',
        loadComponent: () => import('./features/servicios/servicios').then((m) => m.Servicios),
        data: { title: 'Servicios' },
      },
      {
        path: 'reservas',
        loadComponent: () => import('./features/reservas/reservas').then((m) => m.Reservas),
        data: { title: 'Reservas' },
      },
      {
        path: 'planes',
        loadComponent: () => import('./features/planes/planes').then((m) => m.Planes),
        data: { title: 'Mi plan' },
      },
    ],
  },
  {
    path: 'reservar/:slug',
    loadComponent: () => import('./features/reservar-publico/reservar-publico').then((m) => m.ReservarPublico),
  },
  { path: '**', redirectTo: 'dashboard' },
];
