import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, of } from 'rxjs';

export type TipoProducto = 'MEDICAMENTO' | 'PERFUME';

export interface ProductoCatalogoItem {
  id: string;
  tipoProducto: TipoProducto;
  categoriaId?: number;
  categoriaNombre?: string;
  nombreComercial: string;
  sku: string;
  precioVenta: number; // Precio general o por unidad
  precioUnidad?: number; // Precio por pastilla / unidad individual
  precioBlister?: number; // Precio por blíster
  precioCaja?: number; // Precio por caja completa
  unidadesPorCaja?: number;
  unidadesPorBlister?: number;
  stockDisponible?: number;
  ubicacionAlmacen?: string;
  descripcion: string;
  estaActivo: boolean;
  creadoEn?: string;
  imagenUrl?: string; // URL pública en Supabase Storage o CDN

  // Específicos Medicamentos
  requiereReceta?: boolean;
  laboratorio?: string;
  principioActivo?: string;
  concentracion?: string;
  esControlado?: boolean; // Psicotrópico o Estupefaciente

  // Específicos Perfumes
  marca?: string;
  familiaOlfativa?: string;
  volumenMl?: number;
  generoObjetivo?: 'HOMBRE' | 'MUJER' | 'UNISEX';
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private supabase = inject(SupabaseService);

  private readonly STORAGE_KEY = 'medicare_catalogo_maestro_v2';
  private productosCatalogo: ProductoCatalogoItem[] = this.cargarCatalogoStorage();

  private getProductosSemilla(): ProductoCatalogoItem[] {
    return [
      {
        id: 'cat-001',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Analgésicos',
        nombreComercial: 'Paracetamol 500mg',
        sku: 'MED-PAR-500',
        precioVenta: 4.50,
        precioCaja: 4.50,
        precioBlister: 2.00,
        precioUnidad: 0.50,
        unidadesPorCaja: 20,
        unidadesPorBlister: 10,
        stockDisponible: 458,
        ubicacionAlmacen: 'P1-E1-N1',
        descripcion: 'Paracetamol 500mg para dolor de cabeza, fiebre y dolores musculares.',
        estaActivo: true,
        requiereReceta: false,
        esControlado: false,
        laboratorio: 'Genérico',
        principioActivo: 'Paracetamol',
        concentracion: '500mg',
        imagenUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-002',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Antibióticos',
        nombreComercial: 'Amoxicilina + Ac. Clavulánico 500/125mg',
        sku: 'MED-AMX-500',
        precioVenta: 7.00,
        precioCaja: 7.00,
        precioBlister: 3.50,
        precioUnidad: 1.00,
        unidadesPorCaja: 14,
        unidadesPorBlister: 7,
        stockDisponible: 68,
        ubicacionAlmacen: 'P1-E2-N2',
        descripcion: 'Antibiótico de amplio espectro para infecciones respiratorias bacterianas.',
        estaActivo: true,
        requiereReceta: true,
        esControlado: false,
        laboratorio: 'Portugal',
        principioActivo: 'Amoxicilina + Clavulánico',
        concentracion: '500/125mg',
        imagenUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-003',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Cardiología',
        nombreComercial: 'Clonazepam 2mg (Controlado)',
        sku: 'MED-CLZ-002',
        precioVenta: 18.00,
        precioCaja: 18.00,
        precioBlister: 9.00,
        precioUnidad: 2.00,
        unidadesPorCaja: 30,
        unidadesPorBlister: 10,
        stockDisponible: 96,
        ubicacionAlmacen: 'P3-E1-N1',
        descripcion: 'Psicotrópico ansiolítico sujeto a retención de receta médica especial.',
        estaActivo: true,
        requiereReceta: true,
        esControlado: true,
        laboratorio: 'Sandoz',
        principioActivo: 'Clonazepam',
        concentracion: '2mg',
        imagenUrl: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-004',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Venta Libre (OTC)',
        nombreComercial: 'Panadol Antigripal NF',
        sku: 'MED-PAN-004',
        precioVenta: 10.90,
        precioCaja: 10.90,
        precioBlister: 5.50,
        precioUnidad: 1.20,
        unidadesPorCaja: 24,
        unidadesPorBlister: 6,
        stockDisponible: 218,
        ubicacionAlmacen: 'P1-E1-N2',
        descripcion: 'Alivio rápido de la congestión nasal, malestar general, dolor y fiebre.',
        estaActivo: true,
        requiereReceta: false,
        esControlado: false,
        laboratorio: 'GSK GlaxoSmithKline',
        principioActivo: 'Paracetamol + Clorfenamina + Fenilefrina',
        concentracion: '500mg/2mg/5mg',
        imagenUrl: 'https://images.unsplash.com/photo-1550572017-ed24c138f28c?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-005',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Analgésicos',
        nombreComercial: 'Ibuprofeno 400mg',
        sku: 'MED-IBU-400',
        precioVenta: 6.50,
        precioCaja: 6.50,
        precioBlister: 3.20,
        precioUnidad: 0.80,
        unidadesPorCaja: 20,
        unidadesPorBlister: 10,
        stockDisponible: 9,
        ubicacionAlmacen: 'P1-E3-N1',
        descripcion: 'Antiinflamatorio no esteroideo analgésico y antipirético.',
        estaActivo: true,
        requiereReceta: false,
        esControlado: false,
        laboratorio: 'Genérico',
        principioActivo: 'Ibuprofeno',
        concentracion: '400mg',
        imagenUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-006',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Vitaminas',
        nombreComercial: 'Vitamina C 1g Efervescente',
        sku: 'MED-VIT-001',
        precioVenta: 15.80,
        precioCaja: 15.80,
        precioBlister: 8.00,
        precioUnidad: 2.00,
        unidadesPorCaja: 10,
        unidadesPorBlister: 5,
        stockDisponible: 34,
        ubicacionAlmacen: 'P2-E1-N3',
        descripcion: 'Tabletas efervescentes sabor naranja para fortalecimiento inmunológico.',
        estaActivo: true,
        requiereReceta: false,
        esControlado: false,
        laboratorio: 'Bayer Redoxon',
        principioActivo: 'Ácido Ascórbico',
        concentracion: '1g',
        imagenUrl: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-007',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Antibióticos',
        nombreComercial: 'Amoxicilina Genfar 500mg',
        sku: 'MED-GEN-500',
        precioVenta: 12.50,
        precioCaja: 12.50,
        precioBlister: 6.00,
        precioUnidad: 1.50,
        unidadesPorCaja: 20,
        unidadesPorBlister: 10,
        stockDisponible: 125,
        ubicacionAlmacen: 'P1-E2-N1',
        descripcion: 'Cápsulas de amoxicilina antibiótica bactericida.',
        estaActivo: true,
        requiereReceta: false,
        esControlado: false,
        laboratorio: 'Genfar',
        principioActivo: 'Amoxicilina',
        concentracion: '500mg',
        imagenUrl: 'https://images.unsplash.com/photo-1576073719676-aa955fcabf2a?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-008',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: 'Analgésicos',
        nombreComercial: 'Doloral 400mg',
        sku: 'MED-DOL-400',
        precioVenta: 8.90,
        precioCaja: 8.90,
        precioBlister: 4.50,
        precioUnidad: 1.00,
        unidadesPorCaja: 20,
        unidadesPorBlister: 10,
        stockDisponible: 52,
        ubicacionAlmacen: 'P1-E3-N2',
        descripcion: 'Ibuprofeno en cápsulas blandas de rápida acción analgésica.',
        estaActivo: true,
        requiereReceta: true,
        esControlado: false,
        laboratorio: 'Laboratorios Bagó',
        principioActivo: 'Ibuprofeno',
        concentracion: '400mg',
        imagenUrl: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-009',
        tipoProducto: 'PERFUME',
        categoriaNombre: 'Perfumería Fina',
        nombreComercial: 'Sauvage Dior Eau de Parfum',
        sku: 'PERF-DIO-100',
        precioVenta: 489.00,
        precioCaja: 489.00,
        precioUnidad: 489.00,
        stockDisponible: 24,
        ubicacionAlmacen: 'Vitrina Central',
        descripcion: 'Fragancia oriental y fougère para hombre, notas de bergamota de Calabria y absoluto de vainilla.',
        estaActivo: true,
        marca: 'Christian Dior',
        familiaOlfativa: 'Amaderada',
        volumenMl: 100,
        generoObjetivo: 'HOMBRE',
        imagenUrl: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=400&auto=format&fit=crop&q=80'
      },
      {
        id: 'cat-010',
        tipoProducto: 'PERFUME',
        categoriaNombre: 'Perfumería Fina',
        nombreComercial: 'Good Girl Carolina Herrera EDP',
        sku: 'PERF-CH-080',
        precioVenta: 429.00,
        precioCaja: 429.00,
        precioUnidad: 429.00,
        stockDisponible: 18,
        ubicacionAlmacen: 'Vitrina Central',
        descripcion: 'Icónico frasco stiletto con notas de haba tonka tostada, nardo y jazmín sambac blanco.',
        estaActivo: true,
        marca: 'Carolina Herrera',
        familiaOlfativa: 'Oriental / Ámbar',
        volumenMl: 80,
        generoObjetivo: 'MUJER',
        imagenUrl: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=400&auto=format&fit=crop&q=80'
      }
    ];
  }

  private cargarCatalogoStorage(): ProductoCatalogoItem[] {
    try {
      const guardado = localStorage.getItem(this.STORAGE_KEY);
      if (guardado) {
        const parsed: ProductoCatalogoItem[] = JSON.parse(guardado);
        if (parsed && parsed.length > 0) {
          // Asignar imagen si algún ítem no tiene
          const semillas = this.getProductosSemilla();
          let modificado = false;
          parsed.forEach(p => {
            if (!p.imagenUrl) {
              const sem = semillas.find(s => s.nombreComercial.toLowerCase().includes(p.nombreComercial.toLowerCase()) || p.nombreComercial.toLowerCase().includes(s.nombreComercial.toLowerCase()));
              p.imagenUrl = sem ? sem.imagenUrl : 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400&auto=format&fit=crop&q=80';
              modificado = true;
            }
          });
          if (modificado) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));
          }
          return parsed;
        }
      }
      const iniciales = this.getProductosSemilla();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(iniciales));
      return iniciales;
    } catch {
      return this.getProductosSemilla();
    }
  }

  private persistirCatalogo(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.productosCatalogo));
    } catch (e) {
      console.error('Error persistiendo catálogo en storage:', e);
    }
  }

  // ==========================================
  // GESTIÓN DEL CATÁLOGO MAESTRO DE PRODUCTOS
  // ==========================================

  /**
   * Listar todos los productos del catálogo maestro
   */
  listarCatalogo(): Observable<ProductoCatalogoItem[]> {
    if (!this.productosCatalogo || this.productosCatalogo.length === 0) {
      this.productosCatalogo = this.cargarCatalogoStorage();
    }
    return of([...this.productosCatalogo]);
  }

  /**
   * Listar solo los productos activos del catálogo (para POS e Inventario)
   */
  listarCatalogoActivos(): Observable<ProductoCatalogoItem[]> {
    if (!this.productosCatalogo || this.productosCatalogo.length === 0) {
      this.productosCatalogo = this.cargarCatalogoStorage();
    }
    return of(this.productosCatalogo.filter(p => p.estaActivo));
  }

  /**
   * Obtener un producto específico por ID
   */
  obtenerProductoCatalogo(id: string): Observable<ProductoCatalogoItem | null> {
    if (!this.productosCatalogo || this.productosCatalogo.length === 0) {
      this.productosCatalogo = this.cargarCatalogoStorage();
    }
    const item = this.productosCatalogo.find(p => p.id === id) || null;
    return of(item ? { ...item } : null);
  }

  /**
   * Guardar o actualizar un producto en el catálogo maestro
   */
  guardarEnCatalogo(item: ProductoCatalogoItem): Observable<ProductoCatalogoItem> {
    if (!item.id) {
      item.id = 'cat-' + Date.now().toString().slice(-6);
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
    return of({ ...item });
  }

  /**
   * Eliminar un producto del catálogo maestro
   */
  eliminarDelCatalogo(id: string): Observable<boolean> {
    this.productosCatalogo = this.productosCatalogo.filter(p => p.id !== id);
    this.persistirCatalogo();
    return of(true);
  }

  /**
   * Búsqueda predictiva sobre el catálogo maestro (para POS, autocompletados, etc.)
   */
  buscarEnCatalogo(query?: string): Observable<ProductoCatalogoItem[]> {
    const items = this.productosCatalogo.filter(p => p.estaActivo);
    if (!query || !query.trim()) return of([...items]);
    const q = query.toLowerCase().trim();
    return of(items.filter(p =>
      p.nombreComercial.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.laboratorio && p.laboratorio.toLowerCase().includes(q)) ||
      (p.principioActivo && p.principioActivo.toLowerCase().includes(q)) ||
      (p.marca && p.marca.toLowerCase().includes(q)) ||
      (p.categoriaNombre && p.categoriaNombre.toLowerCase().includes(q)) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(q))
    ));
  }
}
