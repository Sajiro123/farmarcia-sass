import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';
import { SedeService, SedeDTO } from '../../core/services/sede.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  public themeService = inject(ThemeService);
  public authService = inject(AuthService);
  private sedeService = inject(SedeService);

  loginForm: FormGroup = this.fb.group({
    sede: ['', Validators.required],
    email: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  sedes: SedeDTO[] = [];
  isSubmitting = false;
  errorMessage = '';
  showPassword = false;

  ngOnInit() {
    this.cargarSedes();
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

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async onSubmit() {
    if (this.loginForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';
      
      const formValue = this.loginForm.getRawValue();

      // Guardar sede activa seleccionada
      const selectedSede = this.sedes.find(s => s.id === formValue.sede) || this.sedes[0];
      if (selectedSede) {
        this.authService.setSedeActiva({
          id: selectedSede.id,
          nombre: selectedSede.nombre,
          direccion: selectedSede.direccion || '',
          activa: true
        }, true);
      }

      try {
        const res = await this.authService.loginAsync(formValue.email, formValue.password, formValue.sede);
        this.isSubmitting = false;

        if (res.success && res.user) {
          const role = this.authService.activeRole();
          this.redirigirSegunRol(role);
        } else {
          this.errorMessage = res.message || 'Credenciales incorrectas o usuario inactivo.';
        }
      } catch (e: any) {
        this.isSubmitting = false;
        this.errorMessage = e.message || 'Error de conexión con el servidor de autenticación.';
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
