export interface AuthResponse {
  token: string;
  usuarioId: string;
  email: string;
  tenantId: string;
  subdominio: string;
  nombreComercial: string;
  verticalId: string;
  esSuperadmin: boolean;
}

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  activa: boolean;
}
