import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DecolectaRucResponse {
  razon_social: string;
  numero_documento: string;
  estado: string;
  condicion: string;
  direccion: string;
  ubigeo?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  es_agente_retencion?: boolean;
  es_buen_contribuyente?: boolean;
}

export interface DecolectaTipoCambioResponse {
  buy_price: string;
  sell_price: string;
  base_currency: string;
  quote_currency: string;
  date: string;
}

@Injectable({
  providedIn: 'root'
})
export class DecolectaService {
  private http = inject(HttpClient);

  private token = environment.decolectaToken || 'sk_19378.UWsZ39cBhh6HbrZlBmpURHd9SPniRJMC';

  private get baseUrl(): string {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return '/decolecta-api';
    }
    return environment.decolectaApiUrl || 'https://api.decolecta.com/v1';
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    });
  }

  consultarRuc(ruc: string): Observable<DecolectaRucResponse> {
    const doc = ruc ? ruc.trim() : '';
    const url = `${this.baseUrl}/sunat/ruc?numero=${doc}&token=${this.token}`;

    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      map(res => {
        if (!res || res.error) {
          throw new Error(res?.error || 'No se encontraron datos para el RUC ingresado.');
        }
        return res as DecolectaRucResponse;
      })
    );
  }

  consultarTipoCambio(): Observable<DecolectaTipoCambioResponse> {
    const url = `${this.baseUrl}/tipo-cambio/sunat?token=${this.token}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }
}
