import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';

export interface UsuarioNegocioDTO {
  id?: string;
  negocioId?: string;
  negocioNombre?: string;
  email: string;
  password?: string;
  pinSeguridad?: string;
  estaActivo: boolean;
  perfilCodigo: string;
  perfilNombre?: string;
  acciones?: string[];
  
  personaId?: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  nombreCompleto?: string;
  telefono?: string;
  direccion?: string;
  nroColegiatura?: string;
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
  private masterApiUrl = 'http://localhost:8081/api/v1/usuarios-negocio';

  // 9 usuarios de prueba iniciales (3 por perfil)
  public mockUsuarios: UsuarioNegocioDTO[] = [
    // 1. ADMINISTRADORES
    {
      id: 'f4a94356-bd22-4804-bcac-7e3963de3769',
      email: 'admin@medicare.com',
      pinSeguridad: '1234',
      estaActivo: true,
      perfilCodigo: 'ADMIN_NEGOCIO',
      perfilNombre: 'Administrador de Farmacia',
      tipoDocumento: 'DNI',
      numeroDocumento: '45892018',
      nombres: 'Carlos Alberto',
      apellidos: 'Mendoza Ramos',
      nombreCompleto: 'Carlos Alberto Mendoza Ramos',
      telefono: '987654321',
      direccion: 'Av. Central 123, Lima',
      acciones: ['POS_VENTA_CREAR', 'POS_TICKET_ANULAR', 'POS_ARQUEO_CERRAR', 'POS_RECETA_VALIDAR', 'INVENTARIO_FEFO_VER', 'INVENTARIO_BAJAS_EMITIR', 'COMPRAS_FACTURA_REGISTRAR', 'COMPRAS_REORDEN_PPR', 'COMPRAS_CXP_ADMIN', 'DASHBOARD_KPI_FINANZAS', 'USUARIOS_ADMINISTRAR']
    },
    {
      id: '9e2cbf35-4b50-4d08-a52c-223bea25f171',
      email: 'admin2@medicare.com',
      pinSeguridad: '1234',
      estaActivo: true,
      perfilCodigo: 'ADMIN_NEGOCIO',
      perfilNombre: 'Administrador de Farmacia',
      tipoDocumento: 'DNI',
      numeroDocumento: '47812903',
      nombres: 'Mariana Lucía',
      apellidos: 'Vega Campos',
      nombreCompleto: 'Mariana Lucía Vega Campos',
      telefono: '981234567',
      direccion: 'Calle Los Pinos 402, San Isidro',
      acciones: ['POS_VENTA_CREAR', 'POS_TICKET_ANULAR', 'POS_ARQUEO_CERRAR', 'POS_RECETA_VALIDAR', 'INVENTARIO_FEFO_VER', 'INVENTARIO_BAJAS_EMITIR', 'COMPRAS_FACTURA_REGISTRAR', 'COMPRAS_REORDEN_PPR', 'COMPRAS_CXP_ADMIN', 'DASHBOARD_KPI_FINANZAS', 'USUARIOS_ADMINISTRAR']
    },
    {
      id: 'd1050170-94a1-4bc4-943e-27c23f14a7e3',
      email: 'supervisor@medicare.com',
      pinSeguridad: '9999',
      estaActivo: true,
      perfilCodigo: 'ADMIN_NEGOCIO',
      perfilNombre: 'Administrador de Farmacia',
      tipoDocumento: 'DNI',
      numeroDocumento: '40918234',
      nombres: 'Roberto Carlos',
      apellidos: 'Gutiérrez Paredes',
      nombreCompleto: 'Roberto Carlos Gutiérrez Paredes',
      telefono: '984567123',
      direccion: 'Av. Arequipa 2500, Lince',
      acciones: ['POS_VENTA_CREAR', 'POS_TICKET_ANULAR', 'POS_ARQUEO_CERRAR', 'POS_RECETA_VALIDAR', 'INVENTARIO_FEFO_VER', 'INVENTARIO_BAJAS_EMITIR', 'COMPRAS_FACTURA_REGISTRAR', 'COMPRAS_REORDEN_PPR', 'COMPRAS_CXP_ADMIN', 'DASHBOARD_KPI_FINANZAS', 'USUARIOS_ADMINISTRAR']
    },

    // 2. QUÍMICOS FARMACÉUTICOS
    {
      id: '657a7055-cef9-4aba-9fbb-0e373453a58c',
      email: 'quimico@medicare.com',
      pinSeguridad: '1234',
      estaActivo: true,
      perfilCodigo: 'QUIMICO_FARMACEUTICO',
      perfilNombre: 'Director Técnico / Químico Farmacéutico',
      tipoDocumento: 'DNI',
      numeroDocumento: '41908234',
      nombres: 'Elena',
      apellidos: 'Ramos Salazar',
      nombreCompleto: 'Elena Ramos Salazar',
      nroColegiatura: 'CQFP 14820',
      telefono: '976543210',
      direccion: 'Av. Larco 450, Miraflores',
      acciones: ['POS_VENTA_CREAR', 'POS_TICKET_ANULAR', 'POS_RECETA_VALIDAR', 'INVENTARIO_FEFO_VER', 'INVENTARIO_BAJAS_EMITIR', 'COMPRAS_REORDEN_PPR']
    },
    {
      id: '49b4ee9e-e1ff-4c0f-bb59-4ed9fbce548a',
      email: 'quimico2@medicare.com',
      pinSeguridad: '5678',
      estaActivo: true,
      perfilCodigo: 'QUIMICO_FARMACEUTICO',
      perfilNombre: 'Director Técnico / Químico Farmacéutico',
      tipoDocumento: 'DNI',
      numeroDocumento: '43819201',
      nombres: 'Miguel Ángel',
      apellidos: 'Torres Huamán',
      nombreCompleto: 'Miguel Ángel Torres Huamán',
      nroColegiatura: 'CQFP 18450',
      telefono: '971234567',
      direccion: 'Av. Universitaria 1120, San Miguel',
      acciones: ['POS_VENTA_CREAR', 'POS_TICKET_ANULAR', 'POS_RECETA_VALIDAR', 'INVENTARIO_FEFO_VER', 'INVENTARIO_BAJAS_EMITIR', 'COMPRAS_REORDEN_PPR']
    },
    {
      id: '5f6c8332-ac6e-43d7-a309-50d762ca427f',
      email: 'quimico3@medicare.com',
      pinSeguridad: '4321',
      estaActivo: true,
      perfilCodigo: 'QUIMICO_FARMACEUTICO',
      perfilNombre: 'Director Técnico / Químico Farmacéutico',
      tipoDocumento: 'DNI',
      numeroDocumento: '46192834',
      nombres: 'Patricia Sofía',
      apellidos: 'Benítez Luna',
      nombreCompleto: 'Patricia Sofía Benítez Luna',
      nroColegiatura: 'CQFP 21900',
      telefono: '973456789',
      direccion: 'Jr. Huancayo 312, Jesús María',
      acciones: ['POS_VENTA_CREAR', 'POS_TICKET_ANULAR', 'POS_RECETA_VALIDAR', 'INVENTARIO_FEFO_VER', 'INVENTARIO_BAJAS_EMITIR', 'COMPRAS_REORDEN_PPR']
    },

    // 3. CAJEROS / DISPENSADORES
    {
      id: '59e8488b-2923-4c48-a434-316a32f9dcb7',
      email: 'cajero@medicare.com',
      pinSeguridad: '0000',
      estaActivo: true,
      perfilCodigo: 'CAJERO_VENDEDOR',
      perfilNombre: 'Cajero / Dispensador',
      tipoDocumento: 'DNI',
      numeroDocumento: '70982314',
      nombres: 'Juan Carlos',
      apellidos: 'Pérez Gómez',
      nombreCompleto: 'Juan Carlos Pérez Gómez',
      telefono: '965432109',
      direccion: 'Jr. Huancavelica 820, Lima',
      acciones: ['POS_VENTA_CREAR', 'POS_ARQUEO_CERRAR', 'INVENTARIO_FEFO_VER']
    },
    {
      id: '20e611c6-1314-4a90-8020-60b68e0bb363',
      email: 'cajero2@medicare.com',
      pinSeguridad: '0000',
      estaActivo: true,
      perfilCodigo: 'CAJERO_VENDEDOR',
      perfilNombre: 'Cajero / Dispensador',
      tipoDocumento: 'DNI',
      numeroDocumento: '72198345',
      nombres: 'Rosa María',
      apellidos: 'Quispe Flores',
      nombreCompleto: 'Rosa María Quispe Flores',
      telefono: '961234890',
      direccion: 'Av. Brasil 1420, Pueblo Libre',
      acciones: ['POS_VENTA_CREAR', 'POS_ARQUEO_CERRAR', 'INVENTARIO_FEFO_VER']
    },
    {
      id: '86ca687b-7fb3-4f60-8bf1-baf46574864e',
      email: 'cajero3@medicare.com',
      pinSeguridad: '0000',
      estaActivo: true,
      perfilCodigo: 'CAJERO_VENDEDOR',
      perfilNombre: 'Cajero / Dispensador',
      tipoDocumento: 'DNI',
      numeroDocumento: '75491023',
      nombres: 'Luis Alberto',
      apellidos: 'Morales Castillo',
      nombreCompleto: 'Luis Alberto Morales Castillo',
      telefono: '969871234',
      direccion: 'Av. Colonial 890, Callao',
      acciones: ['POS_VENTA_CREAR', 'POS_ARQUEO_CERRAR', 'INVENTARIO_FEFO_VER']
    }
  ];

  listarUsuarios(): Observable<UsuarioNegocioDTO[]> {
    return this.http.get<any>(this.masterApiUrl).pipe(
      map(res => (res && res.data && Array.isArray(res.data) && res.data.length > 0) ? res.data : this.mockUsuarios),
      catchError(() => of(this.mockUsuarios))
    );
  }

  crearUsuario(usuario: UsuarioNegocioDTO): Observable<UsuarioNegocioDTO> {
    return this.http.post<any>(this.masterApiUrl, usuario).pipe(
      map(res => (res && res.data) ? res.data : usuario),
      catchError(() => {
        usuario.id = 'usr-' + Date.now();
        usuario.nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`;
        this.mockUsuarios.unshift(usuario);
        return of(usuario);
      })
    );
  }

  actualizarUsuario(id: string, usuario: UsuarioNegocioDTO): Observable<UsuarioNegocioDTO> {
    return this.http.put<any>(`${this.masterApiUrl}/${id}`, usuario).pipe(
      map(res => (res && res.data) ? res.data : usuario),
      catchError(() => {
        const idx = this.mockUsuarios.findIndex(u => u.id === id);
        if (idx !== -1) {
          this.mockUsuarios[idx] = { ...this.mockUsuarios[idx], ...usuario };
          this.mockUsuarios[idx].nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`;
        }
        return of(usuario);
      })
    );
  }

  eliminarUsuario(id: string): Observable<any> {
    return this.http.delete<any>(`${this.masterApiUrl}/${id}`).pipe(
      catchError(() => {
        const idx = this.mockUsuarios.findIndex(u => u.id === id);
        if (idx !== -1) {
          this.mockUsuarios.splice(idx, 1);
        }
        return of(true);
      })
    );
  }

  cambiarEstado(id: string, activo: boolean): Observable<any> {
    return this.http.patch<any>(`${this.masterApiUrl}/${id}/estado?activo=${activo}`, {}).pipe(
      catchError(() => {
        const u = this.mockUsuarios.find(x => x.id === id);
        if (u) u.estaActivo = activo;
        return of(true);
      })
    );
  }

  listarPerfiles(): Observable<PerfilDTO[]> {
    return this.http.get<any>(`${this.masterApiUrl}/perfiles`).pipe(
      map(res => (res && res.data) ? res.data : [
        { id: '1', codigo: 'ADMIN_NEGOCIO', nombre: 'Administrador de Farmacia', descripcion: 'Acceso total', esSistema: true, estaActivo: true },
        { id: '2', codigo: 'QUIMICO_FARMACEUTICO', nombre: 'Químico Farmacéutico (Director Técnico)', descripcion: 'DIGEMID y Recetas', esSistema: true, estaActivo: true },
        { id: '3', codigo: 'CAJERO_VENDEDOR', nombre: 'Cajero / Dispensador', descripcion: 'POS y Atención', esSistema: true, estaActivo: true }
      ]),
      catchError(() => of([
        { id: '1', codigo: 'ADMIN_NEGOCIO', nombre: 'Administrador de Farmacia', descripcion: 'Acceso total', esSistema: true, estaActivo: true },
        { id: '2', codigo: 'QUIMICO_FARMACEUTICO', nombre: 'Químico Farmacéutico (Director Técnico)', descripcion: 'DIGEMID y Recetas', esSistema: true, estaActivo: true },
        { id: '3', codigo: 'CAJERO_VENDEDOR', nombre: 'Cajero / Dispensador', descripcion: 'POS y Atención', esSistema: true, estaActivo: true }
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
