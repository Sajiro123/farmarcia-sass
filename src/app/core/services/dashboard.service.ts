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
}

export interface ProductoRentableDTO {
  nombre: string;
  principioActivo: string;
  laboratorio: string;
  unidadesVendidas: number;
  ingresoTotal: number;
  costoTotal: number;
  gananciaNeta: number;
  margenPorcentaje: number;
}

export interface MedioPagoDTO {
  metodo: string;
  porcentaje: number;
  monto: number;
  color: string;
}

export interface CategoriaVentaDTO {
  cat: string;
  porcentaje: number;
  valor: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  getKpis(sucursalId?: string): Observable<DashboardKpis> {
    const client = this.supabase.client;
    const targetSede = sucursalId || this.authService.activeSede()?.id;

    const baseKpis: DashboardKpis = {
      ventasHoy: 0,
      ticketsEmitidos: 0,
      lotesPorVencer: 0,
      stockBajo: 0,
      ticketPromedio: 0,
      mermaPorcentaje: 0
    };

    if (!this.supabase.isConfigured || !client) {
      return of(baseKpis);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let query = client
      .from('ventas')
      .select('total, estado, creado_en')
      .gte('creado_en', todayStart.toISOString())
      .eq('estado', 'COMPLETADA');

    if (targetSede && targetSede !== 'TODAS') {
      query = query.eq('sucursal_id', targetSede);
    }

    return from(query).pipe(
      map(res => {
        const rows = res.data || [];
        const totalHoy = rows.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0);
        const count = rows.length;

        return {
          ventasHoy: Number(totalHoy.toFixed(2)),
          ticketsEmitidos: count,
          lotesPorVencer: 0,
          stockBajo: 2,
          ticketPromedio: count > 0 ? Number((totalHoy / count).toFixed(2)) : 0,
          mermaPorcentaje: 0.0
        };
      }),
      catchError(() => of(baseKpis))
    );
  }

  getTopRentables(sucursalId?: string): Observable<ProductoRentableDTO[]> {
    const client = this.supabase.client;
    const targetSede = sucursalId || this.authService.activeSede()?.id;

    if (!this.supabase.isConfigured || !client) {
      return of([]);
    }

    let query = client
      .from('detalle_ventas')
      .select(`
        cantidad, total, costo_unitario,
        productos (id, nombre_comercial, nombre_generico, laboratorios(nombre), principios_activos(nombre)),
        ventas!inner (estado, sucursal_id)
      `)
      .eq('ventas.estado', 'COMPLETADA');

    if (targetSede && targetSede !== 'TODAS') {
      query = query.eq('ventas.sucursal_id', targetSede);
    }

    return from(query).pipe(
      map(res => {
        if (!res.data || res.data.length === 0) return [];

        const prodMap = new Map<string, ProductoRentableDTO>();

        res.data.forEach((d: any) => {
          const nombre = d.productos?.nombre_comercial || 'Producto';
          const pa = d.productos?.principios_activos?.nombre || d.productos?.nombre_generico || 'Genérico';
          const lab = d.productos?.laboratorios?.nombre || 'Laboratorio';
          const cant = Number(d.cantidad) || 1;
          const tot = Number(d.total) || 0;
          const costo = (Number(d.costo_unitario) || 0) * cant;

          if (prodMap.has(nombre)) {
            const item = prodMap.get(nombre)!;
            item.unidadesVendidas += cant;
            item.ingresoTotal += tot;
            item.costoTotal += costo;
            item.gananciaNeta = item.ingresoTotal - item.costoTotal;
            item.margenPorcentaje = item.ingresoTotal > 0 ? Number(((item.gananciaNeta / item.ingresoTotal) * 100).toFixed(1)) : 0;
          } else {
            const ganancia = tot - costo;
            const margen = tot > 0 ? Number(((ganancia / tot) * 100).toFixed(1)) : 0;
            prodMap.set(nombre, {
              nombre,
              principioActivo: pa,
              laboratorio: lab,
              unidadesVendidas: cant,
              ingresoTotal: Number(tot.toFixed(2)),
              costoTotal: Number(costo.toFixed(2)),
              gananciaNeta: Number(ganancia.toFixed(2)),
              margenPorcentaje: margen
            });
          }
        });

        const list = Array.from(prodMap.values());
        list.sort((a, b) => b.gananciaNeta - a.gananciaNeta);
        return list.slice(0, 5);
      }),
      catchError(() => of([]))
    );
  }

  getMediosPago(sucursalId?: string): Observable<MedioPagoDTO[]> {
    const client = this.supabase.client;
    const targetSede = sucursalId || this.authService.activeSede()?.id;

    if (!this.supabase.isConfigured || !client) {
      return of([]);
    }

    let query = client
      .from('pagos_venta')
      .select(`
        metodo_pago, monto,
        ventas!inner (estado, sucursal_id)
      `)
      .eq('ventas.estado', 'COMPLETADA');

    if (targetSede && targetSede !== 'TODAS') {
      query = query.eq('ventas.sucursal_id', targetSede);
    }

    return from(query).pipe(
      map(res => {
        if (!res.data || res.data.length === 0) {
          return [
            { metodo: 'Efectivo Contado', porcentaje: 100, monto: 0, color: 'bg-emerald-500' }
          ];
        }

        const mapMonto = new Map<string, number>();
        let granTotal = 0;

        res.data.forEach((p: any) => {
          const raw = (p.metodo_pago || 'EFECTIVO').toUpperCase();
          let label = 'Efectivo Contado';
          if (raw.includes('YAPE')) label = 'Yape (BCP)';
          else if (raw.includes('PLIN')) label = 'Plin (Interbank/BBVA)';
          else if (raw.includes('TARJETA') || raw.includes('VISA')) label = 'Tarjetas (POS)';
          else if (raw.includes('TRANS')) label = 'Transferencia Bancaria';

          const monto = Number(p.monto) || 0;
          mapMonto.set(label, (mapMonto.get(label) || 0) + monto);
          granTotal += monto;
        });

        const colorMap: { [key: string]: string } = {
          'Efectivo Contado': 'bg-emerald-500',
          'Yape (BCP)': 'bg-purple-500',
          'Plin (Interbank/BBVA)': 'bg-cyan-500',
          'Tarjetas (POS)': 'bg-blue-500',
          'Transferencia Bancaria': 'bg-indigo-500'
        };

        const result: MedioPagoDTO[] = [];
        mapMonto.forEach((monto, metodo) => {
          const pct = granTotal > 0 ? Math.round((monto / granTotal) * 100) : 0;
          result.push({
            metodo,
            monto: Number(monto.toFixed(2)),
            porcentaje: pct,
            color: colorMap[metodo] || 'bg-slate-500'
          });
        });

        result.sort((a, b) => b.monto - a.monto);
        return result;
      }),
      catchError(() => of([]))
    );
  }

  getVentasPorCategoria(sucursalId?: string): Observable<CategoriaVentaDTO[]> {
    const client = this.supabase.client;
    const targetSede = sucursalId || this.authService.activeSede()?.id;

    if (!this.supabase.isConfigured || !client) {
      return of([]);
    }

    let query = client
      .from('detalle_ventas')
      .select(`
        total,
        productos (categorias_producto(nombre)),
        ventas!inner (estado, sucursal_id)
      `)
      .eq('ventas.estado', 'COMPLETADA');

    if (targetSede && targetSede !== 'TODAS') {
      query = query.eq('ventas.sucursal_id', targetSede);
    }

    return from(query).pipe(
      map(res => {
        if (!res.data || res.data.length === 0) return [];

        const catMap = new Map<string, number>();
        let totalGeneral = 0;

        res.data.forEach((d: any) => {
          const cat = d.productos?.categorias_producto?.nombre || 'General y Medicamentos';
          const tot = Number(d.total) || 0;
          catMap.set(cat, (catMap.get(cat) || 0) + tot);
          totalGeneral += tot;
        });

        const result: CategoriaVentaDTO[] = [];
        catMap.forEach((monto, cat) => {
          const pct = totalGeneral > 0 ? Math.round((monto / totalGeneral) * 100) : 0;
          result.push({
            cat,
            porcentaje: pct,
            valor: `S/ ${monto.toFixed(2)}`
          });
        });

        result.sort((a, b) => b.porcentaje - a.porcentaje);
        return result;
      }),
      catchError(() => of([]))
    );
  }
}
