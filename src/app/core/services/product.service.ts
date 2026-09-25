import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, of, from, map, catchError } from 'rxjs';

export type TipoProducto = 'MEDICAMENTO' | 'PERFUME' | 'OTROS';

export interface ProductoCatalogoItem {
  id: string;
  tipoProducto: TipoProducto;
  categoriaId?: number;
  categoriaNombre?: string;
  nombreComercial: string;
  sku: string;
  codigoBarra?: string;
  precioVenta: number;
  precioUnidad?: number;
  precioBlister?: number;
  precioCaja?: number;
  unidadesPorCaja?: number;
  unidadesPorBlister?: number;
  stockDisponible?: number;
  ubicacionAlmacen?: string;
  descripcion: string;
  estaActivo: boolean;
  creadoEn?: string;
  imagenUrl?: string;

  // Específicos Medicamentos
  requiereReceta?: boolean;
  laboratorio?: string;
  principioActivo?: string;
  concentracion?: string;
  esControlado?: boolean;

  // Específicos Perfumes / Otros
  marca?: string;
  generoObjetivo?: 'HOMBRE' | 'MUJER' | 'UNISEX' | 'INFANTIL';
  familiaOlfativa?: string;
  volumenMl?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private supabase = inject(SupabaseService);

  private readonly STORAGE_KEY = 'medicare_catalogo_maestro_v3';
  private productosCatalogo: ProductoCatalogoItem[] = this.cargarCatalogoStorage();

  constructor() {
    this.sincronizarConSupabase();
  }

  private mapSupabaseToProducto(p: any): ProductoCatalogoItem {
    const esPerfume = p.codigo_interno?.startsWith('PERF') || p.categorias_producto?.nombre?.toLowerCase().includes('perfum');
    const esOtros = p.codigo_interno?.startsWith('OTR') || p.categorias_producto?.nombre?.toLowerCase().includes('higiene');
    const tipo: TipoProducto = esPerfume ? 'PERFUME' : (esOtros ? 'OTROS' : 'MEDICAMENTO');

    const precioVenta = Number(p.precio_venta) || 0;
    const unidadesCaja = Number(p.unidades_por_caja) || (esPerfume || esOtros ? 1 : 100);
    const precioCaja = Number(precioVenta * (esPerfume || esOtros ? 1 : (unidadesCaja > 10 ? 1 : unidadesCaja))) || precioVenta;
    const precioBlister = esPerfume || esOtros ? 0 : Number((precioCaja / 5).toFixed(2));
    const precioUnidad = Number(p.precio_venta_fraccion) || (unidadesCaja > 0 ? Number((precioCaja / unidadesCaja).toFixed(2)) : precioVenta);

    return {
      id: p.id,
      tipoProducto: tipo,
      categoriaNombre: p.categorias_producto?.nombre || 'General',
      nombreComercial: p.nombre_comercial,
      sku: p.codigo_interno || ('MED-' + p.id.slice(0, 6)),
      codigoBarra: p.codigo_barras || undefined,
      precioVenta: precioVenta,
      precioCaja: precioCaja,
      precioBlister: precioBlister,
      precioUnidad: precioUnidad,
      unidadesPorCaja: unidadesCaja,
      unidadesPorBlister: esPerfume || esOtros ? 1 : Math.max(1, Math.round(unidadesCaja / 10)),
      stockDisponible: 50,
      ubicacionAlmacen: 'P1-E1-N1',
      descripcion: `${p.nombre_comercial} ${p.concentracion || ''} - ${p.nombre_generico || ''}`,
      estaActivo: p.esta_activo !== false,
      creadoEn: p.creado_en ? p.creado_en.split('T')[0] : new Date().toISOString().split('T')[0],
      requiereReceta: p.tipo_receta === 'RECETA_MEDICA' || p.tipo_receta === 'RECETA_RETENIDA',
      esControlado: p.tipo_receta === 'RECETA_RETENIDA',
      laboratorio: p.laboratorios?.nombre || 'Genfar',
      principioActivo: p.principios_activos?.nombre || p.nombre_generico || 'Genérico',
      concentracion: p.concentracion || ''
    };
  }

  private cargarCatalogoStorage(): ProductoCatalogoItem[] {
    try {
      // Limpiar cache viejo con data mockup
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('medicare_catalogo_maestro_v2');
        const guardado = localStorage.getItem(this.STORAGE_KEY);
        if (guardado) {
          const parsed: ProductoCatalogoItem[] = JSON.parse(guardado);
          // Filtrar items mockup que tengan id 'cat-001' etc.
          const reales = (parsed || []).filter(p => !p.id.startsWith('cat-0'));
          if (reales.length > 0) return reales;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  private persistirCatalogo(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.productosCatalogo));
      }
    } catch (e) {
      console.error('Error persistiendo catálogo en storage:', e);
    }
  }

  private sincronizarConSupabase(): void {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client
        .from('productos')
        .select(`
          id, codigo_barras, codigo_interno, nombre_comercial, nombre_generico,
          concentracion, registro_sanitario, tipo_receta, requiere_cadena_frio,
          es_fraccionable, unidades_por_caja, precio_costo, precio_venta,
          precio_venta_fraccion, stock_minimo, stock_maximo, esta_activo, creado_en,
          principios_activos (nombre),
          laboratorios (nombre),
          categorias_producto (nombre)
        `)
        .order('nombre_comercial', { ascending: true })
        .then(res => {
          if (res.data && res.data.length > 0) {
            this.productosCatalogo = res.data.map(p => this.mapSupabaseToProducto(p));
            this.persistirCatalogo();
          }
        });
    }
  }

  // ==========================================
  // GESTIÓN DEL CATÁLOGO REAL DE PRODUCTOS
  // ==========================================

  /**
   * Listar todos los productos del catálogo desde Supabase
   */
  listarCatalogo(): Observable<ProductoCatalogoItem[]> {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('productos')
          .select(`
            id, codigo_barras, codigo_interno, nombre_comercial, nombre_generico,
            concentracion, registro_sanitario, tipo_receta, requiere_cadena_frio,
            es_fraccionable, unidades_por_caja, precio_costo, precio_venta,
            precio_venta_fraccion, stock_minimo, stock_maximo, esta_activo, creado_en,
            principios_activos (nombre),
            laboratorios (nombre),
            categorias_producto (nombre)
          `)
          .order('nombre_comercial', { ascending: true })
      ).pipe(
        map(res => {
          if (res.data && res.data.length > 0) {
            const mapped = res.data.map(p => this.mapSupabaseToProducto(p));
            this.productosCatalogo = mapped;
            this.persistirCatalogo();
            return mapped;
          }
          return this.productosCatalogo;
        }),
        catchError(() => of(this.productosCatalogo))
      );
    }
    return of(this.productosCatalogo);
  }

  /**
   * Listar solo los productos activos del catálogo (para POS e Inventario)
   */
  listarCatalogoActivos(): Observable<ProductoCatalogoItem[]> {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('productos')
          .select(`
            id, codigo_barras, codigo_interno, nombre_comercial, nombre_generico,
            concentracion, registro_sanitario, tipo_receta, requiere_cadena_frio,
            es_fraccionable, unidades_por_caja, precio_costo, precio_venta,
            precio_venta_fraccion, stock_minimo, stock_maximo, esta_activo, creado_en,
            principios_activos (nombre),
            laboratorios (nombre),
            categorias_producto (nombre)
          `)
          .eq('esta_activo', true)
          .order('nombre_comercial', { ascending: true })
      ).pipe(
        map(res => {
          if (res.data && res.data.length > 0) {
            const mapped = res.data.map(p => this.mapSupabaseToProducto(p));
            this.productosCatalogo = mapped;
            this.persistirCatalogo();
            return mapped;
          }
          return this.productosCatalogo.filter(p => p.estaActivo);
        }),
        catchError(() => of(this.productosCatalogo.filter(p => p.estaActivo)))
      );
    }
    return of(this.productosCatalogo.filter(p => p.estaActivo));
  }

  /**
   * Obtener un producto específico por ID
   */
  obtenerProductoCatalogo(id: string): Observable<ProductoCatalogoItem | null> {
    const item = this.productosCatalogo.find(p => p.id === id);
    if (item) return of({ ...item });

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('productos')
          .select(`
            id, codigo_barras, codigo_interno, nombre_comercial, nombre_generico,
            concentracion, registro_sanitario, tipo_receta, requiere_cadena_frio,
            es_fraccionable, unidades_por_caja, precio_costo, precio_venta,
            precio_venta_fraccion, stock_minimo, stock_maximo, esta_activo, creado_en,
            principios_activos (nombre),
            laboratorios (nombre),
            categorias_producto (nombre)
          `)
          .eq('id', id)
          .single()
      ).pipe(
        map(res => {
          if (res.data) {
            return this.mapSupabaseToProducto(res.data);
          }
          return null;
        }),
        catchError(() => of(null))
      );
    }

    return of(null);
  }

  /**
   * Guardar o actualizar un producto en el catálogo maestro y persistir en Supabase
   */
  guardarEnCatalogo(item: ProductoCatalogoItem): Observable<ProductoCatalogoItem> {
    if (!item.id || item.id.startsWith('cat-')) {
      item.id = crypto.randomUUID();
      item.creadoEn = new Date().toISOString().split('T')[0];
      this.productosCatalogo.unshift({ ...item });
    } else {
      const idx = this.productosCatalogo.findIndex(p => p.id === item.id);
      if (idx >= 0) {
        this.productosCatalogo[idx] = { ...item };
      } else {
        this.productosCatalogo.unshift({ ...item });
      }
    }
    this.persistirCatalogo();

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      const payload: any = {
        id: item.id,
        nombre_comercial: item.nombreComercial,
        nombre_generico: item.principioActivo || item.nombreComercial,
        codigo_interno: item.sku || ('MED-' + item.id.slice(0, 6)),
        codigo_barras: item.codigoBarra || null,
        precio_venta: Number(item.precioVenta || item.precioCaja) || 1.0,
        precio_costo: Number(item.precioUnidad) || 0.5,
        precio_venta_fraccion: Number(item.precioUnidad || item.precioVenta) || 1.0,
        unidades_por_caja: Number(item.unidadesPorCaja) || 100,
        concentracion: item.concentracion || null,
        tipo_receta: item.requiereReceta ? 'RECETA_MEDICA' : 'VENTA_LIBRE',
        esta_activo: item.estaActivo !== false
      };
      client.from('productos').upsert(payload).then();
    }

    return of({ ...item });
  }

  /**
   * Eliminar un producto del catálogo maestro (soft delete en Supabase)
   */
  eliminarDelCatalogo(id: string): Observable<boolean> {
    this.productosCatalogo = this.productosCatalogo.filter(p => p.id !== id);
    this.persistirCatalogo();

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client.from('productos').update({ esta_activo: false }).eq('id', id).then();
    }

    return of(true);
  }

  /**
   * Búsqueda predictiva sobre el catálogo
   */
  buscarEnCatalogo(query?: string): Observable<ProductoCatalogoItem[]> {
    const items = this.productosCatalogo.filter(p => p.estaActivo);
    if (!query || !query.trim()) return of([...items]);
    const q = query.toLowerCase().trim();
    return of(items.filter(p =>
      p.nombreComercial.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.codigoBarra && p.codigoBarra.toLowerCase().includes(q)) ||
      (p.laboratorio && p.laboratorio.toLowerCase().includes(q)) ||
      (p.principioActivo && p.principioActivo.toLowerCase().includes(q)) ||
      (p.marca && p.marca.toLowerCase().includes(q)) ||
      (p.categoriaNombre && p.categoriaNombre.toLowerCase().includes(q)) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(q))
    ));
  }
}
