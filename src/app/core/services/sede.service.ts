import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Observable, from, of, map, catchError } from 'rxjs';

export interface SedeDTO {
  id: string;
  nombre: string;
  direccion: string;
  telefono?: string;
  activa: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SedeService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  private mockSedes: SedeDTO[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      nombre: 'Sede Cajamarca Central',
      direccion: 'Av. Central 123, Cajamarca',
      telefono: '987654321',
      activa: true
    }
  ];

  listarSedes(): Observable<SedeDTO[]> {
    // 1. Obtener sedes directamente de AuthService / localStorage (sincronizadas con SaaS Master)
    const sedesAuth = this.authService.getSedes();
    if (sedesAuth && sedesAuth.length > 0) {
      return of(sedesAuth.map(s => ({
        id: s.id,
        nombre: s.nombre,
        direccion: s.direccion || '',
        telefono: (s as any).telefono || '',
        activa: s.activa !== false
      })));
    }

    const client = this.supabase.client;
    if (!this.supabase.isConfigured || !client) {
      return of([...this.mockSedes]);
    }

    return from(
      client
        .from('sucursales')
        .select('*')
        .eq('esta_activo', true)
    ).pipe(
      map(res => {
        if (res.error || !res.data || res.data.length === 0) {
          return [...this.mockSedes];
        }
        return res.data.map((s: any) => ({
          id: s.id,
          nombre: s.nombre,
          direccion: s.direccion,
          telefono: s.telefono,
          activa: s.esta_activo ?? true
        }));
      }),
      catchError(() => of([...this.mockSedes]))
    );
  }
}

