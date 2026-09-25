import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Observable, of, from, map, catchError } from 'rxjs';

export interface LoteItem {
  id: string | number;
  productoId: string;
  tipoProducto?: 'MEDICAMENTO' | 'PERFUME' | 'OTROS';
  lote: string;
  producto: string;
  principioActivo: string;
  laboratorio: string;
  stock: number;
  vencimiento: string;
  dias: number;
  pasillo?: string;
  estante?: string;
  nivel?: string;
  gaveta?: string;
  ubicacion?: string;
  registroSanitario?: string;
  temperatura?: string;
  costoUnitario?: number;
  fechaIngreso?: string;
  almacenId?: string;
  sucursalId?: string;
  sucursalNombre?: string;

  // Específicos para Perfumes y Fragancias
  concentracionFragancia?: string;
  volumenMl?: number;
  batchCode?: string;
  destinoUnidad?: 'VENTA' | 'TESTER';
  genero?: string;
  familiaOlfativa?: string;
}

export interface ActaBaja {
  id: string;
  fecha: Date;
  responsable: string;
  cmpQuimico?: string;
  motivo: string;
  observaciones?: string;
  loteId: string | number;
  productoId?: string;
  producto: string;
  lote: string;
  cantidadBaja: number;
  costoTotalPerdida: number;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  private readonly STORAGE_KEY_LOTES = 'medicare_inventario_lotes_v3';
  private readonly STORAGE_KEY_ACTAS = 'medicare_inventario_actas_v3';

  private lotesInventario: LoteItem[] = this.cargarLotesStorage();
  private actasBaja: ActaBaja[] = this.cargarActasStorage();

  constructor() {
    this.sincronizarLotesSupabase();
  }

  private mapSupabaseToLote(s: any): LoteItem {
    const vto = s.lotes_producto?.fecha_vencimiento || '2027-12-31';
    const now = Date.now();
    const vtoDate = new Date(vto).getTime();
    const dias = isNaN(vtoDate) ? 999 : Math.round((vtoDate - now) / (1000 * 3600 * 24));

    const p = s.productos;
    const esPerfume = p?.codigo_interno?.startsWith('PERF') || p?.categorias_producto?.nombre?.toLowerCase().includes('perfum');
    const esOtros = p?.codigo_interno?.startsWith('OTR') || p?.categorias_producto?.nombre?.toLowerCase().includes('higiene');
    const tipo: 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = esPerfume ? 'PERFUME' : (esOtros ? 'OTROS' : 'MEDICAMENTO');

    return {
      id: s.id,
      productoId: p?.id || s.producto_id,
      tipoProducto: tipo,
      lote: s.lotes_producto?.numero_lote || 'LOT-2026A',
      producto: p?.nombre_comercial || 'Producto de Farmacia',
      principioActivo: p?.principios_activos?.nombre || p?.nombre_generico || 'Genérico',
      laboratorio: p?.laboratorios?.nombre || 'Laboratorio',
      stock: Number(s.cantidad) || 0,
      vencimiento: vto,
      dias: dias,
      pasillo: 'P1',
      estante: 'E1',
      nivel: 'N1',
      ubicacion: s.almacenes?.nombre || 'Almacén Principal',
      registroSanitario: s.lotes_producto?.registro_sanitario || p?.registro_sanitario || 'EN-04512',
      costoUnitario: Number(p?.precio_costo) || 0.20,
      fechaIngreso: s.actualizado_en ? s.actualizado_en.split('T')[0] : new Date().toISOString().split('T')[0],
      almacenId: s.almacen_id,
      sucursalId: s.almacenes?.sucursal_id,
      sucursalNombre: s.almacenes?.sucursales?.nombre
    };
  }

  private cargarLotesStorage(): LoteItem[] {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('medicare_inventario_lotes_v1');
        const guardado = localStorage.getItem(this.STORAGE_KEY_LOTES);
        if (guardado) {
          const parsed = JSON.parse(guardado);
          const reales = (parsed || []).filter((l: any) => !String(l.id).startsWith('lote-0'));
          if (reales.length > 0) return reales;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  private persistirLotes(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY_LOTES, JSON.stringify(this.lotesInventario));
      }
    } catch (e) {
      console.error('Error persistiendo lotes en storage:', e);
    }
  }

  private cargarActasStorage(): ActaBaja[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const guardado = localStorage.getItem(this.STORAGE_KEY_ACTAS);
        return guardado ? JSON.parse(guardado) : [];
      }
      return [];
    } catch {
      return [];
    }
  }

  private persistirActas(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY_ACTAS, JSON.stringify(this.actasBaja));
      }
    } catch (e) {
      console.error('Error persistiendo actas en storage:', e);
    }
  }

  private sincronizarLotesSupabase(): void {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client
        .from('stock_inventario')
        .select(`
          id, cantidad, cantidad_fraccion, almacen_id, producto_id, lote_id, actualizado_en,
          productos (id, nombre_comercial, nombre_generico, concentracion, precio_costo, precio_venta, principios_activos(nombre), laboratorios(nombre), categorias_producto(nombre)),
          lotes_producto (id, numero_lote, fecha_vencimiento, registro_sanitario, estado),
          almacenes!inner (id, nombre, sucursal_id, sucursales(id, nombre))
        `)
        .then(res => {
          if (res.data && res.data.length > 0) {
            this.lotesInventario = res.data.map(s => this.mapSupabaseToLote(s));
            this.persistirLotes();
          }
        });
    }
  }

  // ==========================================
  // GESTIÓN DE LOTES E INVENTARIO POR SEDE
  // ==========================================

  /**
   * Listar todos los lotes de inventario ordenados por FEFO (First Expired, First Out),
   * filtrando estrictamente por la sucursal activa.
   */
  listarLotesFefo(sucursalId?: string): Observable<LoteItem[]> {
    const targetSede = sucursalId || this.authService.activeSede()?.id;
    const client = this.supabase.client;

    if (this.supabase.isConfigured && client) {
      let query = client
        .from('stock_inventario')
        .select(`
          id, cantidad, cantidad_fraccion, almacen_id, producto_id, lote_id, actualizado_en,
          productos (id, nombre_comercial, nombre_generico, concentracion, precio_costo, precio_venta, principios_activos(nombre), laboratorios(nombre), categorias_producto(nombre)),
          lotes_producto (id, numero_lote, fecha_vencimiento, registro_sanitario, estado),
          almacenes!inner (id, nombre, sucursal_id, sucursales(id, nombre))
        `);

      if (targetSede && targetSede !== 'TODAS') {
        query = query.eq('almacenes.sucursal_id', targetSede);
      }

      return from(query).pipe(
        map(res => {
          if (res.data && res.data.length > 0) {
            const mapped = res.data.map(s => this.mapSupabaseToLote(s));
            // Actualizar memoria
            const otherSedes = this.lotesInventario.filter(l => l.sucursalId && l.sucursalId !== targetSede);
            this.lotesInventario = [...otherSedes, ...mapped];
            this.persistirLotes();

            return mapped.sort((a, b) => new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime());
          }
          return this.filtrarLotesLocales(targetSede);
        }),
        catchError(() => of(this.filtrarLotesLocales(targetSede)))
      );
    }

    return of(this.filtrarLotesLocales(targetSede));
  }

  private filtrarLotesLocales(targetSede?: string): LoteItem[] {
    let list = this.lotesInventario;
    if (targetSede && targetSede !== 'TODAS') {
      list = list.filter(l => !l.sucursalId || l.sucursalId === targetSede);
    }
    const now = Date.now();
    list.forEach(l => {
      const vtoDate = new Date(l.vencimiento).getTime();
      l.dias = isNaN(vtoDate) ? 999 : Math.round((vtoDate - now) / (1000 * 3600 * 24));
    });
    return [...list].sort((a, b) => new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime());
  }

  /**
   * Obtener lotes de un producto específico para la sede activa (para POS y modal)
   */
  getLotesPorProducto(productoId: string, sucursalId?: string): Observable<LoteItem[]> {
    const targetSede = sucursalId || this.authService.activeSede()?.id;
    const lotesProd = this.filtrarLotesLocales(targetSede)
      .filter(l => l.productoId === productoId && l.stock > 0);
    return of(lotesProd);
  }

  /**
   * Obtener el stock total disponible de un producto en la sede activa
   */
  getStockTotalPorProducto(productoId: string, sucursalId?: string): number {
    const targetSede = sucursalId || this.authService.activeSede()?.id;
    const now = Date.now();
    return this.filtrarLotesLocales(targetSede)
      .filter(l => {
        if (l.productoId !== productoId || l.stock <= 0) return false;
        const vtoDate = new Date(l.vencimiento).getTime();
        const dias = Math.round((vtoDate - now) / (1000 * 3600 * 24));
        return dias >= 0;
      })
      .reduce((sum, l) => sum + l.stock, 0);
  }

  /**
   * Agregar un nuevo lote al inventario e insertarlo en Supabase
   */
  agregarLote(lote: LoteItem): Observable<LoteItem> {
    if (!lote.id || String(lote.id).startsWith('lote-')) {
      lote.id = crypto.randomUUID();
    }
    if (!lote.fechaIngreso) {
      lote.fechaIngreso = new Date().toISOString().split('T')[0];
    }
    const targetSede = lote.sucursalId || this.authService.activeSede()?.id || '11111111-1111-1111-1111-111111111111';
    lote.sucursalId = targetSede;

    const now = Date.now();
    const vtoDate = new Date(lote.vencimiento).getTime();
    lote.dias = isNaN(vtoDate) ? 999 : Math.round((vtoDate - now) / (1000 * 3600 * 24));

    this.lotesInventario.push({ ...lote });
    this.persistirLotes();

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      // 1. Crear lote en lotes_producto
      const loteDbId = crypto.randomUUID();
      client.from('lotes_producto').insert([{
        id: loteDbId,
        producto_id: lote.productoId,
        numero_lote: lote.lote,
        fecha_vencimiento: lote.vencimiento,
        registro_sanitario: lote.registroSanitario || 'EN-04512',
        estado: 'ACTIVO'
      }]).then(() => {
        // 2. Obtener almacen de la sede
        client.from('almacenes').select('id').eq('sucursal_id', targetSede).limit(1).then(almRes => {
          const almId = almRes.data?.[0]?.id || '22222222-2222-2222-2222-222222222222';
          // 3. Crear stock_inventario
          client.from('stock_inventario').insert([{
            id: lote.id,
            almacen_id: almId,
            producto_id: lote.productoId,
            lote_id: loteDbId,
            cantidad: Number(lote.stock) || 0
          }]).then();
        });
      });
    }

    return of({ ...lote });
  }

  /**
   * Agregar múltiples lotes en bloque al inventario
   */
  agregarLotesBatch(lotes: LoteItem[]): Observable<LoteItem[]> {
    lotes.forEach(l => this.agregarLote(l).subscribe());
    return of(lotes);
  }

  /**
   * Actualizar un lote existente en el inventario y Supabase
   */
  actualizarLote(lote: LoteItem): Observable<LoteItem> {
    const idx = this.lotesInventario.findIndex(l => l.id === lote.id);
    if (idx >= 0) {
      this.lotesInventario[idx] = { ...lote };
      this.persistirLotes();
    }

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client.from('stock_inventario').update({
        cantidad: Number(lote.stock) || 0
      }).eq('id', lote.id).then();
    }

    return of({ ...lote });
  }

  /**
   * Eliminar un lote del inventario
   */
  eliminarLote(id: string | number): Observable<boolean> {
    this.lotesInventario = this.lotesInventario.filter(l => l.id !== id);
    this.persistirLotes();

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client.from('stock_inventario').delete().eq('id', id).then();
    }

    return of(true);
  }

  /**
   * Descontar stock de un lote específico (al realizar una venta)
   */
  descontarStockLote(loteId: string | number, cantidad: number): Observable<boolean> {
    const idx = this.lotesInventario.findIndex(l => l.id === loteId);
    if (idx >= 0 && this.lotesInventario[idx].stock >= cantidad) {
      this.lotesInventario[idx].stock -= cantidad;
      this.persistirLotes();

      const client = this.supabase.client;
      if (this.supabase.isConfigured && client) {
        client.from('stock_inventario').update({
          cantidad: this.lotesInventario[idx].stock
        }).eq('id', loteId).then();
      }

      return of(true);
    }
    return of(false);
  }

  /**
   * Descontar stock FEFO: descuenta del lote más próximo a vencer primero en la sede correspondiente
   */
  descontarStockFefo(productoId: string, cantidadUnidades: number, sucursalId?: string): Observable<boolean> {
    const targetSede = sucursalId || this.authService.activeSede()?.id;
    const lotesDisponibles = this.filtrarLotesLocales(targetSede)
      .filter(l => l.productoId === productoId && l.stock > 0);

    let restante = cantidadUnidades;
    const client = this.supabase.client;

    for (const lote of lotesDisponibles) {
      if (restante <= 0) break;
      const aTomar = Math.min(lote.stock, restante);
      const idx = this.lotesInventario.findIndex(l => l.id === lote.id);
      if (idx >= 0) {
        this.lotesInventario[idx].stock -= aTomar;
        restante -= aTomar;

        if (this.supabase.isConfigured && client) {
          client.from('stock_inventario').update({
            cantidad: this.lotesInventario[idx].stock
          }).eq('id', lote.id).then();
        }
      }
    }

    this.persistirLotes();
    return of(restante <= 0);
  }

  /**
   * Reingresar stock (al anular una venta)
   */
  reingresarStock(productoId: string, cantidadUnidades: number, sucursalId?: string): Observable<boolean> {
    const targetSede = sucursalId || this.authService.activeSede()?.id;
    const loteProd = this.filtrarLotesLocales(targetSede)
      .filter(l => l.productoId === productoId);

    if (loteProd.length > 0) {
      const idx = this.lotesInventario.findIndex(l => l.id === loteProd[0].id);
      if (idx >= 0) {
        this.lotesInventario[idx].stock += cantidadUnidades;
        this.persistirLotes();

        const client = this.supabase.client;
        if (this.supabase.isConfigured && client) {
          client.from('stock_inventario').update({
            cantidad: this.lotesInventario[idx].stock
          }).eq('id', loteProd[0].id).then();
        }

        return of(true);
      }
    }
    return of(false);
  }

  // ==========================================
  // ACTAS DE BAJA
  // ==========================================

  listarActas(): Observable<ActaBaja[]> {
    return of([...this.actasBaja]);
  }

  registrarBajaLote(acta: ActaBaja): Observable<boolean> {
    const idx = this.lotesInventario.findIndex(l => l.id == acta.loteId || l.lote == acta.lote);
    if (idx !== -1) {
      this.lotesInventario[idx].stock = Math.max(0, this.lotesInventario[idx].stock - acta.cantidadBaja);
      this.persistirLotes();

      const client = this.supabase.client;
      if (this.supabase.isConfigured && client) {
        client.from('stock_inventario').update({
          cantidad: this.lotesInventario[idx].stock
        }).eq('id', this.lotesInventario[idx].id).then();
      }
    }

    this.actasBaja.unshift(acta);
    this.persistirActas();
    return of(true);
  }
}
