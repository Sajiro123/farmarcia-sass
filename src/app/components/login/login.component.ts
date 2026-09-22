import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';
import { SedeService, SedeDTO } from '../../core/services/sede.service';

export interface PerfilPrueba {
  rol: 'ADMIN' | 'QUIMICO' | 'CAJERO';
  titulo: string;
  nombre: string;
  email: string;
  password: string;
  badge: string;
  icon: string;
  colorClass: string;
  borderClass: string;
  destinos: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  public themeService = inject(ThemeService);
  public authService = inject(AuthService);
  private sedeService = inject(SedeService);

  // Perfiles de acceso rápido sincronizados con saas-master-api y la BD
  perfilesPrueba: PerfilPrueba[] = [
    {
      rol: 'ADMIN',
      titulo: 'Administrador Farmacia',
      nombre: 'Carlos Alberto Mendoza',
      email: 'admin@medicare.com',
      password: 'admin123',
      badge: 'Propietario & Finanzas',
      icon: 'fa-solid fa-crown',
      colorClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60',
      borderClass: 'border-emerald-300 dark:border-emerald-700',
      destinos: 'Dashboard, Compras, Inventario, POS'
    },
    {
      rol: 'ADMIN',
      titulo: 'Superadmin Master',
      nombre: 'Superadministrador Global',
      email: 'superadmin@saascentral.com',
      password: 'admin123',
      badge: 'SaaS Master Full Access',
      icon: 'fa-solid fa-user-gear',
      colorClass: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60',
      borderClass: 'border-indigo-300 dark:border-indigo-700',
      destinos: 'Bypass Total, Acceso a todas las verticales'
    }
  ];

  perfilSeleccionado: PerfilPrueba = this.perfilesPrueba[0]; // Administrador por defecto

  loginForm: FormGroup = this.fb.group({
    email: ['admin@medicare.com', [Validators.required]],
    password: ['admin123', [Validators.required]],
    sede: ['11111111-1111-1111-1111-111111111111', Validators.required]
  });

  sedes: SedeDTO[] = [];

  isSubmitting = false;
  errorMessage = '';

  // Carousel logic
  currentSlide = 0;
  totalSlides = 3;
  private slideInterval: any;

  ngOnInit() {
    this.startAutoSlide();
    this.cargarSedes();
  }

  ngOnDestroy() {
    this.stopAutoSlide();
  }

  cargarSedes() {
    this.sedeService.listarSedes().subscribe(sedes => {
      this.sedes = sedes;
      const sedeActiva = this.authService.activeSede();
      if (sedeActiva && sedes.some(s => s.id === sedeActiva.id)) {
        this.loginForm.patchValue({ sede: sedeActiva.id });
      } else if (sedes.length > 0) {
        this.loginForm.patchValue({ sede: sedes[0].id });
      }
    });
  }

  seleccionarPerfil(perfil: PerfilPrueba, autoSubmit = false) {
    this.perfilSeleccionado = perfil;
    this.loginForm.patchValue({
      email: perfil.email,
      password: perfil.password
    });

    if (autoSubmit) {
      this.onSubmit();
    }
  }

  nextSlide() {
    this.currentSlide = (this.currentSlide + 1) % this.totalSlides;
  }

  prevSlide() {
    this.currentSlide = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
  }

  goToSlide(index: number) {
    this.currentSlide = index;
  }

  startAutoSlide() {
    this.slideInterval = setInterval(() => {
      this.nextSlide();
    }, 5000);
  }

  stopAutoSlide() {
    if (this.slideInterval) {
      clearInterval(this.slideInterval);
    }
  }

  async onSubmit() {
    if (this.loginForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';
      
      const formValue = this.loginForm.getRawValue();

      // Guardar sede activa
      const selectedSede = this.sedes.find(s => s.id === formValue.sede) || this.sedes[0] || {
        id: '11111111-1111-1111-1111-111111111111',
        nombre: 'Sede Cajamarca Central',
        direccion: 'Av. Central 123, Cajamarca',
        activa: true
      };
      
      this.authService.setSedeActiva({
        id: selectedSede.id,
        nombre: selectedSede.nombre,
        direccion: selectedSede.direccion || '',
        activa: true
      }, true);

      try {
        const res = await this.authService.loginAsync(formValue.email, formValue.password);
        this.isSubmitting = false;

        if (res.success && res.user) {
          const role = this.authService.activeRole();
          this.redirigirSegunRol(role);
        } else {
          this.errorMessage = res.message || 'Credenciales inválidas o negocio suspendido.';
        }
      } catch (e: any) {
        this.isSubmitting = false;
        this.errorMessage = e.message || 'Error de conexión con SaaS Master API.';
      }
    } else {
      this.loginForm.markAllAsTouched();
    }
  }

  private redirigirSegunRol(rol: 'ADMIN' | 'QUIMICO' | 'CAJERO') {
    if (rol === 'CAJERO') {
      // El cajero entra directamente al Punto de Venta (POS)
      this.router.navigate(['/pos']);
    } else {
      // El Administrador y Químico ingresan al Dashboard General
      this.router.navigate(['/dashboard']);
    }
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }
}
