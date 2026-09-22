import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UsuarioNegocioDTO {
  id?: string;
  negocioId?: string;
  negocioNombre?: string;
  email?: string;
  password?: string;
  pinSeguridad?: string;
  estaActivo: boolean;
  perfilCodigo?: string;
  perfilNombre?: string;
  acciones?: string[];
  tienePermisosPersonalizados?: boolean;
  tieneUsuario?: boolean;
  
  personaId?: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  nombreCompleto?: string;
  telefono?: string;
  direccion?: string;
  nroColegiatura?: string;
  sedeId?: string;
  sedeNombre?: string;
}

export interface PerfilDTO {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  esSistema: boolean;
  estaActivo: boolean;
}

export interface AccionDTO {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  descripcion: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private http = inject(HttpClient);
  private masterApiUrl = (environment.saasMasterApiUrl || 'http://localhost:8081/api/v1') + '/usuarios-negocio';

  get currentTenantId(): string {
    const tid = localStorage.getItem('tenant_id');
    if (!tid || tid === 'a0000000-0000-0000-0000-000000000002') {
      return environment.defaultTenantId || 'a0000000-0000-0000-0000-000000000001';
    }
    return tid;
  }

  listarUsuarios(negocioId?: string): Observable<UsuarioNegocioDTO[]> {
    const id = negocioId || this.currentTenantId;
    return this.http.get<any>(this.masterApiUrl, { params: { negocioId: id } }).pipe(
      map(res => {
        if (res && res.data && Array.isArray(res.data)) {
          return res.data.filter((u: any) => {
            const esMismoNegocio = !u.negocioId || u.negocioId === id;
            const noEsRestaurante = !u.perfilCodigo?.includes('RESTAURANTE') && 
                                    !u.perfilCodigo?.includes('MOZO') && 
                                    !u.perfilCodigo?.includes('COCIN') &&
                                    !u.email?.toLowerCase().includes('@willys.com');
            return esMismoNegocio && noEsRestaurante;
          });
        }
        return [];
      }),
      catchError(err => {
        console.error('Error al listar usuarios desde Master API:', err);
        return of([]);
      })
    );
  }

  crearPersonal(personal: UsuarioNegocioDTO): Observable<UsuarioNegocioDTO> {
    const payload = {
      ...personal,
      tieneUsuario: false,
      negocioId: personal.negocioId || this.currentTenantId
    };
    return this.http.post<any>(this.masterApiUrl, payload).pipe(
      map(res => (res && res.data) ? res.data : personal)
    );
  }

  crearUsuario(usuario: UsuarioNegocioDTO): Observable<UsuarioNegocioDTO> {
    const payload = {
      ...usuario,
      negocioId: usuario.negocioId || this.currentTenantId
    };
    return this.http.post<any>(this.masterApiUrl, payload).pipe(
      map(res => (res && res.data) ? res.data : usuario)
    );
  }

  actualizarUsuario(id: string, usuario: UsuarioNegocioDTO): Observable<UsuarioNegocioDTO> {
    const payload = {
      ...usuario,
      negocioId: usuario.negocioId || this.currentTenantId
    };
    return this.http.put<any>(`${this.masterApiUrl}/${id}`, payload).pipe(
      map(res => (res && res.data) ? res.data : usuario)
    );
  }

  actualizarAcciones(id: string, acciones: string[], restablecer: boolean = false): Observable<any> {
    return this.http.put<any>(`${this.masterApiUrl}/${id}/acciones`, { acciones, restablecer });
  }

  eliminarUsuario(id: string): Observable<any> {
    return this.http.delete<any>(`${this.masterApiUrl}/${id}`);
  }

  cambiarEstado(id: string, activo: boolean): Observable<any> {
    return this.http.patch<any>(`${this.masterApiUrl}/${id}/estado?activo=${activo}`, {});
  }

  listarPerfiles(negocioId?: string): Observable<PerfilDTO[]> {
    const id = negocioId || this.currentTenantId;
    return this.http.get<any>(`${this.masterApiUrl}/perfiles`, { params: { negocioId: id } }).pipe(
      map(res => {
        if (res && res.data && Array.isArray(res.data)) {
          return res.data.filter((p: any) => 
            !p.codigo?.includes('RESTAURANTE') && 
            !p.codigo?.includes('MOZO') && 
            !p.codigo?.includes('COCIN') &&
            !p.nombre?.toLowerCase().includes('restaurante')
          );
        }
        return [
          { id: '526dad94-4e52-42b2-b88e-fcb01975c9cd', codigo: 'ADMIN_NEGOCIO', nombre: 'Administrador de Farmacia', descripcion: 'Acceso total', esSistema: true, estaActivo: true },
          { id: '58020893-5c16-49d5-9eed-a20f5babb55a', codigo: 'QUIMICO_FARMACEUTICO', nombre: 'Director Técnico / Químico Farmacéutico', descripcion: 'DIGEMID y Recetas', esSistema: true, estaActivo: true },
          { id: 'eefaeef2-7d41-4c5c-880c-9138b45aeeff', codigo: 'CAJERO_VENDEDOR', nombre: 'Cajero / Dispensador', descripcion: 'POS y Atención', esSistema: true, estaActivo: true }
        ];
      }),
      catchError(() => of([
        { id: '526dad94-4e52-42b2-b88e-fcb01975c9cd', codigo: 'ADMIN_NEGOCIO', nombre: 'Administrador de Farmacia', descripcion: 'Acceso total', esSistema: true, estaActivo: true },
        { id: '58020893-5c16-49d5-9eed-a20f5babb55a', codigo: 'QUIMICO_FARMACEUTICO', nombre: 'Director Técnico / Químico Farmacéutico', descripcion: 'DIGEMID y Recetas', esSistema: true, estaActivo: true },
        { id: 'eefaeef2-7d41-4c5c-880c-9138b45aeeff', codigo: 'CAJERO_VENDEDOR', nombre: 'Cajero / Dispensador', descripcion: 'POS y Atención', esSistema: true, estaActivo: true }
      ]))
    );
  }

  listarAcciones(): Observable<AccionDTO[]> {
    return this.http.get<any>(`${this.masterApiUrl}/acciones`).pipe(
      map(res => (res && res.data) ? res.data : []),
      catchError(() => of([]))
    );
  }
}
