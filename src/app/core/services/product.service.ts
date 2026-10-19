import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, of, from, map, catchError, throwError } from 'rxjs';

export type TipoProducto = 'MEDICAMENTO' | 'PERFUME' | 'OTROS';

export interface ProductoCatalogoItem {
  id: string;
  tipoProducto: TipoProducto;
  categoriaId?: string | null;
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
  laboratorioId?: string | null;
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

  productosCatalogo: ProductoCatalogoItem[] = [];

  constructor() {
    this.limpiarStorageAntiguo();
    this.sincronizarConSupabase();
  }

  private limpiarStorageAntiguo(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('medicare_catalogo_maestro_v3');
        localStorage.removeItem('medicare_catalogo_maestro_v2');
      }
    } catch {
      // Ignorar errores en entornos sin localStorage
    }
  }

  private mapSupabaseToProducto(p: any): ProductoCatalogoItem {
    const catNom = p.categorias_producto?.nombre || 'General';
    const catId = p.categoria_id || p.categorias_producto?.id || undefined;
    const esPerfume = p.codigo_interno?.startsWith('PERF') || catNom.toLowerCase().includes('perfum');
    const esOtros = p.codigo_interno?.startsWith('OTR') || catNom.toLowerCase().includes('higiene') || catNom.toLowerCase().includes('pañal') || catNom.toLowerCase().includes('labial');
    const tipo: TipoProducto = esPerfume ? 'PERFUME' : (esOtros ? 'OTROS' : 'MEDICAMENTO');

    const precioCaja = Number(p.precio_venta) || 0;
    const precioUnidad = Number(p.precio_venta_fraccion) || 0;
    const precioBlister = Number(p.precio_costo) || 0;
    
    // El precio de referencia siempre será el de la caja si existe, sino la unidad
    const precioVenta = precioCaja > 0 ? precioCaja : precioUnidad;
    const unidadesCaja = Number(p.unidades_por_caja) || (esPerfume || esOtros ? 1 : 100);

    return {
      id: p.id,
      tipoProducto: tipo,
      categoriaId: catId,
      categoriaNombre: catNom,
      nombreComercial: p.nombre_comercial,
      sku: p.codigo_interno || ('MED-' + p.id.slice(0, 6)),
      codigoBarra: p.codigo_barras || undefined,
      precioVenta: precioVenta,
      precioCaja: precioCaja,
      precioBlister: precioBlister,
      precioUnidad: precioUnidad,
      unidadesPorCaja: unidadesCaja,
      unidadesPorBlister: esPerfume || esOtros ? 1 : Math.max(1, Math.round(unidadesCaja / 10)),
      stockDisponible: 0,
      ubicacionAlmacen: 'P1-E1-N1',
      descripcion: `${p.nombre_comercial} ${p.concentracion || ''} - ${p.nombre_generico || ''}`,
      estaActivo: p.esta_activo !== false,
      creadoEn: p.creado_en ? p.creado_en.split('T')[0] : new Date().toLocaleDateString('en-CA'),
      requiereReceta: p.tipo_receta === 'RECETA_MEDICA' || p.tipo_receta === 'RECETA_RETENIDA',
      esControlado: p.tipo_receta === 'RECETA_RETENIDA',
      laboratorioId: p.laboratorio_id || p.laboratorios?.id || null,
      laboratorio: p.laboratorios?.nombre || (p.laboratorio ? p.laboratorio : ''),
      principioActivo: p.principios_activos?.nombre || p.nombre_generico || 'Genérico',
      concentracion: p.concentracion || ''
    };
  }

  private readonly selectColumns = `
    id, codigo_barras, codigo_interno, nombre_comercial, nombre_generico,
    concentracion, registro_sanitario, tipo_receta, requiere_cadena_frio,
    es_fraccionable, unidades_por_caja, precio_costo, precio_venta,
    precio_venta_fraccion, stock_minimo, stock_maximo, esta_activo, creado_en,
    categoria_id,
    laboratorio_id,
    principios_activos (nombre),
    laboratorios (id, nombre),
    categorias_producto (id, nombre, idtipoproducto)
  `;

  private sincronizarConSupabase(): void {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client
        .from('productos')
        .select(this.selectColumns)
        .order('nombre_comercial', { ascending: true })
        .then(res => {
          if (res.data && Array.isArray(res.data)) {
            this.productosCatalogo = res.data.map(p => this.mapSupabaseToProducto(p));
          } else {
            this.productosCatalogo = [];
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
          .select(this.selectColumns)
          .order('nombre_comercial', { ascending: true })
      ).pipe(
        map(res => {
          if (res.data && Array.isArray(res.data)) {
            const mapped = res.data.map(p => this.mapSupabaseToProducto(p));
            this.productosCatalogo = mapped;
            return mapped;
          }
          return [];
        }),
        catchError(() => of([]))
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
          .select(this.selectColumns)
          .eq('esta_activo', true)
          .order('nombre_comercial', { ascending: true })
      ).pipe(
        map(res => {
          if (res.data && Array.isArray(res.data)) {
            const mapped = res.data.map(p => this.mapSupabaseToProducto(p));
            this.productosCatalogo = mapped;
            return mapped;
          }
          return [];
        }),
        catchError(() => of([]))
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
          .select(this.selectColumns)
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
      item.creadoEn = new Date().toLocaleDateString('en-CA');
      this.productosCatalogo.unshift({ ...item });
    } else {
      const idx = this.productosCatalogo.findIndex(p => p.id === item.id);
      if (idx >= 0) {
        this.productosCatalogo[idx] = { ...item };
      } else {
        this.productosCatalogo.unshift({ ...item });
      }
    }

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      const ejecutarUpsert = async () => {
        let catId = item.categoriaId || null;
        if (!catId && item.categoriaNombre && item.categoriaNombre !== 'General') {
          try {
            const res = await client
              .from('categorias_producto')
              .select('id')
              .ilike('nombre', item.categoriaNombre.trim())
              .maybeSingle();
            if (res.data?.id) {
              catId = res.data.id;
              item.categoriaId = catId;
            }
          } catch (e) {
            console.warn('[ProductService] Error buscando categoria por nombre:', e);
          }
        }

        // Resolver laboratorio_id
        let labId: string | null = null;
        if (item.laboratorio && item.laboratorio.trim()) {
          const labNombre = item.laboratorio.trim();
          try {
            if (item.laboratorioId) {
              const resCheck = await client
                .from('laboratorios')
                .select('id, nombre')
                .eq('id', item.laboratorioId)
                .maybeSingle();
              if (resCheck.data && resCheck.data.nombre.toLowerCase().trim() === labNombre.toLowerCase()) {
                labId = item.laboratorioId;
              }
            }

            if (!labId) {
              const resLab = await client
                .from('laboratorios')
                .select('id')
                .ilike('nombre', labNombre)
                .maybeSingle();
              if (resLab.data?.id) {
                labId = resLab.data.id;
              } else {
                // Si no existe, crearlo automáticamente en la tabla laboratorios
                const nuevoLabId = crypto.randomUUID();
                const insertLab = await client.from('laboratorios').insert({
                  id: nuevoLabId,
                  nombre: labNombre,
                  esta_activo: true
                }).select('id').maybeSingle();
                labId = insertLab.data?.id || nuevoLabId;
              }
            }
            item.laboratorioId = labId;
          } catch (e) {
            console.warn('[ProductService] Error resolviendo laboratorio:', e);
          }
        }

        const payload: any = {
          id: item.id,
          categoria_id: catId,
          laboratorio_id: labId,
          nombre_comercial: item.nombreComercial,
          nombre_generico: item.principioActivo || item.nombreComercial,
          codigo_interno: item.sku || ('MED-' + item.id.slice(0, 6)),
          codigo_barras: item.codigoBarra || null,
          precio_venta: Number(item.precioCaja) || Number(item.precioVenta) || 0,
          precio_costo: Number(item.precioBlister) || 0,
          precio_venta_fraccion: Number(item.precioUnidad) || 0,
          unidades_por_caja: Number(item.unidadesPorCaja) || 100,
          concentracion: item.concentracion || null,
          tipo_receta: item.requiereReceta ? 'RECETA_MEDICA' : 'VENTA_LIBRE',
          esta_activo: item.estaActivo !== false
        };

        let intento = 0;
        let resultado = await client.from('productos').upsert(payload);

        // Si ocurre error de clave duplicada (código 23505 en codigo_interno/SKU),
        // agregarle internamente un número aleatorio más y reintentar de inmediato
        while (resultado.error && intento < 5) {
          const err = resultado.error;
          const esColisionSku =
            err.code === '23505' &&
            (err.message?.includes('codigo_interno') || (err.details && err.details.includes('codigo_interno')));

          if (esColisionSku) {
            // Le agrega internamente un número aleatorio adicional al SKU (ej. OTR-222 -> OTR-222-7)
            const numAleatorio = Math.floor(1 + Math.random() * 9);
            payload.codigo_interno = `${payload.codigo_interno}-${numAleatorio}`;
            item.sku = payload.codigo_interno;
            intento++;
            resultado = await client.from('productos').upsert(payload);
          } else {
            break;
          }
        }

        if (resultado.error) {
          console.error('[ProductService] Error al guardar producto en Supabase:', resultado.error);
          throw resultado.error;
        }

        // Asegurar que el catálogo local mantenga el SKU definitivo persistido
        const localIdx = this.productosCatalogo.findIndex(p => p.id === item.id);
        if (localIdx >= 0) {
          this.productosCatalogo[localIdx].sku = item.sku;
        }
      };

      return from(ejecutarUpsert()).pipe(
        map(() => ({ ...item })),
        catchError(err => {
          console.error('[ProductService] Error en upsert producto:', err);
          return throwError(() => err);
        })
      );
    }

    return of({ ...item });
  }

  /**
   * Listar todos los laboratorios activos desde Supabase
   */
  listarLaboratorios(): Observable<{ id: string; nombre: string; pais?: string }[]> {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('laboratorios')
          .select('id, nombre, pais')
          .eq('esta_activo', true)
          .order('nombre', { ascending: true })
      ).pipe(
        map(res => (res.data && Array.isArray(res.data)) ? res.data : []),
        catchError(() => of([]))
      );
    }
    return of([]);
  }

  /**
   * Eliminar permanentemente un producto de la base de datos Supabase y de la memoria local.
   * Elimina en cascada inventario y lotes asociados, y borra el registro de la tabla 'productos'.
   */
  eliminarDelCatalogo(id: string): Observable<boolean> {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      const ejecutarEliminar = async (): Promise<boolean> => {
        try {
          // 1. Obtener los IDs de los lotes asociados al producto para evitar violaciones de clave foránea
          const { data: lotes } = await client
            .from('lotes_producto')
            .select('id')
            .eq('producto_id', id);

          const loteIds = (lotes || []).map(l => l.id);

          // 2. Eliminar registros de inventario (por lote_id y por producto_id)
          if (loteIds.length > 0) {
            await client.from('stock_inventario').delete().in('lote_id', loteIds);
          }
          await client.from('stock_inventario').delete().eq('producto_id', id);

          // 3. Eliminar los lotes del producto
          await client.from('lotes_producto').delete().eq('producto_id', id);

          // 4. Eliminar el producto definitivamente de la tabla 'productos' en Supabase
          const { error } = await client
            .from('productos')
            .delete()
            .eq('id', id);

          if (error) {
            console.error('[ProductService] Error al eliminar producto en Supabase:', error);
            return false;
          }

          // 5. Remover del catálogo local en memoria
          this.productosCatalogo = this.productosCatalogo.filter(p => p.id !== id);
          return true;
        } catch (err) {
          console.error('[ProductService] Excepción al eliminar producto en Supabase:', err);
          return false;
        }
      };

      return from(ejecutarEliminar());
    }

    this.productosCatalogo = this.productosCatalogo.filter(p => p.id !== id);
    return of(true);
  }

  /**
   * Cambiar el estado (activar / desactivar) de un producto en Supabase y localmente.
   * Permite mantener el producto en el catálogo pero deshabilitado para ventas.
   */
  cambiarEstadoProducto(id: string, estaActivo: boolean): Observable<boolean> {
    const item = this.productosCatalogo.find(p => p.id === id);
    if (item) {
      item.estaActivo = estaActivo;
    }

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('productos')
          .update({ esta_activo: estaActivo })
          .eq('id', id)
      ).pipe(
        map(res => {
          if (res.error) {
            console.error('[ProductService] Error al actualizar estado en Supabase:', res.error);
            if (item) item.estaActivo = !estaActivo;
            return false;
          }
          return true;
        }),
        catchError(err => {
          console.error('[ProductService] Excepción al actualizar estado:', err);
          if (item) item.estaActivo = !estaActivo;
          return of(false);
        })
      );
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
