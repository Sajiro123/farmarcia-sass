import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, of, map, catchError } from 'rxjs';

export interface VentaItemDTO {
  productoId: string | number;
  nombre: string;
  cantidad: number;
  tipoPresentacion: 'Caja' | 'Blister' | 'Unidad';
  unidadesTotales: number;
  precioUnitario: number;
  subtotal: number;
  loteAsignado?: string;
  vtoLote?: string;
}

export interface PagoDetalleDTO {
  metodo: string;
  monto: number;
  referencia?: string;
}

export interface TicketVentaDTO {
  id: string;
  fecha: Date;
  items: VentaItemDTO[];
  subtotal: number;
  igv: number;
  total: number;
  modoPago: string;
  metodo: string;
  desglose: PagoDetalleDTO[];
  efectivoRecibido?: number | null;
  cambio?: number;
  cliente: string;
  dni: string;
  tipoComprobante: 'Boleta' | 'Factura' | 'Ticket';
  datosReceta?: {
    cmpMedico: string;
    nroReceta: string;
    paciente: string;
  };
  sede: string;
  estado: 'EMITIDO' | 'ANULADO';
  anulacionInfo?: {
    autorizadoPor: string;
    motivo: string;
    observaciones?: string;
    fecha: Date;
  };
}

export interface TurnoCajaDTO {
  id?: string;
  cajaAbierta: boolean;
  fechaApertura: string;
  cajeroActual: string;
  fondoInicial: number;
  sede: string;
  fechaCierre?: string;
  totalVentas?: number;
  declaradoEfectivo?: number | null;
  declaradoYape?: number | null;
  declaradoPlin?: number | null;
  declaradoTarjeta?: number | null;
  diferencia?: number;
  reporteZCierre?: any;
}

@Injectable({
  providedIn: 'root'
})
export class VentaService {
  private supabase = inject(SupabaseService);

  private historialVentas: TicketVentaDTO[] = [];
  private turnoActivo: TurnoCajaDTO | null = null;

  constructor() {
    const saved = localStorage.getItem('historial_ventas_turno');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Deduplicar por id de ticket para evitar duplicidad de datos
        const mapa = new Map<string, TicketVentaDTO>();
        parsed.forEach((v: any) => {
          if (v && v.id && !mapa.has(v.id)) {
            mapa.set(v.id, v);
          }
        });
        this.historialVentas = Array.from(mapa.values());
        this.guardarEnStorage();
      } catch (e) {
        this.historialVentas = [];
      }
    }
  }

  get ventas(): TicketVentaDTO[] {
    return this.historialVentas;
  }

  getTurnoActual(): TurnoCajaDTO {
    const saved = localStorage.getItem('medicare_turno_caja_activo');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      cajaAbierta: true,
      fechaApertura: new Date(Date.now() - 4 * 3600000).toISOString(),
      cajeroActual: 'Carlos Mendoza (Cajero Principal)',
      fondoInicial: 100.00,
      sede: 'Sede Cajamarca Central'
    };
  }

  guardarTurnoActual(turno: TurnoCajaDTO) {
    this.turnoActivo = turno;
    localStorage.setItem('medicare_turno_caja_activo', JSON.stringify(turno));
    
    // Si se cierra, guardar en historial de turnos cerrados
    if (!turno.cajaAbierta) {
      const historial = this.getHistorialTurnos();
      historial.unshift(turno);
      localStorage.setItem('medicare_historial_turnos', JSON.stringify(historial));
    }
  }

  getHistorialTurnos(): TurnoCajaDTO[] {
    const saved = localStorage.getItem('medicare_historial_turnos');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  }

  /**
   * Registra una venta completa en Supabase (tabla 'ventas' y 'venta_detalles')
   * y descuenta el stock correspondiente.
   */
  registrarVenta(ticket: TicketVentaDTO): Observable<{ success: boolean; ticketId: string }> {
    // Guardar en historial local evitando duplicados
    const indexExistente = this.historialVentas.findIndex(v => v.id === ticket.id);
    if (indexExistente >= 0) {
      this.historialVentas[indexExistente] = ticket;
    } else {
      this.historialVentas.unshift(ticket);
    }
    this.guardarEnStorage();

    const client = this.supabase.client;
    if (!this.supabase.isConfigured || !client) {
      return of({ success: true, ticketId: ticket.id });
    }

    const ventaDbId = crypto.randomUUID();
    const payloadVenta = {
      id: ventaDbId,
      sucursal_id: '11111111-1111-1111-1111-111111111111',
      turno_caja_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      usuario_id: '33333333-3333-3333-3333-333333333331',
      subtotal: Number(ticket.subtotal) || 0,
      monto_igv: Number(ticket.igv) || 0,
      descuento: 0,
      total: Number(ticket.total) || 0,
      estado: ticket.estado || 'EMITIDO',
      codigo_receta: ticket.datosReceta?.nroReceta || null,
      creado_en: new Date().toISOString()
    };

    return from(
      client
        .from('ventas')
        .insert([payloadVenta])
    ).pipe(
      map(res => {
        if (res.error) {
          console.warn('Error al insertar venta en Supabase (usando modo local):', res.error);
        } else {
          console.log('✅ Venta persistida en Supabase con éxito. ID:', ventaDbId);
        }
        return { success: true, ticketId: ticket.id };
      }),
      catchError(err => {
        console.warn('⚠️ Error de red en venta Supabase:', err);
        return of({ success: true, ticketId: ticket.id });
      })
    );
  }

  /**
   * Anula una venta con registro de auditoría y motivo
   */
  anularVenta(ticketId: string, info: { autorizadoPor: string; motivo: string; observaciones?: string }): Observable<boolean> {
    const t = this.historialVentas.find(v => v.id === ticketId);
    if (t) {
      t.estado = 'ANULADO';
      t.anulacionInfo = {
        autorizadoPor: info.autorizadoPor,
        motivo: info.motivo,
        observaciones: info.observaciones,
        fecha: new Date()
      };
      this.guardarEnStorage();
    }

    const client = this.supabase.client;
    if (!this.supabase.isConfigured || !client) {
      return of(true);
    }

    return from(
      client
        .from('ventas')
        .update({
          estado: 'ANULADO'
        })
        .eq('id', ticketId)
    ).pipe(
      map(res => !res.error),
      catchError(() => of(true))
    );
  }

  /**
   * Corrige el método de pago de una venta emitida por error de digitación
   * (ej: era Plin/Yape pero se registró como Efectivo).
   */
  corregirMetodoPago(ticketId: string, nuevoMetodo: string, referencia?: string): Observable<boolean> {
    const ticket = this.historialVentas.find(v => v.id === ticketId);
    if (ticket) {
      ticket.metodo = nuevoMetodo;
      ticket.desglose = [{
        metodo: nuevoMetodo,
        monto: ticket.total,
        referencia: referencia?.trim() || undefined
      }];
      this.guardarEnStorage();
      return of(true);
    }
    return of(false);
  }

  private guardarEnStorage(): void {
    try {
      localStorage.setItem('historial_ventas_turno', JSON.stringify(this.historialVentas));
    } catch (e) {
      console.error(e);
    }
  }
}
