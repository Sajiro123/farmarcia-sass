import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

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

  // Perfiles de prueba preconfigurados
  perfilesPrueba: PerfilPrueba[] = [
    {
      rol: 'ADMIN',
      titulo: 'Administrador',
      nombre: 'Carlos Mendoza',
      email: 'admin@medicare.com',
      password: 'admin123',
      badge: 'Acceso Total & KPIs',
      icon: 'fa-solid fa-crown',
      colorClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60',
      borderClass: 'border-emerald-300 dark:border-emerald-700',
      destinos: 'Dashboard, Compras, Inventario, POS'
    },
    {
      rol: 'QUIMICO',
      titulo: 'Químico Farmacéutico',
      nombre: 'Dra. Elena Ramos',
      email: 'quimico@medicare.com',
      password: 'quimico123',
      badge: 'DIGEMID & Recetas',
      icon: 'fa-solid fa-prescription-bottle-medical',
      colorClass: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60',
      borderClass: 'border-purple-300 dark:border-purple-700',
      destinos: 'Control FEFO, Recetas, Bajas, POS'
    },
    {
      rol: 'CAJERO',
      titulo: 'Cajero / Vendedor',
      nombre: 'Juan Pérez',
      email: 'cajero@medicare.com',
      password: 'cajero123',
      badge: 'POS & Arqueo Ciego',
      icon: 'fa-solid fa-cash-register',
      colorClass: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60',
      borderClass: 'border-blue-300 dark:border-blue-700',
      destinos: 'Punto de Venta POS, Catálogo'
    }
  ];

  perfilSeleccionado: PerfilPrueba = this.perfilesPrueba[0];

  loginForm: FormGroup = this.fb.group({
    email: ['admin@medicare.com', [Validators.required, Validators.email]],
    password: ['admin123', [Validators.required, Validators.minLength(4)]],
    sede: ['sede-principal', Validators.required]
  });

  sedes = [
    { id: 'sede-principal', nombre: 'Sede Principal - Av. Central 123' },
    { id: 'sucursal-norte', nombre: 'Sucursal Norte - Av. Norte 456' },
    { id: 'delivery-express', nombre: 'Delivery Express - Online' }
  ];

  isSubmitting = false;
  errorMessage = '';

  // Carousel logic
  currentSlide = 0;
  totalSlides = 3;
  private slideInterval: any;

  ngOnInit() {
    this.startAutoSlide();
  }

  ngOnDestroy() {
    this.stopAutoSlide();
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

  onSubmit() {
    if (this.loginForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';
      
      const formValue = this.loginForm.value;
      const emailLower = formValue.email.toLowerCase();

      // Determinar rol según email o perfil seleccionado
      let rolAsignado: 'ADMIN' | 'QUIMICO' | 'CAJERO' = 'ADMIN';
      if (emailLower.includes('cajero')) {
        rolAsignado = 'CAJERO';
      } else if (emailLower.includes('quimico')) {
        rolAsignado = 'QUIMICO';
      } else {
        rolAsignado = this.perfilSeleccionado?.rol || 'ADMIN';
      }

      this.authService.setRole(rolAsignado);

      // Guardar sede activa
      const selectedSede = this.sedes.find(s => s.id === formValue.sede) || this.sedes[0];
      this.authService.setSedeActiva({
        id: selectedSede.id,
        nombre: selectedSede.nombre,
        direccion: '',
        activa: true
      });

      this.authService.login({
        email: formValue.email,
        password: formValue.password
      }).subscribe({
        next: (res) => {
          this.isSubmitting = false;
          this.redirigirSegunRol(rolAsignado);
        },
        error: (err) => {
          // Fallback mock session para desarrollo local
          this.isSubmitting = false;
          this.authService.currentUser.set({
            token: 'mock-jwt-token-farmacia-2026',
            usuarioId: 'u-' + rolAsignado.toLowerCase(),
            email: formValue.email,
            tenantId: 'tenant-medicare-01',
            subdominio: 'medicare',
            nombreComercial: 'Farmacia Medicare',
            verticalId: 'FARMACIA',
            esSuperadmin: false
          });
          this.redirigirSegunRol(rolAsignado);
        }
      });
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
