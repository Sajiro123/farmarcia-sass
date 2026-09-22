export interface AuthResponse {
  token: string;
  tipoToken?: string;
  usuarioId: string;
  email: string;
  tenantId: string;
  subdominio: string;
  nombreComercial: string;
  verticalId: string;
  planId?: string;
  esSuperadmin: boolean;
  esPropietario?: boolean;
  rolCodigo?: string;
  rolNombre?: string;
  nombreCompleto?: string;
  nroColegiatura?: string | null;
  pinSeguridad?: string;
  acciones?: string[];
  sedeId?: string;
  sedeNombre?: string;
}

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  activa: boolean;
}
