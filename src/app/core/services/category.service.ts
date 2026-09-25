import { Injectable, inject } from '@angular/core';
import { Observable, of, from, map, catchError } from 'rxjs';
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

  private readonly STORAGE_KEY = 'medicare_categorias_productos_v4';
  private categorias: CategoriaItem[] = this.cargarCategoriasStorage();

  constructor() {
    this.sincronizarConSupabase();
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
      creadoEn: new Date().toISOString().split('T')[0]
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
            this.persistirCategorias();
          }
        });
    }
  }

  private cargarCategoriasStorage(): CategoriaItem[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const guardado = localStorage.getItem(this.STORAGE_KEY);
        if (guardado) {
          const parsed: CategoriaItem[] = JSON.parse(guardado);
          const reales = (parsed || []).filter(c => !c.id.startsWith('cat-med-0') && !c.id.startsWith('cat-perf-0') && !c.id.startsWith('cat-otr-0'));
          if (reales.length > 0) return reales;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  private persistirCategorias(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.categorias));
      }
    } catch (e) {
      console.error('Error persistiendo categorías en storage:', e);
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
            this.persistirCategorias();
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
   */
  guardarCategoria(cat: Partial<CategoriaItem>): Observable<CategoriaItem> {
    const nuevoId = cat.id || crypto.randomUUID();
    const idTipo = cat.idtipoproducto !== undefined && cat.idtipoproducto !== null
      ? Number(cat.idtipoproducto)
      : mapTipoProductoToIdTipo(cat.tipoAsociado);
    const tipoAsociado = mapIdTipoToTipoProducto(idTipo);

    const nuevoItem: CategoriaItem = {
      id: nuevoId,
      codigo: cat.codigo || `CAT-${(this.categorias.length + 1).toString().padStart(2, '0')}`,
      nombre: (cat.nombre || '').trim(),
      idtipoproducto: idTipo,
      tipoAsociado: tipoAsociado,
      descripcion: (cat.descripcion || '').trim(),
      colorBadge: idTipo === 2 ? 'purple' : (idTipo === 3 ? 'sky' : 'emerald'),
      creadoEn: cat.creadoEn || new Date().toISOString().split('T')[0],
      estaActiva: cat.estaActiva !== undefined ? cat.estaActiva : true
    };

    // Actualizar inmediatamente en memoria
    const idx = this.categorias.findIndex(c => c.id === nuevoItem.id || c.nombre.toLowerCase().trim() === nuevoItem.nombre.toLowerCase().trim());
    if (idx >= 0) {
      this.categorias[idx] = nuevoItem;
    } else {
      this.categorias.unshift(nuevoItem);
    }
    this.persistirCategorias();

    // Persistir directamente en Supabase con la columna idtipoproducto
    const client = this.supabase.client;
    if (this.supabase.isConfigured && client) {
      return from(
        client.from('categorias_producto').upsert({
          id: nuevoId,
          nombre: nuevoItem.nombre,
          idtipoproducto: idTipo
        }).select()
      ).pipe(
        map(() => nuevoItem),
        catchError(err => {
          console.error('Error al guardar en Supabase categorias_producto:', err);
          return of(nuevoItem);
        })
      );
    }

    return of({ ...nuevoItem });
  }

  /**
   * Eliminar una categoría directamente en Supabase
   */
  eliminarCategoria(id: string): Observable<boolean> {
    this.categorias = this.categorias.filter(c => c.id !== id);
    this.persistirCategorias();

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
