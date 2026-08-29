import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthResponse, Sede } from '../models/auth.model';
import { Observable, tap, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.masterApiUrl + '/auth';
  
  // Señales reactivas de Angular 22
  currentUser = signal<AuthResponse | null>(null);
  activeSede = signal<Sede | null>(null);
  activeRole = signal<'ADMIN' | 'QUIMICO' | 'CAJERO'>('ADMIN');

  constructor(private http: HttpClient) {
    this.loadState();
  }

  setRole(role: 'ADMIN' | 'QUIMICO' | 'CAJERO') {
    this.activeRole.set(role);
    localStorage.setItem('active_role', role);
  }

  getUserDisplayName(): string {
    const role = this.activeRole();
    if (role === 'ADMIN') return 'Carlos Mendoza (Administrador)';
    if (role === 'QUIMICO') return 'Dra. Elena Ramos (Químico Farmacéutico)';
    return 'Juan Pérez (Cajero de Turno)';
  }

  getUserRoleTitle(): string {
    const role = this.activeRole();
    if (role === 'ADMIN') return 'ADMINISTRADOR GENERAL';
    if (role === 'QUIMICO') return 'QUÍMICO FARMACÉUTICO (CQFP 14820)';
    return 'CAJERO / DISPENSADOR';
  }

  login(credentials: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
      tap((res: any) => {
        if(res.data) {
          const authData = res.data;
          this.currentUser.set(authData);
          localStorage.setItem('auth_token', authData.token);
          localStorage.setItem('tenant_id', authData.tenantId);
          localStorage.setItem('user_data', JSON.stringify(authData));
        }
      })
    );
  }

  logout() {
    this.currentUser.set(null);
    this.activeSede.set(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('user_data');
    localStorage.removeItem('active_sede');
    localStorage.removeItem('active_role');
  }

  get token(): string | null {
    return localStorage.getItem('auth_token');
  }
  
  get tenantId(): string {
    return localStorage.getItem('tenant_id') || environment.defaultTenantId;
  }

  setSedeActiva(sede: Sede) {
    this.activeSede.set(sede);
    localStorage.setItem('active_sede', JSON.stringify(sede));
  }

  private loadState() {
    const userData = localStorage.getItem('user_data');
    const sedeData = localStorage.getItem('active_sede');
    const roleData = localStorage.getItem('active_role') as 'ADMIN' | 'QUIMICO' | 'CAJERO';
    if (userData) this.currentUser.set(JSON.parse(userData));
    if (sedeData) this.activeSede.set(JSON.parse(sedeData));
    if (roleData) this.activeRole.set(roleData);
  }
}
