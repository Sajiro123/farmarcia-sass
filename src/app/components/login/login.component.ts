import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';
import { SedeService, SedeDTO } from '../../core/services/sede.service';
import { SaasMasterService } from '../../core/services/saas-master.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  public themeService = inject(ThemeService);
  public authService = inject(AuthService);
  private sedeService = inject(SedeService);
  private saasMasterService = inject(SaasMasterService);
  private cdr = inject(ChangeDetectorRef);

  loginForm: FormGroup = this.fb.group({
    sede: ['', Validators.required],
    email: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  sedes: SedeDTO[] = [];
  isSubmitting = false;
  errorMessage = '';
  showPassword = false;

  // Datos dinámicos del negocio (Tenant) cargados de la base de datos
  logoUrl: string | null = null;
  businessName: string = 'Farmacia Medicare';
  businessVertical: string = 'FARMACIA';
  isLoadingLogo = true;
  logoError = false;

  ngOnInit() {
    this.cargarSedes();
    this.cargarLogoFarmacia();
  }

  cargarLogoFarmacia() {
    // 1. Carga inmediata desde almacenamiento local si existe previamente (Zero CLS)
    const cachedLogo = localStorage.getItem('medicare_tenant_logo');
    const cachedName = localStorage.getItem('medicare_tenant_name');
    if (cachedLogo) {
      this.logoUrl = cachedLogo;
      this.isLoadingLogo = false;
      this.cdr.detectChanges();
    }
    if (cachedName) {
      this.businessName = cachedName;
    }

    // 2. Consulta a SaaS Master API: busca el negocio tipo FARMACIA (por default Medicare)
    this.saasMasterService.getFarmaciaTenant().then(tenant => {
      this.isLoadingLogo = false;
      if (tenant) {
        if (tenant.logoUrl) {
          this.logoUrl = tenant.logoUrl;
          localStorage.setItem('medicare_tenant_logo', tenant.logoUrl);
        }
        if (tenant.nombreComercial) {
          this.businessName = tenant.nombreComercial;
          localStorage.setItem('medicare_tenant_name', tenant.nombreComercial);
        }
        if (tenant.verticalId) {
          this.businessVertical = tenant.verticalId;
        }
      }
      this.cdr.detectChanges();
    }).catch(err => {
      console.warn('[LoginComponent] Error al consultar datos del negocio:', err);
      this.isLoadingLogo = false;
      this.cdr.detectChanges();
    });
  }

  handleLogoError() {
    this.logoError = true;
    this.cdr.detectChanges();
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
      this.cdr.detectChanges();
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
    this.cdr.detectChanges();
  }

  async onSubmit() {
    if (this.loginForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
      
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
        
        if (res.success && res.user) {
          const role = this.authService.activeRole();
          this.redirigirSegunRol(role);
        } else {
          this.isSubmitting = false;
          this.errorMessage = res.message || 'Credenciales incorrectas o usuario inactivo.';
          this.cdr.detectChanges();
        }
      } catch (e: any) {
        this.isSubmitting = false;
        this.errorMessage = e.message || 'Error de conexión con el servidor de autenticación.';
        this.cdr.detectChanges();
      }
    } else {
      this.loginForm.markAllAsTouched();
      this.cdr.detectChanges();
    }
  }

  private redirigirSegunRol(rol: 'ADMIN' | 'QUIMICO' | 'CAJERO') {
    if (rol === 'CAJERO') {
      this.router.navigate(['/pos']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  toggleTheme() {
    this.themeService.toggleTheme();
    this.cdr.detectChanges();
  }
}
