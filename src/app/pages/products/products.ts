import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ProductService, ProductoCatalogoItem, TipoProducto } from '../../core/services/product.service';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.html',
  styleUrls: ['./products.css']
})
export class Products implements OnInit {
  private productService = inject(ProductService);
  public storageService = inject(StorageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  // Subida de Imágenes en Supabase Storage
  subiendoImagen = false;
  errorSubidaImagen = '';

  // Vista actual: 'GRILLA' (listado con filtros), 'NUEVO' (creación) o 'EDITAR' (modificación)
  vistaActual: 'GRILLA' | 'NUEVO' | 'EDITAR' = 'GRILLA';
  productoIdEnEdicion: string | null = null;

  // Modo formulario: 'MEDICAMENTO' o 'PERFUME'
  tipoSeleccionado: TipoProducto = 'MEDICAMENTO';

  // Notificación Toast Soft
  mensajeToast: { tipo: 'success' | 'error' | 'info'; texto: string } | null = null;

  // Estado del formulario reactivo
  productoForm: ProductoCatalogoItem = this.getProductoDefault('MEDICAMENTO');

  // Listado de productos del catálogo
  productos: ProductoCatalogoItem[] = [];
  cargando = false;
  guardando = false;

  // Filtros de la Grilla
  busquedaGrilla = '';
  filtroTipo: 'TODOS' | 'MEDICAMENTO' | 'PERFUME' = 'TODOS';
  filtroCondicion: 'TODOS' | 'RECETA' | 'VENTA_LIBRE' = 'TODOS';
  filtroEstado: 'TODOS' | 'ACTIVO' | 'INACTIVO' = 'TODOS';
  ordenarPor: 'NOMBRE_ASC' | 'NOMBRE_DESC' | 'PRECIO_ASC' | 'PRECIO_DESC' | 'CATEGORIA_ASC' = 'NOMBRE_ASC';

  // Búsqueda en tabla de recientes (vista nuevo)
  busquedaRecientes = '';

  // Paginación de la Grilla
  paginaActual = 1;
  itemsPorPagina = 8;

  ngOnInit(): void {
    this.detectarRutaActual();
    this.cargarProductos();

    // Escuchar cambios de ruta para alternar entre /productos, /productos/nuevo y /productos/editar/:id
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.detectarRutaActual();
      });
  }

  cargarProductos(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.productService.listarCatalogo().subscribe({
      next: (items) => {
        this.productos = items;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al cargar catálogo:', err);
        this.cargando = false;
        this.cdr.markForCheck();
      }
    });
  }

  seleccionarTipo(tipo: TipoProducto): void {
    if (this.esEdicion) return; // Bloqueado en edición
    this.tipoSeleccionado = tipo;
    this.productoForm = this.getProductoDefault(tipo);
    this.cdr.markForCheck();
  }

  detectarRutaActual(): void {
    const url = this.router.url;
    if (url.includes('/editar/')) {
      this.vistaActual = 'EDITAR';
      const parts = url.split('/editar/');
      const id = parts[1]?.split('?')[0];
      if (id) {
        this.productoIdEnEdicion = id;
        if (!this.productoForm || this.productoForm.id !== id) {
          this.cargarProductoParaEdicion(id);
        }
      }
    } else if (url.includes('/nuevo') || url.includes('modo=nuevo')) {
      this.vistaActual = 'NUEVO';
      this.productoIdEnEdicion = null;
      if (this.productoForm && this.productoForm.id) {
        this.limpiarCampos(true);
      }
    } else {
      this.vistaActual = 'GRILLA';
      this.productoIdEnEdicion = null;
    }
    this.cdr.markForCheck();
  }

  cargarProductoParaEdicion(id: string): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.productService.obtenerProductoCatalogo(id).subscribe({
      next: (item) => {
        if (item) {
          this.productoForm = { ...item };
          this.tipoSeleccionado = item.tipoProducto;
          if (item.tipoProducto === 'PERFUME') {
            const precio = item.precioVenta || item.precioUnidad || item.precioCaja || 0;
            this.productoForm.precioVenta = precio;
            this.productoForm.precioUnidad = precio;
            this.productoForm.precioCaja = precio;
            this.productoForm.precioBlister = 0;
          }
          this.cargando = false;
          this.cdr.markForCheck();
        } else {
          this.productService.listarCatalogo().subscribe(items => {
            const encontrado = items.find(p => p.id === id);
            if (encontrado) {
              this.productoForm = { ...encontrado };
              this.tipoSeleccionado = encontrado.tipoProducto;
              if (encontrado.tipoProducto === 'PERFUME') {
                const precio = encontrado.precioVenta || encontrado.precioUnidad || encontrado.precioCaja || 0;
                this.productoForm.precioVenta = precio;
                this.productoForm.precioUnidad = precio;
                this.productoForm.precioCaja = precio;
                this.productoForm.precioBlister = 0;
              }
            } else {
              this.mostrarAlerta('error', 'El producto a editar no existe o fue eliminado.');
              this.volverAGrilla();
            }
            this.cargando = false;
            this.cdr.markForCheck();
          });
        }
      },
      error: () => {
        this.cargando = false;
        this.mostrarAlerta('error', 'Error al cargar el producto.');
        this.volverAGrilla();
      }
    });
  }

  irANuevoProducto(tipo?: TipoProducto): void {
    if (tipo) {
      this.tipoSeleccionado = tipo;
    }
    this.limpiarCampos(true);
    this.vistaActual = 'NUEVO';
    this.productoIdEnEdicion = null;
    this.router.navigate(['/productos/nuevo']);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  volverAGrilla(): void {
    this.vistaActual = 'GRILLA';
    this.productoIdEnEdicion = null;
    this.router.navigate(['/productos']);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  // Identifica si estamos editando un producto existente
  get esEdicion(): boolean {
    return this.vistaActual === 'EDITAR' || !!(this.productoForm && this.productoForm.id);
  }

  getProductoDefault(tipo: TipoProducto): ProductoCatalogoItem {
    if (tipo === 'MEDICAMENTO') {
      return {
        id: '',
        tipoProducto: 'MEDICAMENTO',
        categoriaNombre: '',
        nombreComercial: '',
        sku: this.generarSkuAutomatico('MEDICAMENTO'),
        precioVenta: 0,
        precioUnidad: 0,
        precioBlister: 0,
        precioCaja: 0,
        ubicacionAlmacen: '',
        descripcion: '',
        estaActivo: true,
        requiereReceta: false
      };
    } else {
      return {
        id: '',
        tipoProducto: 'PERFUME',
        categoriaNombre: '',
        nombreComercial: '',
        sku: this.generarSkuAutomatico('PERFUME'),
        precioVenta: 0,
        precioUnidad: 0,
        precioBlister: 0,
        precioCaja: 0,
        ubicacionAlmacen: '',
        descripcion: '',
        estaActivo: true,
        marca: '',
        familiaOlfativa: 'Amaderado Aromático',
        volumenMl: 100,
        generoObjetivo: 'UNISEX'
      };
    }
  }

  limpiarCampos(silencioso = false): void {
    this.productoForm = this.getProductoDefault(this.tipoSeleccionado);
    this.errorSubidaImagen = '';
    if (!silencioso) {
      this.mostrarAlerta('info', 'Formulario limpiado. Listo para registrar un nuevo producto.');
    }
    this.cdr.markForCheck();
  }

  async onArchivoImagenSeleccionado(event: any): Promise<void> {
    const file = event.target?.files?.[0];
    if (!file) return;

    this.subiendoImagen = true;
    this.errorSubidaImagen = '';
    this.cdr.markForCheck();

    const res = await this.storageService.subirImagenProducto(file, this.productoForm.sku || 'prod');
    this.subiendoImagen = false;

    if (res.error) {
      this.errorSubidaImagen = res.error;
      this.mostrarAlerta('error', res.error);
    } else if (res.url) {
      this.productoForm.imagenUrl = res.url;
      this.mostrarAlerta('success', 'Imagen subida exitosamente a Supabase Storage (1 GB).');
    }
    this.cdr.markForCheck();
  }

  quitarImagen(): void {
    this.productoForm.imagenUrl = '';
    this.cdr.markForCheck();
  }

  generarSkuAutomatico(tipo: TipoProducto): string {
    const prefijo = tipo === 'MEDICAMENTO' ? 'MED' : 'PERF';
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefijo}-${rand}`;
  }

  onPrecioPerfumeChange(valor: any): void {
    const p = Number(valor) || 0;
    this.productoForm.precioVenta = p;
    this.productoForm.precioUnidad = p;
    this.productoForm.precioCaja = p;
    this.productoForm.precioBlister = 0;
    this.cdr.markForCheck();
  }

  guardarProducto(): void {
    const nombre = this.productoForm.nombreComercial?.trim();
    const sku = this.productoForm.sku?.trim();

    if (!nombre) {
      this.mostrarAlerta('error', 'El nombre comercial del producto es obligatorio.');
      return;
    }

    if (!sku) {
      this.mostrarAlerta('error', 'El código SKU es obligatorio.');
      return;
    }

    // Validación y asignación según el tipo de producto
    if (this.tipoSeleccionado === 'PERFUME') {
      const pPerfume = Number(this.productoForm.precioVenta) || Number(this.productoForm.precioUnidad) || Number(this.productoForm.precioCaja) || 0;
      if (pPerfume <= 0) {
        this.mostrarAlerta('error', 'Debe registrar el precio de venta del perfume.');
        return;
      }
      this.productoForm.precioVenta = pPerfume;
      this.productoForm.precioUnidad = pPerfume;
      this.productoForm.precioCaja = pPerfume;
      this.productoForm.precioBlister = 0;

      if (!this.productoForm.marca?.trim()) {
        this.mostrarAlerta('error', 'Por favor complete la Marca / Casa perfumista del producto.');
        return;
      }
    } else {
      const pUnidad = Number(this.productoForm.precioUnidad) || 0;
      const pBlister = Number(this.productoForm.precioBlister) || 0;
      const pCaja = Number(this.productoForm.precioCaja) || 0;
      const pVenta = Number(this.productoForm.precioVenta) || 0;

      if (pUnidad <= 0 && pBlister <= 0 && pCaja <= 0 && pVenta <= 0) {
        this.mostrarAlerta('error', 'Debe registrar al menos un precio de venta (por unidad, blíster o caja).');
        return;
      }

      // Sincronizar precio principal de referencia
      this.productoForm.precioVenta = pUnidad > 0 ? pUnidad : (pCaja > 0 ? pCaja : pBlister);
    }

    const esEdit = this.esEdicion;
    this.guardando = true;
    this.cdr.markForCheck();

    this.productoForm.tipoProducto = this.tipoSeleccionado;
    this.productService.guardarEnCatalogo(this.productoForm).subscribe({
      next: (guardado) => {
        this.guardando = false;
        const msg = esEdit
          ? `Producto "${guardado.nombreComercial}" actualizado exitosamente.`
          : `Producto "${guardado.nombreComercial}" guardado exitosamente en el catálogo.`;
        this.mostrarAlerta('success', msg);
        this.cargarProductos();
        this.volverAGrilla();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al guardar producto:', err);
        this.guardando = false;
        this.mostrarAlerta('error', 'Ocurrió un error al guardar el producto en el catálogo.');
        this.cdr.markForCheck();
      }
    });
  }

  editarProducto(p: ProductoCatalogoItem): void {
    this.tipoSeleccionado = p.tipoProducto;
    this.productoForm = { ...p };
    if (p.tipoProducto === 'PERFUME') {
      const precio = p.precioVenta || p.precioUnidad || p.precioCaja || 0;
      this.productoForm.precioVenta = precio;
      this.productoForm.precioUnidad = precio;
      this.productoForm.precioCaja = precio;
      this.productoForm.precioBlister = 0;
    }
    this.productoIdEnEdicion = p.id;
    this.vistaActual = 'EDITAR';
    this.router.navigate(['/productos/editar', p.id]);
    this.mostrarAlerta('info', `Editando ficha técnica de: ${p.nombreComercial}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  eliminarProducto(p: ProductoCatalogoItem): void {
    if (!confirm(`¿Estás seguro de eliminar "${p.nombreComercial}" del catálogo?`)) return;

    this.productService.eliminarDelCatalogo(p.id).subscribe({
      next: () => {
        this.mostrarAlerta('success', `Producto "${p.nombreComercial}" eliminado del catálogo.`);
        this.cargarProductos();
        this.cdr.markForCheck();
      }
    });
  }

  mostrarAlerta(tipo: 'success' | 'error' | 'info', texto: string): void {
    this.mensajeToast = { tipo, texto };
    this.cdr.markForCheck();
    setTimeout(() => {
      if (this.mensajeToast?.texto === texto) {
        this.mensajeToast = null;
        this.cdr.markForCheck();
      }
    }, 4000);
  }

  // KPIs y Contadores
  get totalProductos(): number {
    return this.productos.length;
  }

  get totalMedicamentos(): number {
    return this.productos.filter(p => p.tipoProducto === 'MEDICAMENTO').length;
  }

  get totalPerfumes(): number {
    return this.productos.filter(p => p.tipoProducto === 'PERFUME').length;
  }

  get totalConReceta(): number {
    return this.productos.filter(p => p.tipoProducto === 'MEDICAMENTO' && p.requiereReceta).length;
  }

  get totalVentaLibre(): number {
    return this.productos.filter(p => !p.requiereReceta).length;
  }

  // Filtrado y ordenamiento de la Grilla Principal
  get productosGrillaFiltrados(): ProductoCatalogoItem[] {
    let result = this.productos.filter(p => {
      // Filtro por Tipo
      if (this.filtroTipo !== 'TODOS' && p.tipoProducto !== this.filtroTipo) {
        return false;
      }

      // Filtro por Condición de Venta / Receta
      if (this.filtroCondicion === 'RECETA' && !(p.tipoProducto === 'MEDICAMENTO' && p.requiereReceta)) {
        return false;
      }
      if (this.filtroCondicion === 'VENTA_LIBRE' && (p.tipoProducto === 'MEDICAMENTO' && p.requiereReceta)) {
        return false;
      }

      // Filtro por Estado
      if (this.filtroEstado === 'ACTIVO' && !p.estaActivo) return false;
      if (this.filtroEstado === 'INACTIVO' && p.estaActivo) return false;

      // Buscador predictivo general
      const q = this.busquedaGrilla.toLowerCase().trim();
      if (!q) return true;

      return (
        (p.nombreComercial && p.nombreComercial.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.laboratorio && p.laboratorio.toLowerCase().includes(q)) ||
        (p.marca && p.marca.toLowerCase().includes(q)) ||
        (p.principioActivo && p.principioActivo.toLowerCase().includes(q)) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        (p.familiaOlfativa && p.familiaOlfativa.toLowerCase().includes(q)) ||
        (p.ubicacionAlmacen && p.ubicacionAlmacen.toLowerCase().includes(q))
      );
    });

    // Ordenamiento
    switch (this.ordenarPor) {
      case 'NOMBRE_ASC':
        result.sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));
        break;
      case 'NOMBRE_DESC':
        result.sort((a, b) => b.nombreComercial.localeCompare(a.nombreComercial));
        break;
      case 'PRECIO_ASC':
        result.sort((a, b) => (a.precioVenta || 0) - (b.precioVenta || 0));
        break;
      case 'PRECIO_DESC':
        result.sort((a, b) => (b.precioVenta || 0) - (a.precioVenta || 0));
        break;
      case 'CATEGORIA_ASC':
        result.sort((a, b) => (a.categoriaNombre || '').localeCompare(b.categoriaNombre || ''));
        break;
    }

    return result;
  }

  // Lista reciente para la vista de nuevo registro
  get productosRecientes(): ProductoCatalogoItem[] {
    return this.productos.slice(0, 5);
  }

  get productosRecientesFiltrados(): ProductoCatalogoItem[] {
    const q = this.busquedaRecientes.toLowerCase().trim();
    if (!q) return this.productosRecientes;
    return this.productosRecientes.filter(p =>
      p.nombreComercial.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.marca && p.marca.toLowerCase().includes(q))
    );
  }

  limpiarFiltrosGrilla(): void {
    this.busquedaGrilla = '';
    this.filtroTipo = 'TODOS';
    this.filtroCondicion = 'TODOS';
    this.filtroEstado = 'TODOS';
    this.ordenarPor = 'NOMBRE_ASC';
    this.paginaActual = 1;
    this.cdr.markForCheck();
  }

  // Paginación y Totales para la Grilla Estilo Medicare
  get totalPaginas(): number {
    return Math.ceil(this.productosGrillaFiltrados.length / this.itemsPorPagina) || 1;
  }

  get productosPaginados(): ProductoCatalogoItem[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.productosGrillaFiltrados.slice(inicio, inicio + this.itemsPorPagina);
  }

  get totalPrecioGeneral(): number {
    return this.productosGrillaFiltrados.reduce((acc, p) => acc + (p.precioVenta || 0), 0);
  }

  cambiarPagina(pag: number): void {
    if (pag >= 1 && pag <= this.totalPaginas) {
      this.paginaActual = pag;
      this.cdr.markForCheck();
    }
  }

  alternarOrden(criterio: 'NOMBRE' | 'PRECIO' | 'CATEGORIA'): void {
    if (criterio === 'NOMBRE') {
      this.ordenarPor = this.ordenarPor === 'NOMBRE_ASC' ? 'NOMBRE_DESC' : 'NOMBRE_ASC';
    } else if (criterio === 'PRECIO') {
      this.ordenarPor = this.ordenarPor === 'PRECIO_ASC' ? 'PRECIO_DESC' : 'PRECIO_ASC';
    } else if (criterio === 'CATEGORIA') {
      this.ordenarPor = this.ordenarPor === 'CATEGORIA_ASC' ? 'NOMBRE_ASC' : 'CATEGORIA_ASC';
    }
    this.paginaActual = 1;
    this.cdr.markForCheck();
  }
}


