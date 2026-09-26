import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Observable, from, of, map, catchError } from 'rxjs';

export interface DashboardKpis {
  ventasHoy: number;
  ticketsEmitidos: number;
  lotesPorVencer: number;
  stockBajo: number;
  ticketPromedio: number;
  mermaPorcentaje: number;
  totalEfectivo: number;
  totalYape: number;
  totalPlin: number;
  totalTarjeta: number;
  totalOtros: number;
  gananciaNeta: number;
  margenPorcentaje: number;
}

export interface ProductoRentableDTO {
  rank: number;
  nombre: string;
  principioActivo: string;
  laboratorio: string;
  categoria: string;
  unidadesVendidas: number;
  ingresoTotal: number;
  costoTotal: number;
  gananciaNeta: number;
  margenPorcentaje: number;
}

export interface ProductoVendidoDTO {
  id: string;
  nombre: string;
  generico: string;
  concentracion: string;
  categoria: string;
  laboratorio: string;
  cantidadTotal: number;
  precioPromedio: number;
  ingresoTotal: number;
  costoTotal: number;
  gananciaNeta: number;
  margenPorcentaje: number;
  numVentas: number;
  ultimaVentaHora?: string;
}

export interface MedioPagoDTO {
  metodo: string;
  codigo: string;
  icono: string;
  porcentaje: number;
  monto: number;
  numTransacciones: number;
  color: string;
  bgBadge: string;
  textBadge: string;
}

export interface CategoriaVentaDTO {
  cat: string;
  porcentaje: number;
  monto: number;
  valor: string;
}

export interface DashboardResumen {
  // Totales Financieros
  totalVentas: number;
  totalEfectivo: number;
  totalYape: number;
  totalPlin: number;
  totalTarjeta: number;
  totalOtros: number;
  totalGananciaNeta: number;
  margenNetoGlobal: number;

  // Operaciones
  ticketsEmitidos: number;
  ticketPromedio: number;
  unidadesVendidasTotal: number;

  // Colecciones
  mediosPago: MedioPagoDTO[];
  topRentables: ProductoRentableDTO[];
  productosVendidos: ProductoVendidoDTO[];
  ventasPorCategoria: CategoriaVentaDTO[];
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  /**
   * Consulta centralizada y reactiva del Dashboard directamente desde Supabase.
   * Agrupa ventas, pagos (Efectivo, Yape, Plin, Tarjeta), productos vendidos y márgenes netos.
   */
  getDashboardCompleto(fechaInicio?: string, fechaFin?: string, sucursalId?: string): Observable<DashboardResumen> {
    const client = this.supabase.client;
    const targetSede = sucursalId || this.authService.activeSede()?.id;

    const baseResumen: DashboardResumen = {
      totalVentas: 0,
      totalEfectivo: 0,
      totalYape: 0,
      totalPlin: 0,
      totalTarjeta: 0,
      totalOtros: 0,
      totalGananciaNeta: 0,
      margenNetoGlobal: 0,
      ticketsEmitidos: 0,
      ticketPromedio: 0,
      unidadesVendidasTotal: 0,
      mediosPago: [],
      topRentables: [],
      productosVendidos: [],
      ventasPorCategoria: []
    };

    if (!this.supabase.isConfigured || !client) {
      return of(baseResumen);
    }

    const selectQuery = 'id, total, subtotal, monto_igv, estado, creado_en, sucursal_id, pagos_venta(metodo_pago, monto), detalle_ventas(id, producto_id, cantidad, precio_unitario, costo_unitario, total, productos(id, codigo_interno, nombre_comercial, nombre_generico, concentracion, precio_costo, precio_venta, categorias_producto(nombre), laboratorios(nombre), principios_activos(nombre)))';

    let query = client
      .from('ventas')
      .select(selectQuery)
      .eq('estado', 'COMPLETADA')
      .order('creado_en', { ascending: false });

    // Filtro por fecha si no es 'TODOS'
    if (fechaInicio && fechaInicio !== 'TODOS') {
      query = query.gte('creado_en', `${fechaInicio}T00:00:00`);
      const fFin = fechaFin || fechaInicio;
      query = query.lte('creado_en', `${fFin}T23:59:59.999Z`);
    }

    // Filtro por sede
    if (targetSede && targetSede !== 'TODAS') {
      query = query.eq('sucursal_id', targetSede);
    }

    return from(query).pipe(
      map(res => {
        const rows = res.data || [];
        if (rows.length === 0) {
          return baseResumen;
        }

        let totalVentas = 0;
        let totalEfectivo = 0;
        let totalYape = 0;
        let totalPlin = 0;
        let totalTarjeta = 0;
        let totalOtros = 0;
        let totalCostoGlobal = 0;
        let totalUnidadesVendidas = 0;

        interface ContadorMetodo { monto: number; count: number; }
        const countPagos: {
          EFECTIVO: ContadorMetodo;
          YAPE: ContadorMetodo;
          PLIN: ContadorMetodo;
          TARJETA: ContadorMetodo;
          OTROS: ContadorMetodo;
        } = {
          EFECTIVO: { monto: 0, count: 0 },
          YAPE: { monto: 0, count: 0 },
          PLIN: { monto: 0, count: 0 },
          TARJETA: { monto: 0, count: 0 },
          OTROS: { monto: 0, count: 0 }
        };

        const prodMap = new Map<string, ProductoVendidoDTO>();
        const catMap = new Map<string, number>();

        rows.forEach((v: any) => {
          const vTotal = Number(v.total) || 0;
          totalVentas += vTotal;

          // 1. Pagos por medio de pago
          const pagos = v.pagos_venta || [];
          if (pagos.length === 0) {
            totalEfectivo += vTotal;
            countPagos.EFECTIVO.monto += vTotal;
            countPagos.EFECTIVO.count += 1;
          } else {
            pagos.forEach((p: any) => {
              const m = Number(p.monto) || 0;
              const raw = (p.metodo_pago || '').toUpperCase();
              if (raw.includes('YAPE')) {
                totalYape += m;
                countPagos.YAPE.monto += m;
                countPagos.YAPE.count += 1;
              } else if (raw.includes('PLIN')) {
                totalPlin += m;
                countPagos.PLIN.monto += m;
                countPagos.PLIN.count += 1;
              } else if (raw.includes('TARJETA') || raw.includes('VISA') || raw.includes('POS')) {
                totalTarjeta += m;
                countPagos.TARJETA.monto += m;
                countPagos.TARJETA.count += 1;
              } else if (raw.includes('TRANS') || raw.includes('DEPOSITO')) {
                totalOtros += m;
                countPagos.OTROS.monto += m;
                countPagos.OTROS.count += 1;
              } else {
                totalEfectivo += m;
                countPagos.EFECTIVO.monto += m;
                countPagos.EFECTIVO.count += 1;
              }
            });
          }

          // 2. Detalle de productos vendidos
          const detalles = v.detalle_ventas || [];
          detalles.forEach((d: any) => {
            const pObj = d.productos || {};
            const pid = d.producto_id || pObj.id || 'prod';
            const nombre = pObj.nombre_comercial || 'Producto sin nombre';
            const cant = Number(d.cantidad) || 0;
            const tot = Number(d.total) || 0;
            const costoUnit = Number(d.costo_unitario) || Number(pObj.precio_costo) || 0;
            const costoTot = costoUnit * cant;

            totalUnidadesVendidas += cant;
            totalCostoGlobal += costoTot;

            const cat = pObj.categorias_producto?.nombre || 'General / Medicamentos';
            catMap.set(cat, (catMap.get(cat) || 0) + tot);

            const horaVenta = v.creado_en ? new Date(v.creado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';

            if (!prodMap.has(pid)) {
              prodMap.set(pid, {
                id: pid,
                nombre,
                generico: pObj.nombre_generico || '',
                concentracion: pObj.concentracion || '',
                categoria: cat,
                laboratorio: pObj.laboratorios?.nombre || 'Laboratorio',
                cantidadTotal: cant,
                precioPromedio: cant > 0 ? Number((tot / cant).toFixed(2)) : 0,
                ingresoTotal: Number(tot.toFixed(2)),
                costoTotal: Number(costoTot.toFixed(2)),
                gananciaNeta: Number((tot - costoTot).toFixed(2)),
                margenPorcentaje: tot > 0 ? Number((((tot - costoTot) / tot) * 100).toFixed(1)) : 0,
                numVentas: 1,
                ultimaVentaHora: horaVenta
              });
            } else {
              const item = prodMap.get(pid)!;
              item.cantidadTotal += cant;
              item.ingresoTotal = Number((item.ingresoTotal + tot).toFixed(2));
              item.costoTotal = Number((item.costoTotal + costoTot).toFixed(2));
              item.gananciaNeta = Number((item.ingresoTotal - item.costoTotal).toFixed(2));
              item.margenPorcentaje = item.ingresoTotal > 0 ? Number(((item.gananciaNeta / item.ingresoTotal) * 100).toFixed(1)) : 0;
              item.precioPromedio = item.cantidadTotal > 0 ? Number((item.ingresoTotal / item.cantidadTotal).toFixed(2)) : 0;
              item.numVentas += 1;
              if (horaVenta) item.ultimaVentaHora = horaVenta;
            }
          });
        });

        // 3. Medios de Pago DTO list
        const totalPagosRecibidos = totalEfectivo + totalYape + totalPlin + totalTarjeta + totalOtros;
        const baseCalculo = totalPagosRecibidos > 0 ? totalPagosRecibidos : totalVentas;

        const mediosPagoList: MedioPagoDTO[] = [
          {
            metodo: 'Efectivo Contado',
            codigo: 'EFECTIVO',
            icono: 'pi pi-money-bill',
            monto: Number(totalEfectivo.toFixed(2)),
            porcentaje: baseCalculo > 0 ? Math.round((totalEfectivo / baseCalculo) * 100) : 0,
            numTransacciones: countPagos.EFECTIVO.count,
            color: 'bg-emerald-500',
            bgBadge: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
            textBadge: 'text-emerald-700 dark:text-emerald-300'
          },
          {
            metodo: 'Yape (BCP)',
            codigo: 'YAPE',
            icono: 'pi pi-mobile',
            monto: Number(totalYape.toFixed(2)),
            porcentaje: baseCalculo > 0 ? Math.round((totalYape / baseCalculo) * 100) : 0,
            numTransacciones: countPagos.YAPE.count,
            color: 'bg-purple-600',
            bgBadge: 'bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800',
            textBadge: 'text-purple-700 dark:text-purple-300'
          },
          {
            metodo: 'Plin (Interbank/BBVA)',
            codigo: 'PLIN',
            icono: 'pi pi-bolt',
            monto: Number(totalPlin.toFixed(2)),
            porcentaje: baseCalculo > 0 ? Math.round((totalPlin / baseCalculo) * 100) : 0,
            numTransacciones: countPagos.PLIN.count,
            color: 'bg-cyan-500',
            bgBadge: 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-200 dark:border-cyan-800',
            textBadge: 'text-cyan-700 dark:text-cyan-300'
          },
          {
            metodo: 'Tarjetas (POS Visa/MC)',
            codigo: 'TARJETA',
            icono: 'pi pi-credit-card',
            monto: Number(totalTarjeta.toFixed(2)),
            porcentaje: baseCalculo > 0 ? Math.round((totalTarjeta / baseCalculo) * 100) : 0,
            numTransacciones: countPagos.TARJETA.count,
            color: 'bg-blue-600',
            bgBadge: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
            textBadge: 'text-blue-700 dark:text-blue-300'
          }
        ];

        if (totalOtros > 0) {
          mediosPagoList.push({
            metodo: 'Transferencias / Otros',
            codigo: 'OTROS',
            icono: 'pi pi-building-columns',
            monto: Number(totalOtros.toFixed(2)),
            porcentaje: baseCalculo > 0 ? Math.round((totalOtros / baseCalculo) * 100) : 0,
            numTransacciones: countPagos.OTROS.count,
            color: 'bg-indigo-500',
            bgBadge: 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
            textBadge: 'text-indigo-700 dark:text-indigo-300'
          });
        }

        // Ordenar medios de pago por monto descendente
        mediosPagoList.sort((a, b) => b.monto - a.monto);

        // 4. Lista completa de productos vendidos
        const productosVendidos = Array.from(prodMap.values()).sort((a, b) => b.cantidadTotal - a.cantidadTotal);

        // 5. Top 5 Productos Rentables
        const topRentables: ProductoRentableDTO[] = [...productosVendidos]
          .sort((a, b) => b.gananciaNeta - a.gananciaNeta)
          .slice(0, 5)
          .map((p, idx) => ({
            rank: idx + 1,
            nombre: p.nombre,
            principioActivo: p.generico,
            laboratorio: p.laboratorio,
            categoria: p.categoria,
            unidadesVendidas: p.cantidadTotal,
            ingresoTotal: p.ingresoTotal,
            costoTotal: p.costoTotal,
            gananciaNeta: p.gananciaNeta,
            margenPorcentaje: p.margenPorcentaje
          }));

        // 6. Ventas por categoría
        const ventasPorCategoria: CategoriaVentaDTO[] = [];
        catMap.forEach((monto, cat) => {
          const pct = totalVentas > 0 ? Math.round((monto / totalVentas) * 100) : 0;
          ventasPorCategoria.push({
            cat,
            monto: Number(monto.toFixed(2)),
            porcentaje: pct,
            valor: `S/ ${monto.toFixed(2)}`
          });
        });
        ventasPorCategoria.sort((a, b) => b.porcentaje - a.porcentaje);

        const gananciaNetaGlobal = Number((totalVentas - totalCostoGlobal).toFixed(2));
        const margenNetoGlobal = totalVentas > 0 ? Number(((gananciaNetaGlobal / totalVentas) * 100).toFixed(1)) : 0;

        return {
          totalVentas: Number(totalVentas.toFixed(2)),
          totalEfectivo: Number(totalEfectivo.toFixed(2)),
          totalYape: Number(totalYape.toFixed(2)),
          totalPlin: Number(totalPlin.toFixed(2)),
          totalTarjeta: Number(totalTarjeta.toFixed(2)),
          totalOtros: Number(totalOtros.toFixed(2)),
          totalGananciaNeta: gananciaNetaGlobal,
          margenNetoGlobal,
          ticketsEmitidos: rows.length,
          ticketPromedio: rows.length > 0 ? Number((totalVentas / rows.length).toFixed(2)) : 0,
          unidadesVendidasTotal: totalUnidadesVendidas,
          mediosPago: mediosPagoList,
          topRentables,
          productosVendidos,
          ventasPorCategoria
        };
      }),
      catchError(err => {
        console.error('[DashboardService] Error cargando dashboard completo:', err);
        return of(baseResumen);
      })
    );
  }

  // Métodos de compatibilidad
  getKpis(sucursalId?: string, fechaInicio?: string, fechaFin?: string): Observable<DashboardKpis> {
    return this.getDashboardCompleto(fechaInicio, fechaFin, sucursalId).pipe(
      map(res => ({
        ventasHoy: res.totalVentas,
        ticketsEmitidos: res.ticketsEmitidos,
        lotesPorVencer: 0,
        stockBajo: 2,
        ticketPromedio: res.ticketPromedio,
        mermaPorcentaje: 0.0,
        totalEfectivo: res.totalEfectivo,
        totalYape: res.totalYape,
        totalPlin: res.totalPlin,
        totalTarjeta: res.totalTarjeta,
        totalOtros: res.totalOtros,
        gananciaNeta: res.totalGananciaNeta,
        margenPorcentaje: res.margenNetoGlobal
      }))
    );
  }

  getTopRentables(sucursalId?: string, fechaInicio?: string, fechaFin?: string): Observable<ProductoRentableDTO[]> {
    return this.getDashboardCompleto(fechaInicio, fechaFin, sucursalId).pipe(
      map(res => res.topRentables)
    );
  }

  getMediosPago(sucursalId?: string, fechaInicio?: string, fechaFin?: string): Observable<MedioPagoDTO[]> {
    return this.getDashboardCompleto(fechaInicio, fechaFin, sucursalId).pipe(
      map(res => res.mediosPago)
    );
  }

  getVentasPorCategoria(sucursalId?: string, fechaInicio?: string, fechaFin?: string): Observable<CategoriaVentaDTO[]> {
    return this.getDashboardCompleto(fechaInicio, fechaFin, sucursalId).pipe(
      map(res => res.ventasPorCategoria)
    );
  }
}
