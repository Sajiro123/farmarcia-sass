import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, of, map, catchError, timeout } from 'rxjs';

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
  dbId?: string;
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
  sedeId?: string;
  sede: string;
  cajero?: string;
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
  sedeId?: string;
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
  reabierta?: boolean;
  motivoReapertura?: string;
  fechaReapertura?: string;
  autorizadoReapertura?: string;
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

  private toIsoDate(dStr: string | Date | undefined): string {
    if (!dStr) return '';
    try {
      const dt = typeof dStr === 'string' ? new Date(dStr) : dStr;
      return dt.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
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

  /**
   * Obtiene la apertura registrada para una fecha (regla: solo 1 apertura por día)
   */
  getAperturaDelDia(fechaIso?: string): TurnoCajaDTO | null {
    const fecha = fechaIso || new Date().toISOString().split('T')[0];
    const actual = this.getTurnoActual();
    if (actual && this.toIsoDate(actual.fechaApertura) === fecha) {
      return actual;
    }
    const historial = this.getHistorialTurnos();
    const encontrado = historial.find(t => this.toIsoDate(t.fechaApertura) === fecha);
    return encontrado || null;
  }

  guardarTurnoActual(turno: TurnoCajaDTO) {
    this.turnoActivo = turno;
    localStorage.setItem('medicare_turno_caja_activo', JSON.stringify(turno));

    // Regla de negocio: solo una apertura por día en el historial
    const fechaTurno = this.toIsoDate(turno.fechaApertura);
    const historial = this.getHistorialTurnos();
    const index = historial.findIndex(t => 
      (turno.id && t.id && t.id === turno.id) ||
      this.toIsoDate(t.fechaApertura) === fechaTurno
    );

    if (index >= 0) {
      historial[index] = { ...turno };
    } else {
      historial.unshift({ ...turno });
    }
    localStorage.setItem('medicare_historial_turnos', JSON.stringify(historial));
  }

  /**
   * Reabre la caja actual cerrada (para cumplir con la regla de 1 sola apertura por día)
   */
  reabrirCaja(motivo: string = 'Continuación de operaciones de la jornada', autorizadoPor: string = 'Supervisor'): TurnoCajaDTO {
    const turno = this.getTurnoActual();
    turno.cajaAbierta = true;
    turno.reabierta = true;
    turno.fechaReapertura = new Date().toISOString();
    turno.motivoReapertura = motivo;
    turno.autorizadoReapertura = autorizadoPor;
    delete turno.fechaCierre;

    this.guardarTurnoActual(turno);
    return turno;
  }

  /**
   * Reabre un turno específico por ID o fecha (desde el módulo de Reportes)
   */
  reabrirTurnoPorIdOFecha(idOFecha: string, motivo: string = 'Reapertura autorizada', autorizadoPor: string = 'Supervisor'): TurnoCajaDTO | null {
    const fechaBuscada = idOFecha.includes('T') ? idOFecha.split('T')[0] : (idOFecha.includes('-') && idOFecha.length === 10 ? idOFecha : '');
    
    // Verificar si es el turno actual
    let turnoActual = this.getTurnoActual();
    const coincideActual = (turnoActual.id && turnoActual.id === idOFecha) ||
                           (fechaBuscada && this.toIsoDate(turnoActual.fechaApertura) === fechaBuscada) ||
                           turnoActual.fechaApertura === idOFecha;

    if (coincideActual) {
      return this.reabrirCaja(motivo, autorizadoPor);
    }

    // Si está en el historial
    const historial = this.getHistorialTurnos();
    const index = historial.findIndex(t => 
      (t.id && t.id === idOFecha) ||
      (fechaBuscada && this.toIsoDate(t.fechaApertura) === fechaBuscada) ||
      t.fechaApertura === idOFecha
    );

    if (index >= 0) {
      const turno = historial[index];
      turno.cajaAbierta = true;
      turno.reabierta = true;
      turno.fechaReapertura = new Date().toISOString();
      turno.motivoReapertura = motivo;
      turno.autorizadoReapertura = autorizadoPor;
      delete turno.fechaCierre;

      // Si corresponde al día de hoy, hacerlo además el turno activo
      const hoyIso = new Date().toISOString().split('T')[0];
      if (this.toIsoDate(turno.fechaApertura) === hoyIso) {
        this.guardarTurnoActual(turno);
      } else {
        historial[index] = turno;
        localStorage.setItem('medicare_historial_turnos', JSON.stringify(historial));
      }
      return turno;
    }

    return null;
  }

  getHistorialTurnos(): TurnoCajaDTO[] {
    const saved = localStorage.getItem('medicare_historial_turnos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }

    const d1 = new Date(); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(); d2.setDate(d2.getDate() - 2);
    const d3 = new Date(); d3.setDate(d3.getDate() - 3);

    return [
      {
        id: 'TURNO-20260923-01',
        cajaAbierta: false,
        fechaApertura: new Date(new Date(d1).setHours(8, 0, 0, 0)).toISOString(),
        fechaCierre: new Date(new Date(d1).setHours(20, 30, 0, 0)).toISOString(),
        cajeroActual: 'Carlos Mendoza (Cajero Principal)',
        fondoInicial: 150.00,
        sede: 'Sede Cajamarca Central',
        totalVentas: 640.50,
        declaradoEfectivo: 320.00,
        declaradoYape: 210.50,
        declaradoPlin: 50.00,
        declaradoTarjeta: 60.00,
        diferencia: 0.00
      },
      {
        id: 'TURNO-20260922-01',
        cajaAbierta: false,
        fechaApertura: new Date(new Date(d2).setHours(8, 15, 0, 0)).toISOString(),
        fechaCierre: new Date(new Date(d2).setHours(21, 0, 0, 0)).toISOString(),
        cajeroActual: 'Lic. Ana Panta (Farmacéutica Titular)',
        fondoInicial: 100.00,
        sede: 'Sede Cajamarca Central',
        totalVentas: 890.20,
        declaradoEfectivo: 450.00,
        declaradoYape: 310.20,
        declaradoPlin: 80.00,
        declaradoTarjeta: 50.00,
        diferencia: 0.00
      },
      {
        id: 'TURNO-20260921-01',
        cajaAbierta: false,
        fechaApertura: new Date(new Date(d3).setHours(7, 45, 0, 0)).toISOString(),
        fechaCierre: new Date(new Date(d3).setHours(20, 0, 0, 0)).toISOString(),
        cajeroActual: 'Dr. Roberto Sánchez (Director Técnico)',
        fondoInicial: 120.00,
        sede: 'Sede Cajamarca Central',
        totalVentas: 520.00,
        declaradoEfectivo: 300.00,
        declaradoYape: 150.00,
        declaradoPlin: 40.00,
        declaradoTarjeta: 30.00,
        diferencia: 0.00
      }
    ];
  }

  /**
   * Consulta las ventas consolidadas en Supabase por rango de fechas (y sucursal opcional).
   * Ejecuta: SELECT * FROM ventas ... WHERE creado_en BETWEEN fechaInicio AND fechaFin
   * uniendo con sucursales, usuarios, clientes, pagos_venta y detalle_ventas.
   */
  consultarVentasSupabase(fechaInicio?: string, fechaFin?: string, sucursalId?: string): Observable<TicketVentaDTO[]> {
    const client = this.supabase.client;
    if (!this.supabase.isConfigured || !client) {
      return of(this.filtrarVentasLocales(fechaInicio, fechaFin));
    }

    let query = client
      .from('ventas')
      .select(`
        id, subtotal, monto_igv, descuento, total, estado, creado_en, codigo_receta,
        sucursales (id, nombre, direccion),
        usuarios (id, nombre_completo, nombre_usuario),
        clientes (id, nombre_razon_social, numero_documento),
        pagos_venta (id, metodo_pago, monto, codigo_operacion),
        detalle_ventas (
          id, cantidad, precio_unitario, subtotal, total, es_fraccion,
          productos (id, nombre_comercial, nombre_generico)
        )
      `)
      .order('creado_en', { ascending: false });

    if (fechaInicio) {
      query = query.gte('creado_en', `${fechaInicio}T00:00:00.000Z`);
    }
    if (fechaFin) {
      query = query.lte('creado_en', `${fechaFin}T23:59:59.999Z`);
    }
    if (sucursalId && sucursalId !== 'TODAS') {
      query = query.eq('sucursal_id', sucursalId);
    }

    return from(query).pipe(
      timeout(12000),
      map(res => {
        if (res.error) {
          console.warn('Error al consultar ventas en Supabase:', res.error);
          return this.filtrarVentasLocales(fechaInicio, fechaFin);
        }

        const tickets: TicketVentaDTO[] = (res.data || []).map((v: any) => {
          const desglose: PagoDetalleDTO[] = (v.pagos_venta || []).map((p: any) => {
            const rawMetodo = (p.metodo_pago || 'EFECTIVO').toUpperCase();
            let label = 'Efectivo';
            if (rawMetodo.includes('YAPE')) label = 'Yape';
            else if (rawMetodo.includes('PLIN')) label = 'Plin';
            else if (rawMetodo.includes('TARJETA') || rawMetodo.includes('VISA')) label = 'Tarjeta';
            else if (rawMetodo.includes('TRANS')) label = 'Transferencia';

            return {
              metodo: label,
              monto: Number(p.monto) || 0,
              referencia: p.codigo_operacion || undefined
            };
          });

          let metodoPrincipal = 'Efectivo';
          if (desglose.length === 1) {
            metodoPrincipal = desglose[0].metodo;
          } else if (desglose.length > 1) {
            metodoPrincipal = 'Pago Mixto';
          }

          const items: VentaItemDTO[] = (v.detalle_ventas || []).map((d: any) => ({
            productoId: d.productos?.id || d.id,
            nombre: d.productos?.nombre_comercial || d.productos?.nombre_generico || 'Producto de Farmacia',
            cantidad: Number(d.cantidad) || 1,
            tipoPresentacion: d.es_fraccion ? 'Unidad' : 'Caja',
            unidadesTotales: Number(d.cantidad) || 1,
            precioUnitario: Number(d.precio_unitario) || 0,
            subtotal: Number(d.subtotal) || Number(d.total) || 0
          }));

          const ticket: TicketVentaDTO = {
            id: v.id,
            dbId: v.id,
            fecha: new Date(v.creado_en),
            items,
            subtotal: Number(v.subtotal) || 0,
            igv: Number(v.monto_igv) || 0,
            total: Number(v.total) || 0,
            modoPago: desglose.length > 1 ? 'mixto' : 'simple',
            metodo: metodoPrincipal,
            desglose: desglose.length > 0 ? desglose : [{ metodo: 'Efectivo', monto: Number(v.total) || 0 }],
            cliente: v.clientes?.nombre_razon_social || 'Cliente de Mostrador',
            dni: v.clientes?.numero_documento || '00000000',
            tipoComprobante: 'Ticket',
            sedeId: v.sucursales?.id,
            sede: v.sucursales?.nombre || 'Sede Cajamarca Central',
            cajero: v.usuarios?.nombre_completo || v.usuarios?.nombre_usuario || 'Cajero de Turno',
            estado: v.estado === 'ANULADA' ? 'ANULADO' : 'EMITIDO'
          };
          return ticket;
        });

        this.fusionarVentasEnMemoria(tickets);
        return tickets;
      }),
      catchError(err => {
        console.warn('⚠️ Excepción de conexión a Supabase ventas:', err);
        return of(this.filtrarVentasLocales(fechaInicio, fechaFin));
      })
    );
  }

  /**
   * Consulta las aperturas y sesiones de caja en Supabase por rango de fechas.
   * Ejecuta: SELECT * FROM turnos_caja ... WHERE apertura_en BETWEEN fechaInicio AND fechaFin
   */
  consultarTurnosSupabase(fechaInicio?: string, fechaFin?: string, sucursalId?: string): Observable<TurnoCajaDTO[]> {
    const client = this.supabase.client;
    if (!this.supabase.isConfigured || !client) {
      return of(this.getHistorialTurnos());
    }

    const conFiltroSede = sucursalId && sucursalId !== 'TODAS';
    let query = client
      .from('turnos_caja')
      .select(`
        id, caja_id, usuario_id, apertura_en, cierre_en,
        saldo_apertura, saldo_cierre_estimado, saldo_cierre_real,
        diferencia, estado, observaciones,
        usuarios (id, nombre_completo, nombre_usuario),
        cajas_pos${conFiltroSede ? '!inner' : ''} (id, nombre, sucursal_id, sucursales (id, nombre))
      `)
      .order('apertura_en', { ascending: false });

    if (fechaInicio) {
      query = query.gte('apertura_en', `${fechaInicio}T00:00:00.000Z`);
    }
    if (fechaFin) {
      query = query.lte('apertura_en', `${fechaFin}T23:59:59.999Z`);
    }
    if (conFiltroSede) {
      query = query.eq('cajas_pos.sucursal_id', sucursalId);
    }

    return from(query).pipe(
      timeout(12000),
      map(res => {
        if (res.error) {
          console.warn('Error al consultar turnos_caja en Supabase:', res.error);
          return this.getHistorialTurnos();
        }

        const turnos: TurnoCajaDTO[] = (res.data || [])
          .filter((t: any) => !conFiltroSede || t.cajas_pos?.sucursal_id === sucursalId)
          .map((t: any) => ({
            id: t.id,
            cajaAbierta: t.estado === 'ABIERTO',
            fechaApertura: t.apertura_en,
            fechaCierre: t.cierre_en || undefined,
            cajeroActual: t.usuarios?.nombre_completo || t.usuarios?.nombre_usuario || 'Cajero Principal',
            fondoInicial: Number(t.saldo_apertura) || 0,
            sedeId: t.cajas_pos?.sucursales?.id,
            sede: t.cajas_pos?.sucursales?.nombre || 'Sede Cajamarca Central',
            totalVentas: Number(t.saldo_cierre_real || t.saldo_cierre_estimado) || 0,
            reabierta: (t.observaciones || '').includes('REABIERTA'),
            motivoReapertura: t.observaciones || undefined
          }));

        if (turnos.length > 0) {
          localStorage.setItem('medicare_historial_turnos', JSON.stringify(turnos));
        }

        return turnos;
      }),
      catchError(err => {
        console.warn('⚠️ Excepción al consultar turnos Supabase:', err);
        return of(this.getHistorialTurnos());
      })
    );
  }

  /**
   * Registra una venta completa en Supabase (tabla 'ventas', 'pagos_venta' y 'detalle_ventas')
   * y descuenta el stock correspondiente.
   */
  registrarVenta(ticket: TicketVentaDTO): Observable<{ success: boolean; ticketId: string }> {
    const ventaDbId = (ticket.id && ticket.id.length === 36) ? ticket.id : crypto.randomUUID();
    ticket.dbId = ventaDbId;

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

    return from(this.registrarVentaDirectaSupabase(ticket, ventaDbId)).pipe(
      map(() => ({ success: true, ticketId: ticket.id })),
      catchError(err => {
        console.warn('⚠️ Error al registrar venta en Supabase:', err);
        return of({ success: true, ticketId: ticket.id });
      })
    );
  }

  private async registrarVentaDirectaSupabase(ticket: TicketVentaDTO, ventaDbId: string): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    // Detectar sucursal y usuario
    const sucursalId = ticket.sedeId || (ticket.sede?.toLowerCase().includes('baños')
      ? '45fca103-2669-48b8-8a1c-7e5380da5e1f'
      : '11111111-1111-1111-1111-111111111111');
    const esBanos = sucursalId === '45fca103-2669-48b8-8a1c-7e5380da5e1f';
    const turnoId = esBanos ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2' : 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const usuarioId = esBanos ? '33333333-3333-3333-3333-333333333333' : '33333333-3333-3333-3333-333333333331';

    // 1. Insertar en 'ventas' con estado 'COMPLETADA' (valida check constraint)
    const payloadVenta = {
      id: ventaDbId,
      sucursal_id: sucursalId,
      turno_caja_id: turnoId,
      usuario_id: usuarioId,
      subtotal: Number(ticket.subtotal) || 0,
      monto_igv: Number(ticket.igv) || 0,
      descuento: 0,
      total: Number(ticket.total) || 0,
      estado: ticket.estado === 'ANULADO' ? 'ANULADA' : 'COMPLETADA',
      codigo_receta: ticket.datosReceta?.nroReceta || null,
      creado_en: ticket.fecha ? new Date(ticket.fecha).toISOString() : new Date().toISOString()
    };

    const { error: vErr } = await client.from('ventas').insert([payloadVenta]);
    if (vErr) {
      console.warn('Error al insertar venta en Supabase:', vErr);
      return;
    }

    // 2. Insertar métodos de pago en 'pagos_venta'
    const desgloses = ticket.desglose && ticket.desglose.length > 0
      ? ticket.desglose
      : [{ metodo: ticket.metodo || 'EFECTIVO', monto: ticket.total }];

    const pagosPayload = desgloses.map(p => {
      let metodoUpper = (p.metodo || 'EFECTIVO').toUpperCase();
      if (metodoUpper.includes('YAPE')) metodoUpper = 'YAPE';
      else if (metodoUpper.includes('PLIN')) metodoUpper = 'PLIN';
      else if (metodoUpper.includes('TARJETA') || metodoUpper.includes('VISA')) metodoUpper = 'TARJETA';
      else if (metodoUpper.includes('TRANS')) metodoUpper = 'TRANSFERENCIA';
      else metodoUpper = 'EFECTIVO';

      return {
        id: crypto.randomUUID(),
        venta_id: ventaDbId,
        metodo_pago: metodoUpper,
        monto: Number(p.monto) || 0,
        codigo_operacion: p.referencia || null
      };
    });

    await client.from('pagos_venta').insert(pagosPayload);

    // 3. Insertar detalle de productos en 'detalle_ventas'
    if (ticket.items && ticket.items.length > 0) {
      const detallePayload = ticket.items.map(it => {
        const prodUuid = (typeof it.productoId === 'string' && it.productoId.length === 36)
          ? it.productoId
          : '77777777-7777-7777-7777-777777777771';
        const loteUuid = (it.loteAsignado && it.loteAsignado.length === 36)
          ? it.loteAsignado
          : '88888888-8888-8888-8888-888888888881';

        const sub = Number(it.subtotal) || 0;
        const base = Number((sub / 1.18).toFixed(2));
        const igv = Number((sub - base).toFixed(2));

        return {
          id: crypto.randomUUID(),
          venta_id: ventaDbId,
          producto_id: prodUuid,
          lote_id: loteUuid,
          es_fraccion: it.tipoPresentacion !== 'Caja',
          cantidad: Number(it.cantidad) || 1,
          precio_unitario: Number(it.precioUnitario) || 0,
          costo_unitario: 0.20,
          subtotal: base,
          monto_igv: igv,
          descuento: 0,
          total: sub
        };
      });

      await client.from('detalle_ventas').insert(detallePayload);

      // 4. Descontar stock de stock_inventario en Supabase para la sucursal activa
      for (const it of ticket.items) {
        const prodUuid = (typeof it.productoId === 'string' && it.productoId.length === 36)
          ? it.productoId
          : null;
        if (prodUuid) {
          try {
            const { data: stockRows } = await client
              .from('stock_inventario')
              .select('id, cantidad, almacenes!inner(sucursal_id)')
              .eq('producto_id', prodUuid)
              .eq('almacenes.sucursal_id', sucursalId)
              .limit(1);

            if (stockRows && stockRows.length > 0) {
              const actual = Number(stockRows[0].cantidad) || 0;
              const nuevaCant = Math.max(0, actual - (Number(it.cantidad) || 1));
              await client.from('stock_inventario').update({ cantidad: nuevaCant }).eq('id', stockRows[0].id);
            }
          } catch (e) {
            console.warn('Aviso descontando stock Supabase:', e);
          }
        }
      }
    }

  }

  /**
   * Anula una venta con registro de auditoría y motivo tanto local como en Supabase
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

    const dbId = t?.dbId || ticketId;
    return from(
      client
        .from('ventas')
        .update({
          estado: 'ANULADA'
        })
        .eq('id', dbId)
    ).pipe(
      map(res => !res.error),
      catchError(() => of(true))
    );
  }

  /**
   * Corrige el método de pago de una venta emitida por error de digitación
   * (ej: era Plin/Yape pero se registró como Efectivo) en local y Supabase.
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
    }

    const client = this.supabase.client;
    if (client && this.supabase.isConfigured) {
      const dbId = ticket?.dbId || ticketId;
      client
        .from('pagos_venta')
        .update({
          metodo_pago: nuevoMetodo.toUpperCase(),
          codigo_operacion: referencia?.trim() || null
        })
        .eq('venta_id', dbId)
        .then();
    }

    return of(true);
  }

  private filtrarVentasLocales(fechaInicio?: string, fechaFin?: string): TicketVentaDTO[] {
    return this.historialVentas.filter(v => {
      const f = this.toIsoDate(v.fecha);
      if (fechaInicio && f < fechaInicio) return false;
      if (fechaFin && f > fechaFin) return false;
      return true;
    });
  }

  private fusionarVentasEnMemoria(nuevas: TicketVentaDTO[]): void {
    const mapa = new Map<string, TicketVentaDTO>();
    this.historialVentas.forEach(v => mapa.set(v.id, v));
    nuevas.forEach(v => mapa.set(v.id, v));
    this.historialVentas = Array.from(mapa.values());
    this.guardarEnStorage();
  }

  private guardarEnStorage(): void {
    try {
      localStorage.setItem('historial_ventas_turno', JSON.stringify(this.historialVentas));
    } catch (e) {
      console.error(e);
    }
  }
}
