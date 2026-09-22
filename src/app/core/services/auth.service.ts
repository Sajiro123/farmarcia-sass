import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthResponse, Sede } from '../models/auth.model';
import { SaasMasterService, SaasAuthData } from './saas-master.service';
import { SupabaseService } from './supabase.service';
import { Observable, from, of, map, catchError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private saasMasterService = inject(SaasMasterService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  // Señales reactivas de Angular
  currentUser = signal<AuthResponse | null>(null);
  activeSede = signal<Sede | null>(null);
  activeRole = signal<'ADMIN' | 'QUIMICO' | 'CAJERO'>('ADMIN');
  sessionClosedReason = signal<string | null>(null);

  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

  constructor() {
    this.loadState();
  }

  setRole(role: 'ADMIN' | 'QUIMICO' | 'CAJERO') {
    this.activeRole.set(role);
    localStorage.setItem('active_role', role);
  }

  getUserDisplayName(): string {
    const user = this.currentUser();
    if (user?.nombreCompleto) return user.nombreCompleto;
    const role = this.activeRole();
    if (role === 'ADMIN') return 'Carlos Mendoza (Administrador)';
    if (role === 'QUIMICO') return 'Lic. Rosa Morales (Químico Farmacéutico)';
    return 'Juan Carlos Mendoza (Cajero)';
  }

  getUserRoleTitle(): string {
    const user = this.currentUser();
    if (user?.esSuperadmin) return 'SUPERADMINISTRADOR (SaaS Master)';
    if (user?.rolNombre) return user.rolNombre.toUpperCase();
    const role = this.activeRole();
    if (role === 'ADMIN') return 'ADMINISTRADOR GENERAL';
    if (role === 'QUIMICO') return 'QUÍMICO FARMACÉUTICO';
    return 'CAJERO / DISPENSADOR';
  }

  tienePermiso(codigo: string): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.esSuperadmin || user.esPropietario || user.rolCodigo === 'ADMIN_NEGOCIO' || user.rolCodigo === 'SUPERADMIN') {
      return true;
    }
    return Boolean(user.acciones && user.acciones.includes(codigo));
  }

  /**
   * Login unificado compatible con RESTAURANTE y Farmacia:
   * 1. Consulta al Control Plane (saas-master-api en puerto 8081).
   * 2. Soporta Superadmin bypass (acceso total irrestricto).
   * 3. Si es usuario de tenant, valida vertical FARMACIA.
   * 4. Mapea rol a 'ADMIN' | 'QUIMICO' | 'CAJERO'.
   * 5. Almacena tokens y datos de sesión en localStorage.
   */
  async loginAsync(usernameOrEmail: string, password: string): Promise<{ success: boolean; message?: string; user?: AuthResponse }> {
    try {
      const res = await this.saasMasterService.login(usernameOrEmail, password);

      if (!res.success || !res.data) {
        return { success: false, message: res.message || 'Credenciales incorrectas en SaaS Master' };
      }

      const authData = res.data;
      const isSuperAdmin = Boolean(authData.esSuperadmin || authData.rolCodigo === 'SUPERADMIN' || authData.rolCodigo === 'ADMIN_MASTER' || authData.esPropietario);

      // Si NO es superadmin, verificar que pertenezca a la vertical FARMACIA
      if (!isSuperAdmin && authData.verticalId && authData.verticalId !== 'FARMACIA') {
        return {
          success: false,
          message: `Este usuario pertenece a la vertical ${authData.verticalId}, no a FARMACIA.`
        };
      }

      // Mapeo inteligente de roles para Farmacia
      let assignedRole: 'ADMIN' | 'QUIMICO' | 'CAJERO' = 'ADMIN';
      const rolCode = (authData.rolCodigo || '').toUpperCase();

      if (isSuperAdmin || rolCode.includes('ADMIN')) {
        assignedRole = 'ADMIN';
      } else if (rolCode.includes('QUIMIC')) {
        assignedRole = 'QUIMICO';
      } else if (rolCode.includes('CAJER')) {
        assignedRole = 'CAJERO';
      }

      const userResponse: AuthResponse = {
        token: authData.token,
        tipoToken: authData.tipoToken,
        usuarioId: authData.usuarioId,
        email: authData.email,
        tenantId: authData.tenantId,
        subdominio: authData.subdominio,
        nombreComercial: authData.nombreComercial || 'Farmacia Medicare',
        verticalId: authData.verticalId || 'FARMACIA',
        planId: authData.planId,
        esSuperadmin: Boolean(authData.esSuperadmin),
        esPropietario: Boolean(authData.esPropietario),
        rolCodigo: authData.rolCodigo,
        rolNombre: authData.rolNombre,
        nombreCompleto: authData.nombreCompleto,
        nroColegiatura: authData.nroColegiatura,
        pinSeguridad: authData.pinSeguridad,
        acciones: authData.acciones,
        sedeId: authData.sedeId,
        sedeNombre: authData.sedeNombre
      };

      // Si el usuario tiene sede asignada en la Master, se le asigna como activa
      if (authData.sedeId) {
        const sedeUser: Sede = {
          id: authData.sedeId,
          nombre: authData.sedeNombre || 'Sede Cajamarca Central',
          direccion: 'Av. Central 123, Cajamarca',
          activa: true
        };
        this.setSedeActiva(sedeUser, true);
      }

      // Guardar en localStorage
      localStorage.setItem('currentUser', JSON.stringify({ ...userResponse, loginAt: Date.now() }));
      localStorage.setItem('user_data', JSON.stringify(userResponse));
      localStorage.setItem('auth_token', authData.token);
      localStorage.setItem('saas_master_token', authData.token);
      localStorage.setItem('tenant_id', authData.tenantId);
      localStorage.setItem('subdominio', authData.subdominio);
      localStorage.setItem('active_role', assignedRole);

      // Actualizar señales reactivas
      this.currentUser.set(userResponse);
      this.activeRole.set(assignedRole);

      return { success: true, user: userResponse };
    } catch (error: any) {
      console.error('[AuthService] Error en login SaaS Master:', error);
      const msg = error?.message || 'Error de conexión con SaaS Master API.';
      return { success: false, message: msg };
    }
  }

  /**
   * Sobrecarga reactiva para compatibilidad con código existente que use Observable
   */
  login(credentialsOrEmail: any, password?: string): Observable<any> {
    let email = '';
    let pass = '';

    if (typeof credentialsOrEmail === 'string') {
      email = credentialsOrEmail;
      pass = password || '';
    } else if (credentialsOrEmail) {
      email = credentialsOrEmail.email || credentialsOrEmail.username || '';
      pass = credentialsOrEmail.password || '';
    }

    return from(this.loginAsync(email, pass)).pipe(
      map(res => {
        if (!res.success) {
          throw new Error(res.message || 'Error de autenticación');
        }
        return { success: true, data: res.user };
      })
    );
  }

  logout(redirectToLogin: boolean = true) {
    this.currentUser.set(null);
    this.activeSede.set(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('saas_master_token');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('subdominio');
    localStorage.removeItem('user_data');
    localStorage.removeItem('active_sede');
    localStorage.removeItem('active_role');

    if (redirectToLogin) {
      this.router.navigate(['/login']);
    }
  }

  get token(): string | null {
    return localStorage.getItem('auth_token');
  }
  
  get tenantId(): string {
    return localStorage.getItem('tenant_id') || environment.defaultTenantId;
  }

  sedesDisponibles = signal<Sede[]>([
    { id: '11111111-1111-1111-1111-111111111111', nombre: 'Sede Cajamarca Central', direccion: 'Av. Central 123, Cajamarca', activa: true }
  ]);

  getSedes(): Sede[] {
    const saved = localStorage.getItem('medicare_sedes_sucursales');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed = parsed.filter(s => 
            s.id !== '33333333-3333-3333-3333-333333333333' && 
            s.id !== '22222222-2222-2222-2222-222222222222' &&
            !s.nombre?.toLowerCase().includes('olivos') &&
            !s.nombre?.toLowerCase().includes('miraflores') &&
            !s.nombre?.toLowerCase().includes('lima centro')
          );
          if (parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return this.sedesDisponibles();
  }

  cargarSedesDesdeMaster(): Observable<Sede[]> {
    return this.http.get<{ success: boolean; data: Sede[] }>(`${environment.masterApiUrl}/sedes?tenantId=${this.tenantId}`).pipe(
      map(res => {
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          this.sedesDisponibles.set(res.data);
          localStorage.setItem('medicare_sedes_sucursales', JSON.stringify(res.data));
          return res.data;
        }
        return this.getSedes();
      }),
      catchError(() => of(this.getSedes()))
    );
  }

  guardarSedes(sedes: Sede[]) {
    this.sedesDisponibles.set(sedes);
    localStorage.setItem('medicare_sedes_sucursales', JSON.stringify(sedes));
    // Sincronizar en caliente con Master API
    this.http.put(`${environment.masterApiUrl}/sedes?tenantId=${this.tenantId}`, sedes).subscribe({
      error: (err) => console.warn('Aviso sincronizando sedes con Master:', err)
    });
  }

  agregarSede(nueva: { nombre: string; direccion: string }): Sede {
    const list = this.getSedes();
    const nuevaSede: Sede = {
      id: crypto.randomUUID(),
      nombre: nueva.nombre,
      direccion: nueva.direccion,
      activa: true
    };
    list.push(nuevaSede);
    this.guardarSedes(list);
    return nuevaSede;
  }

  puedeCambiarSede(): boolean {
    return this.activeRole() === 'ADMIN' || Boolean(this.currentUser()?.esSuperadmin);
  }

  setSedeActiva(sede: Sede, forzar: boolean = false) {
    // Si no es admin y ya cuenta con una sede activa, mantiene su sede fija
    if (!forzar && this.activeSede() && !this.puedeCambiarSede()) {
      console.warn('[AuthService] Permiso denegado: Solo el perfil Administrador puede cambiar de sede.');
      return;
    }
    this.activeSede.set(sede);
    localStorage.setItem('active_sede', JSON.stringify(sede));
  }

  private loadState() {
    const rawUser = localStorage.getItem('currentUser') || localStorage.getItem('user_data');
    const sedeData = localStorage.getItem('active_sede');
    const roleData = localStorage.getItem('active_role') as 'ADMIN' | 'QUIMICO' | 'CAJERO';

    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        // Expiración a 24 horas
        if (parsed.loginAt && (Date.now() - parsed.loginAt > this.SESSION_DURATION_MS)) {
          console.warn('Sesión expirada.');
          this.logout(false);
          return;
        }
        this.currentUser.set(parsed);
      } catch (e) {
        console.error('Error parseando usuario en localStorage:', e);
      }
    }

    const sedesList = this.getSedes();
    this.sedesDisponibles.set(sedesList);

    if (sedeData) {
      try {
        const parsedSede = JSON.parse(sedeData);
        const esMockup = parsedSede.nombre?.toLowerCase().includes('lima') || 
                         parsedSede.nombre?.toLowerCase().includes('miraflores') ||
                         parsedSede.nombre?.toLowerCase().includes('olivos');
        if (!esMockup && sedesList.some(s => s.id === parsedSede.id)) {
          this.activeSede.set(parsedSede);
        } else if (sedesList.length > 0) {
          this.setSedeActiva(sedesList[0], true);
        }
      } catch (e) {
        if (sedesList.length > 0) this.setSedeActiva(sedesList[0], true);
      }
    } else if (sedesList.length > 0) {
      this.setSedeActiva(sedesList[0], true);
    }

    // Sincronizar reactivamente sedes desde la Master
    this.cargarSedesDesdeMaster().subscribe(liveSedes => {
      const actual = this.activeSede();
      if (!actual || !liveSedes.some(s => s.id === actual.id)) {
        if (liveSedes.length > 0) this.setSedeActiva(liveSedes[0], true);
      }
    });

    if (roleData) {
      this.activeRole.set(roleData);
    }
  }
}
