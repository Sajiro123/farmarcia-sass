import { Injectable, inject } from '@angular/core';
import { Observable, of, from, map, catchError, throwError } from 'rxjs';
import { TipoProducto } from './product.service';
import { SupabaseService } from './supabase.service';

export interface CategoriaItem {
  id: string;
  codigo: string;
  nombre: string;
  idtipoproducto: number; // 1: Medicamentos, 2: Perfumes, 3: Otros
  tipoAsociado: TipoProducto | 'TODOS';
  descripcion?: string;
  colorBadge?: string;
  creadoEn?: string;
  estaActiva?: boolean;
}

export function mapIdTipoToTipoProducto(idTipo?: number): TipoProducto | 'TODOS' {
  switch (Number(idTipo)) {
    case 1: return 'MEDICAMENTO';
    case 2: return 'PERFUME';
    case 3: return 'OTROS';
    default: return 'TODOS';
  }
}

export function mapTipoProductoToIdTipo(tipo?: TipoProducto | 'TODOS'): number {
  switch (tipo) {
    case 'MEDICAMENTO': return 1;
    case 'PERFUME': return 2;
    case 'OTROS': return 3;
    default: return 1;
  }
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private supabase = inject(SupabaseService);

  private categorias: CategoriaItem[] = [];

  constructor() {
    this.limpiarStorageAntiguo();
    this.sincronizarConSupabase();
  }

  private limpiarStorageAntiguo(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('medicare_categorias_productos_v4');
      }
    } catch {
      // Ignorar
    }
  }

  private mapSupabaseToCategoria(c: any): CategoriaItem {
    const idTipo = c.idtipoproducto !== undefined && c.idtipoproducto !== null 
      ? Number(c.idtipoproducto) 
      : (c.nombre && c.nombre.toLowerCase().includes('cafe') ? 3 : 1);
    const tipoAsociado = mapIdTipoToTipoProducto(idTipo);
    const badge = idTipo === 2 ? 'purple' : (idTipo === 3 ? 'sky' : 'emerald');

    return {
      id: c.id,
      codigo: 'CAT-' + c.id.slice(0, 6).toUpperCase(),
      nombre: c.nombre,
      idtipoproducto: idTipo,
      tipoAsociado: tipoAsociado,
      descripcion: c.descripcion || `Categoría: ${c.nombre}`,
      colorBadge: badge,
      estaActiva: true,
      creadoEn: new Date().toLocaleDateString('en-CA')
    };
  }

  private sincronizarConSupabase(): void {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      client
        .from('categorias_producto')
        .select('*')
        .order('nombre', { ascending: true })
        .then(res => {
          if (res.data && res.data.length > 0) {
            this.categorias = res.data.map(c => this.mapSupabaseToCategoria(c));
                      }
        });
    }
  }

  /**
   * Listar todas las categorías disponibles directamente desde Supabase
   */
  listarCategorias(): Observable<CategoriaItem[]> {
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client
          .from('categorias_producto')
          .select('*')
          .order('nombre', { ascending: true })
      ).pipe(
        map(res => {
          if (res.data && res.data.length > 0) {
            const mapped = res.data.map(c => this.mapSupabaseToCategoria(c));
            this.categorias = mapped;
                        return mapped;
          }
          return this.categorias;
        }),
        catchError(() => of(this.categorias))
      );
    }
    return of(this.categorias);
  }

  /**
   * Listar categorías filtradas según el tipo de producto
   */
  listarPorTipo(tipo?: TipoProducto): Observable<CategoriaItem[]> {
    if (!tipo) return this.listarCategorias();
    const idEsperado = mapTipoProductoToIdTipo(tipo);
    return this.listarCategorias().pipe(
      map(cats => cats.filter(c => c.estaActiva !== false && (c.idtipoproducto === idEsperado || c.tipoAsociado === 'TODOS')))
    );
  }

  /**
   * Crear o registrar una nueva categoría en Supabase con idtipoproducto (1, 2 o 3)
   * Si la categoría ya existe por nombre, actualiza el registro existente en vez de duplicar.
   */
  guardarCategoria(cat: Partial<CategoriaItem>): Observable<CategoriaItem> {
    const nombreLimpio = (cat.nombre || '').trim();
    const idTipo = cat.idtipoproducto !== undefined && cat.idtipoproducto !== null
      ? Number(cat.idtipoproducto)
      : mapTipoProductoToIdTipo(cat.tipoAsociado);
    const tipoAsociado = mapIdTipoToTipoProducto(idTipo);

    // Buscar si ya existe previamente en memoria local
    const existente = this.categorias.find(c =>
      (cat.id && c.id === cat.id) ||
      (c.nombre && c.nombre.toLowerCase().trim() === nombreLimpio.toLowerCase())
    );

    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      const ejecutarUpsert = async (): Promise<CategoriaItem> => {
        const payload: any = {
          nombre: nombreLimpio,
          idtipoproducto: idTipo
        };

        if (cat.id || existente?.id) {
          payload.id = cat.id || existente?.id;
        }

        // Upsert con resolución automática de conflicto en la columna única 'nombre'
        const { data, error } = await client
          .from('categorias_producto')
          .upsert(payload, { onConflict: 'nombre' })
          .select('id, nombre, idtipoproducto')
          .single();

        if (error) {
          console.error('[CategoryService] Error en upsert categorias_producto:', error);
          throw error;
        }

        const catData = data || {};
        const idPersistido = catData.id || payload.id || crypto.randomUUID();

        const itemFinal: CategoriaItem = {
          id: idPersistido,
          codigo: cat.codigo || existente?.codigo || `CAT-${(this.categorias.length + 1).toString().padStart(2, '0')}`,
          nombre: catData.nombre || nombreLimpio,
          idtipoproducto: catData.idtipoproducto !== undefined ? Number(catData.idtipoproducto) : idTipo,
          tipoAsociado: mapIdTipoToTipoProducto(catData.idtipoproducto !== undefined ? Number(catData.idtipoproducto) : idTipo),
          descripcion: (cat.descripcion || existente?.descripcion || '').trim(),
          colorBadge: idTipo === 2 ? 'purple' : (idTipo === 3 ? 'sky' : 'emerald'),
          creadoEn: cat.creadoEn || existente?.creadoEn || new Date().toLocaleDateString('en-CA'),
          estaActiva: cat.estaActiva !== undefined ? cat.estaActiva : true
        };

        // Actualizar en el catálogo local en memoria
        const idx = this.categorias.findIndex(c =>
          c.id === itemFinal.id || c.nombre.toLowerCase().trim() === itemFinal.nombre.toLowerCase().trim()
        );
        if (idx >= 0) {
          this.categorias[idx] = itemFinal;
        } else {
          this.categorias.unshift(itemFinal);
        }

        return itemFinal;
      };

      return from(ejecutarUpsert()).pipe(
        catchError(err => {
          console.error('[CategoryService] Error al guardar categoría:', err);
          return throwError(() => err);
        })
      );
    }

    // Modo local / offline
    const idLocal = cat.id || existente?.id || crypto.randomUUID();
    const itemLocal: CategoriaItem = {
      id: idLocal,
      codigo: cat.codigo || existente?.codigo || `CAT-${(this.categorias.length + 1).toString().padStart(2, '0')}`,
      nombre: nombreLimpio,
      idtipoproducto: idTipo,
      tipoAsociado: tipoAsociado,
      descripcion: (cat.descripcion || existente?.descripcion || '').trim(),
      colorBadge: idTipo === 2 ? 'purple' : (idTipo === 3 ? 'sky' : 'emerald'),
      creadoEn: cat.creadoEn || new Date().toLocaleDateString('en-CA'),
      estaActiva: cat.estaActiva !== undefined ? cat.estaActiva : true
    };

    const idx = this.categorias.findIndex(c => c.id === itemLocal.id || c.nombre.toLowerCase().trim() === itemLocal.nombre.toLowerCase().trim());
    if (idx >= 0) {
      this.categorias[idx] = itemLocal;
    } else {
      this.categorias.unshift(itemLocal);
    }

    return of(itemLocal);
  }

  /**
   * Eliminar una categoría directamente en Supabase
   */
  eliminarCategoria(id: string): Observable<boolean> {
    this.categorias = this.categorias.filter(c => c.id !== id);
    
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client.from('categorias_producto').delete().eq('id', id)
      ).pipe(
        map(() => true),
        catchError(() => of(true))
      );
    }

    return of(true);
  }

  /**
   * Asegurar que una categoría mencionada en un producto exista en la base de datos
   */
  asegurarCategoriaExiste(nombre: string, tipo: TipoProducto): void {
    if (!nombre || !nombre.trim()) return;
    const existe = this.categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase().trim());
    if (!existe) {
      const idTipo = mapTipoProductoToIdTipo(tipo);
      this.guardarCategoria({
        nombre: nombre.trim(),
        idtipoproducto: idTipo,
        tipoAsociado: tipo,
        descripcion: `Categoría para ${nombre.trim()}`
      }).subscribe();
    }
  }
}
