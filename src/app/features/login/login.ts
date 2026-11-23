import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, mensajeDeLogin } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  password = signal('');
  enviando = signal(false);
  error = signal<string | undefined>(undefined);

  constructor() {
    // Si ya tiene sesión, directo al panel.
    if (this.auth.logueado()) this.router.navigateByUrl('/dashboard');
  }

  async entrar(event: Event) {
    event.preventDefault();
    if (!this.email().trim() || !this.password() || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(undefined);
    try {
      await this.auth.login(this.email(), this.password());
      await this.router.navigateByUrl('/dashboard');
    } catch (e) {
      this.error.set(mensajeDeLogin(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
