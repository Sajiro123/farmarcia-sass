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

  private sedesDefault(): SedeDTO[] {
    return [
      {
        id: '11111111-1111-1111-1111-111111111111',
        nombre: 'Sede Cajamarca Central',
        direccion: 'Av. Central 123, Cajamarca',
        telefono: '076-361234',
        activa: true
      },
      {
        id: '45fca103-2669-48b8-8a1c-7e5380da5e1f',
        nombre: 'Sede Baños del Inca (Cajamarca 2)',
        direccion: 'Av. Manco Cápac 450, Baños del Inca, Cajamarca',
        telefono: '076-348899',
        activa: true
      }
    ];
  }

  listarSedes(): Observable<SedeDTO[]> {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('sucursales')
          .select('*')
          .eq('esta_activo', true)
          .order('es_principal', { ascending: false })
      ).pipe(
        map(res => {
          if (res.data && res.data.length > 0) {
            return res.data.map((s: any) => ({
              id: s.id,
              nombre: s.nombre,
              direccion: s.direccion || '',
              telefono: s.telefono || '',
              activa: s.esta_activo ?? true
            }));
          }
          return this.sedesDefault();
        }),
        catchError(() => of(this.sedesDefault()))
      );
    }

    return of(this.sedesDefault());
  }
}

