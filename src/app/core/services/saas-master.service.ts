import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SaasAuthData {
  token: string;
  tipoToken: string;
  usuarioId: string;
  email: string;
  tenantId: string;
  subdominio: string;
  nombreComercial: string;
  verticalId: string;
  planId: string;
  esPropietario: boolean;
  esSuperadmin: boolean;
  dbHost: string;
  rolCodigo: string;
  rolNombre: string;
  nombreCompleto: string;
  nroColegiatura?: string | null;
  pinSeguridad?: string;
  acciones: string[];
  sedeId?: string;
  sedeNombre?: string;
}

export interface SaasApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SaasMasterService {
  private readonly apiUrl = environment.saasMasterApiUrl || 'https://saas-master-api.onrender.com/api/v1';
  public readonly tenantId = environment.defaultTenantId || 'a0000000-0000-0000-0000-000000000001';
  public readonly defaultDomain = environment.defaultEmailDomain || '@medicare.com';

  constructor(private http: HttpClient) {}

  /**
   * Resuelve el email a partir de un username o email
   * Ej: 'admin' -> 'admin@medicare.com'
   */
  public resolveEmail(identifier: string): string {
    const trimmed = (identifier || '').trim();
    if (!trimmed) return '';
    if (trimmed.includes('@')) {
      return trimmed.toLowerCase();
    }
    return `${trimmed}${this.defaultDomain}`.toLowerCase();
  }

  /**
   * Autenticación central en SaaS Master API
   */
  async login(usernameOrEmail: string, password: string): Promise<SaasApiResponse<SaasAuthData>> {
    const email = this.resolveEmail(usernameOrEmail);

    try {
      const response = await firstValueFrom(
        this.http.post<SaasApiResponse<SaasAuthData>>(`${this.apiUrl}/auth/login`, {
          email,
          password
        })
      );
      return response;
    } catch (error: any) {
      console.error('[SaasMasterService] Error de login:', error);
      const msg = error?.error?.message || error?.message || 'Error al conectar con SaaS Master API';
      throw new Error(msg);
    }
  }

  /**
   * Consultar estado y plan del negocio (Tenant)
   */
  async getTenantBySubdomain(subdominio: string): Promise<any | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<SaasApiResponse<any>>(`${this.apiUrl}/tenants/subdomain/${subdominio}`)
      );
      return res.data || null;
    } catch (error) {
      console.warn('[SaasMasterService] No se pudo verificar estado del tenant en SaaS Master:', error);
      return null;
    }
  }
}
