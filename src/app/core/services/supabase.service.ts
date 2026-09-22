import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private _supabase: SupabaseClient | null = null;
  private _url: string;
  private _anonKey: string;

  constructor() {
    // Permite sobreescribir desde localStorage si el usuario configuró sus claves en la UI
    this._url = localStorage.getItem('supabase_url') || environment.supabaseUrl;
    this._anonKey = localStorage.getItem('supabase_anon_key') || environment.supabaseAnonKey;
    this.initClient();
  }

  private initClient(): void {
    try {
      if (this._url && this._anonKey) {
        this._supabase = createClient(this._url, this._anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true
          }
        });
      }
    } catch (e) {
      console.warn('⚠️ No se pudo inicializar el cliente de Supabase:', e);
      this._supabase = null;
    }
  }

  get client(): SupabaseClient | null {
    return this._supabase;
  }

  get isConfigured(): boolean {
    return !!this._supabase && !this._anonKey.includes('PLACEHOLDER');
  }

  updateCredentials(url: string, anonKey: string): void {
    this._url = url;
    this._anonKey = anonKey;
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_anon_key', anonKey);
    this.initClient();
  }

  get currentTenantId(): string {
    return localStorage.getItem('tenant_id') || environment.defaultTenantId;
  }
}
