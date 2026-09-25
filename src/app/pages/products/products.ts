import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ProductService, ProductoCatalogoItem, TipoProducto } from '../../core/services/product.service';
import { CategoryService, CategoriaItem, mapIdTipoToTipoProducto, mapTipoProductoToIdTipo } from '../../core/services/category.service';
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
  private categoryService = inject(CategoryService);
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

  // Gestión de Categorías
  categorias: CategoriaItem[] = [];
  cargandoCategorias = false;
  mostrarModalCategorias = false; // Modal que contiene la tabla completa de categorías
  mostrarModalNuevaCategoria = false; // Modal rápido para agregar categoría desde el select
  mostrarFormularioNuevaCategoriaEnTabla = false; // Toggle para el formulario dentro de la tabla modal
  busquedaCategoriaTabla = '';
  filtroTipoCategoriaTabla: 'TODOS' | 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = 'TODOS';
  categoriaEnEdicionId: string | null = null;
  guardandoCategoria = false;
  categoriaForm: Partial<CategoriaItem> = {
    nombre: '',
    idtipoproducto: 1,
    tipoAsociado: 'MEDICAMENTO',
    descripcion: ''
  };

  // Filtros de la Grilla
  busquedaGrilla = '';
  filtroTipo: 'TODOS' | 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = 'TODOS';
  filtroCondicion: 'TODOS' | 'RECETA' | 'VENTA_LIBRE' = 'TODOS';
  filtroEstado: 'TODOS' | 'ACTIVO' | 'INACTIVO' = 'TODOS';
  filtroCategoria: string = 'TODOS';
  ordenarPor: 'NOMBRE_ASC' | 'NOMBRE_DESC' | 'PRECIO_ASC' | 'PRECIO_DESC' | 'CATEGORIA_ASC' = 'NOMBRE_ASC';

  // Búsqueda en tabla de recientes (vista nuevo)
  busquedaRecientes = '';

  // Paginación de la Grilla
  paginaActual = 1;
  itemsPorPagina = 8;

  ngOnInit(): void {
    this.detectarRutaActual();
    this.cargarCategorias();
    this.cargarProductos();

    // Escuchar cambios de ruta para alternar entre /productos, /productos/nuevo y /productos/editar/:id
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.detectarRutaActual();
      });
  }

  cargarCategorias(): void {
    this.cargandoCategorias = true;
    this.categoryService.listarCategorias().subscribe({
      next: (cats) => {
        this.categorias = cats;
        this.cargandoCategorias = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al cargar categorías:', err);
        this.cargandoCategorias = false;
        this.cdr.markForCheck();
      }
    });
  }

  cargarProductos(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.productService.listarCatalogo().subscribe({
      next: (items) => {
        this.productos = items;
        this.cargando = false;
        // Sincronizar categorías de productos existentes
        items.forEach(p => {
          if (p.categoriaNombre) {
            this.categoryService.asegurarCategoriaExiste(p.categoriaNombre, p.tipoProducto);
          }
        });
        this.cargarCategorias();
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
        categoriaNombre: 'Analgésicos',
        nombreComercial: '',
        sku: this.generarSkuAutomatico('MEDICAMENTO'),
        codigoBarra: '',
        precioVenta: 0,
        precioUnidad: 0,
        precioBlister: 0,
        precioCaja: 0,
        ubicacionAlmacen: '',
        descripcion: '',
        estaActivo: true,
        requiereReceta: false
      };
    } else if (tipo === 'PERFUME') {
      return {
        id: '',
        tipoProducto: 'PERFUME',
        categoriaNombre: 'Perfumería Fina',
        nombreComercial: '',
        sku: this.generarSkuAutomatico('PERFUME'),
        codigoBarra: '',
        precioVenta: 0,
        precioUnidad: 0,
        precioBlister: 0,
        precioCaja: 0,
        ubicacionAlmacen: '',
        descripcion: '',
        estaActivo: true,
        marca: '',
        generoObjetivo: 'UNISEX'
      };
    } else {
      return {
        id: '',
        tipoProducto: 'OTROS',
        categoriaNombre: 'Cuidado Personal / Higiene',
        nombreComercial: '',
        sku: this.generarSkuAutomatico('OTROS'),
        codigoBarra: '',
        precioVenta: 0,
        precioUnidad: 0,
        ubicacionAlmacen: '',
        descripcion: '',
        estaActivo: true,
        marca: ''
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
    const prefijo = tipo === 'MEDICAMENTO' ? 'MED' : (tipo === 'PERFUME' ? 'PERF' : 'OTR');
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
    } else if (this.tipoSeleccionado === 'OTROS') {
      const pUnidad = Number(this.productoForm.precioUnidad) || 0;
      const pCaja = Number(this.productoForm.precioCaja) || 0;
      const pVenta = Number(this.productoForm.precioVenta) || 0;

      if (pUnidad <= 0 && pCaja <= 0 && pVenta <= 0) {
        this.mostrarAlerta('error', 'Debe registrar al menos un precio de venta para el producto.');
        return;
      }

      this.productoForm.precioVenta = pUnidad > 0 ? pUnidad : (pCaja > 0 ? pCaja : pVenta);
      if (!this.productoForm.precioUnidad) this.productoForm.precioUnidad = this.productoForm.precioVenta;
      if (!this.productoForm.precioCaja) this.productoForm.precioCaja = this.productoForm.precioVenta;
      this.productoForm.precioBlister = 0;
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
    } else if (p.tipoProducto === 'OTROS') {
      const precio = p.precioVenta || p.precioUnidad || p.precioCaja || 0;
      if (!this.productoForm.precioVenta) this.productoForm.precioVenta = precio;
      if (!this.productoForm.precioUnidad) this.productoForm.precioUnidad = precio;
      if (!this.productoForm.precioCaja) this.productoForm.precioCaja = precio;
      this.productoForm.precioBlister = 0;
    }
    this.productoIdEnEdicion = p.id;
    this.vistaActual = 'EDITAR';
    this.router.navigate(['/productos/editar', p.id]);
    this.mostrarAlerta('info', `Editando ficha técnica de: ${p.nombreComercial}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  alternarEstadoProducto(p: ProductoCatalogoItem, event?: Event): void {
    if (event) event.stopPropagation();
    p.estaActivo = !p.estaActivo;
    this.productService.guardarEnCatalogo(p).subscribe({
      next: (actualizado) => {
        this.mostrarAlerta(actualizado.estaActivo ? 'success' : 'info',
          `Producto "${actualizado.nombreComercial}" ${actualizado.estaActivo ? 'activado' : 'desactivado'}.`);
        this.cdr.markForCheck();
      }
    });
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

  get totalOtros(): number {
    return this.productos.filter(p => p.tipoProducto === 'OTROS').length;
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

      // Filtro por Categoría
      if (this.filtroCategoria !== 'TODOS' && p.categoriaNombre !== this.filtroCategoria) {
        return false;
      }

      // Buscador predictivo general
      const q = this.busquedaGrilla.toLowerCase().trim();
      if (!q) return true;

      return (
        (p.nombreComercial && p.nombreComercial.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.codigoBarra && p.codigoBarra.toLowerCase().includes(q)) ||
        (p.laboratorio && p.laboratorio.toLowerCase().includes(q)) ||
        (p.marca && p.marca.toLowerCase().includes(q)) ||
        (p.categoriaNombre && p.categoriaNombre.toLowerCase().includes(q)) ||
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
      (p.codigoBarra && p.codigoBarra.toLowerCase().includes(q)) ||
      (p.marca && p.marca.toLowerCase().includes(q))
    );
  }

  limpiarFiltrosGrilla(): void {
    this.busquedaGrilla = '';
    this.filtroTipo = 'TODOS';
    this.filtroCondicion = 'TODOS';
    this.filtroEstado = 'TODOS';
    this.filtroCategoria = 'TODOS';
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

  // ==========================================
  // GESTIÓN DE CATEGORÍAS (SELECT & TABLA)
  // ==========================================

  get categoriasFiltradasParaForm(): CategoriaItem[] {
    return this.categorias.filter(c =>
      c.estaActiva !== false && (c.tipoAsociado === this.tipoSeleccionado || c.tipoAsociado === 'TODOS')
    );
  }

  estaEnCategoriasFiltradas(nombre: string): boolean {
    if (!nombre) return false;
    const n = nombre.toLowerCase().trim();
    return this.categoriasFiltradasParaForm.some(c => c.nombre.toLowerCase().trim() === n);
  }

  get categoriasTablaFiltradas(): CategoriaItem[] {
    return this.categorias.filter(c => {
      if (this.filtroTipoCategoriaTabla !== 'TODOS' && c.tipoAsociado !== this.filtroTipoCategoriaTabla && c.tipoAsociado !== 'TODOS') {
        return false;
      }
      const q = this.busquedaCategoriaTabla.toLowerCase().trim();
      if (!q) return true;
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.codigo && c.codigo.toLowerCase().includes(q)) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(q))
      );
    });
  }

  contarProductosPorCategoria(nombreCat: string): number {
    if (!nombreCat) return 0;
    const nom = nombreCat.toLowerCase().trim();
    return this.productos.filter(p => (p.categoriaNombre || '').toLowerCase().trim() === nom).length;
  }

  abrirModalGestionCategorias(abrirCreacionDirecta = false): void {
    this.mostrarModalCategorias = true;
    this.mostrarFormularioNuevaCategoriaEnTabla = abrirCreacionDirecta;
    this.categoriaEnEdicionId = null;
    const idTipo = mapTipoProductoToIdTipo(this.tipoSeleccionado);
    this.categoriaForm = {
      nombre: '',
      idtipoproducto: idTipo,
      tipoAsociado: this.tipoSeleccionado || 'MEDICAMENTO',
      descripcion: ''
    };
    this.cdr.markForCheck();
  }

  cerrarModalCategorias(): void {
    this.mostrarModalCategorias = false;
    this.mostrarFormularioNuevaCategoriaEnTabla = false;
    this.categoriaEnEdicionId = null;
    this.cdr.markForCheck();
  }

  abrirModalNuevaCategoriaRapida(): void {
    this.categoriaEnEdicionId = null;
    const idTipo = mapTipoProductoToIdTipo(this.tipoSeleccionado);
    this.categoriaForm = {
      nombre: '',
      idtipoproducto: idTipo,
      tipoAsociado: this.tipoSeleccionado || 'MEDICAMENTO',
      descripcion: ''
    };
    this.mostrarModalNuevaCategoria = true;
    this.cdr.markForCheck();
  }

  cerrarModalNuevaCategoriaRapida(): void {
    this.mostrarModalNuevaCategoria = false;
    this.cdr.markForCheck();
  }

  onTipoProductoModalChange(idTipo: any): void {
    const num = Number(idTipo);
    this.categoriaForm.idtipoproducto = num;
    this.categoriaForm.tipoAsociado = mapIdTipoToTipoProducto(num);
    this.cdr.markForCheck();
  }

  onCategoriaSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target && target.value === '__NUEVA_CATEGORIA__') {
      this.productoForm.categoriaNombre = '';
      this.abrirModalNuevaCategoriaRapida();
    }
  }

  guardarCategoriaDesdeModal(esModalRapido = false): void {
    const nom = (this.categoriaForm.nombre || '').trim();
    if (!nom) {
      this.mostrarAlerta('error', 'Por favor ingresa el nombre de la categoría.');
      return;
    }

    this.guardandoCategoria = true;
    this.cdr.markForCheck();

    const idTipo = this.categoriaForm.idtipoproducto !== undefined && this.categoriaForm.idtipoproducto !== null
      ? Number(this.categoriaForm.idtipoproducto)
      : mapTipoProductoToIdTipo(this.categoriaForm.tipoAsociado || this.tipoSeleccionado);

    const tipoDestino = mapIdTipoToTipoProducto(idTipo);

    const payload: Partial<CategoriaItem> = {
      id: this.categoriaEnEdicionId || undefined,
      nombre: nom,
      idtipoproducto: idTipo,
      tipoAsociado: tipoDestino,
      descripcion: (this.categoriaForm.descripcion || '').trim()
    };

    this.categoryService.guardarCategoria(payload).subscribe({
      next: (catGuardada) => {
        this.guardandoCategoria = false;

        // Actualizar o agregar inmediatamente en la lista local en memoria
        const idx = this.categorias.findIndex(c => c.id === catGuardada.id || c.nombre.toLowerCase().trim() === catGuardada.nombre.toLowerCase().trim());
        if (idx >= 0) {
          this.categorias[idx] = catGuardada;
        } else {
          this.categorias.unshift(catGuardada);
        }

        if (esModalRapido) {
          this.productoForm.categoriaNombre = catGuardada.nombre;
          this.cerrarModalNuevaCategoriaRapida();
          this.mostrarAlerta('success', `¡Categoría "${catGuardada.nombre}" registrada con éxito (idtipoproducto: ${catGuardada.idtipoproducto}) y autoseleccionada!`);
          this.cdr.markForCheck();

          // Asegurar autoselección en el select de la plantilla tras el ciclo de detección
          setTimeout(() => {
            this.productoForm.categoriaNombre = catGuardada.nombre;
            this.cdr.markForCheck();
          }, 50);
        } else {
          if (this.vistaActual !== 'GRILLA') {
            this.productoForm.categoriaNombre = catGuardada.nombre;
          }
          const idTipoActual = mapTipoProductoToIdTipo(this.tipoSeleccionado);
          this.categoriaForm = { nombre: '', idtipoproducto: idTipoActual, tipoAsociado: this.tipoSeleccionado, descripcion: '' };
          this.categoriaEnEdicionId = null;
          this.mostrarFormularioNuevaCategoriaEnTabla = false;
          this.mostrarAlerta('success', `¡Categoría "${catGuardada.nombre}" guardada con éxito (idtipoproducto: ${catGuardada.idtipoproducto})!`);
          this.cdr.markForCheck();
        }

        // Sincronizar catálogo de categorías completo en segundo plano
        this.cargarCategorias();
      },
      error: (err) => {
        console.error('Error al guardar categoría:', err);
        this.guardandoCategoria = false;
        this.mostrarAlerta('error', 'Ocurrió un error al guardar la categoría.');
        this.cdr.markForCheck();
      }
    });
  }

  editarCategoriaEnTabla(cat: CategoriaItem): void {
    this.categoriaEnEdicionId = cat.id;
    this.categoriaForm = {
      nombre: cat.nombre,
      tipoAsociado: cat.tipoAsociado,
      descripcion: cat.descripcion || ''
    };
    this.mostrarFormularioNuevaCategoriaEnTabla = true;
    this.cdr.markForCheck();
  }

  eliminarCategoriaEnTabla(cat: CategoriaItem): void {
    const totalVinculados = this.contarProductosPorCategoria(cat.nombre);
    const mensaje = totalVinculados > 0
      ? `Atención: Esta categoría tiene ${totalVinculados} producto(s) vinculado(s) en el catálogo. ¿Deseas eliminar "${cat.nombre}" de todos modos?`
      : `¿Estás seguro de eliminar la categoría "${cat.nombre}"?`;

    if (!confirm(mensaje)) return;

    this.categoryService.eliminarCategoria(cat.id).subscribe({
      next: () => {
        this.cargarCategorias();
        if (this.productoForm.categoriaNombre === cat.nombre) {
          this.productoForm.categoriaNombre = '';
        }
        this.mostrarAlerta('success', `Categoría "${cat.nombre}" eliminada correctamente.`);
        this.cdr.markForCheck();
      }
    });
  }

  seleccionarCategoriaDesdeTabla(cat: CategoriaItem): void {
    if (this.vistaActual === 'GRILLA') {
      this.filtroCategoria = cat.nombre;
      this.paginaActual = 1;
      this.cerrarModalCategorias();
      this.mostrarAlerta('info', `Filtro aplicado: Mostrando productos de categoría "${cat.nombre}".`);
    } else {
      this.productoForm.categoriaNombre = cat.nombre;
      this.cerrarModalCategorias();
      this.mostrarAlerta('success', `Categoría "${cat.nombre}" seleccionada para el producto.`);
    }
    this.cdr.markForCheck();
  }
}


