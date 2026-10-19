import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
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
export class Products implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  public storageService = inject(StorageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private routerSub?: Subscription;

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

  // Modal de confirmación para eliminar de la base de datos (Tacho)
  mostrarModalEliminar = false;
  productoAEliminar: ProductoCatalogoItem | null = null;
  eliminandoProducto = false;

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

  // Gestión de Laboratorios
  laboratorios: { id: string; nombre: string; pais?: string }[] = [];
  cargandoLaboratorios = false;

  // Filtros de la Grilla
  busquedaGrilla = '';
  filtroTipo: 'TODOS' | 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = 'TODOS';
  filtroCondicion: 'TODOS' | 'RECETA' | 'VENTA_LIBRE' = 'TODOS';
  filtroEstado: 'TODOS' | 'ACTIVO' | 'INACTIVO' = 'TODOS';
  filtroCategoria: string = 'TODOS';
  ordenarPor: 'NOMBRE_ASC' | 'NOMBRE_DESC' | 'PRECIO_ASC' | 'PRECIO_DESC' | 'CATEGORIA_ASC' | 'LABORATORIO_ASC' = 'NOMBRE_ASC';

  // Búsqueda en tabla de recientes (vista nuevo)
  busquedaRecientes = '';

  // Paginación de la Grilla
  paginaActual = 1;
  itemsPorPagina = 8;

  ngOnInit(): void {
    this.detectarRutaActual();
    this.cargarCategorias();
    this.cargarLaboratorios();
    this.cargarProductos();

    // Escuchar cambios de ruta para alternar entre /productos, /productos/nuevo y /productos/editar/:id
    this.routerSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.detectarRutaActual();
      });
  }

  ngOnDestroy(): void {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
  }

  cargarLaboratorios(): void {
    this.cargandoLaboratorios = true;
    this.productService.listarLaboratorios().subscribe({
      next: (labs) => {
        this.laboratorios = labs;
        this.cargandoLaboratorios = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al cargar laboratorios:', err);
        this.cargandoLaboratorios = false;
        this.cdr.markForCheck();
      }
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
    // CRUCIAL: Solo reaccionar si la URL pertenece efectivamente al módulo de productos
    if (!url.startsWith('/productos') && !url.startsWith('/products')) {
      return;
    }

    if (url.includes('/productos/editar/') || url.includes('/products/editar/')) {
      this.vistaActual = 'EDITAR';
      const parts = url.split('/editar/');
      const id = parts[1]?.split('?')[0];
      if (id) {
        this.productoIdEnEdicion = id;
        if (!this.productoForm || String(this.productoForm.id) !== String(id)) {
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
    // Si no estamos en la ruta de editar productos, abortar
    const currentUrl = this.router.url;
    if (!currentUrl.startsWith('/productos/editar/') && !currentUrl.startsWith('/products/editar/')) {
      return;
    }

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
            const encontrado = items.find(p => String(p.id) === String(id));
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
              // Solo mostrar alerta y volver si efectivamente seguimos en la ruta de editar productos
              if (this.router.url.startsWith('/productos/editar/') || this.router.url.startsWith('/products/editar/')) {
                this.mostrarAlerta('error', 'El producto a editar no existe o fue eliminado.');
                this.volverAGrilla();
              }
            }
            this.cargando = false;
            this.cdr.markForCheck();
          });
        }
      },
      error: () => {
        this.cargando = false;
        if (this.router.url.startsWith('/productos/editar/') || this.router.url.startsWith('/products/editar/')) {
          this.mostrarAlerta('error', 'Error al cargar el producto.');
          this.volverAGrilla();
        }
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
        requiereReceta: false,
        laboratorio: '',
        laboratorioId: null
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
    
    // Conjunto de todos los SKUs existentes para evitar colisiones
    const skusExistentes = new Set(
      (this.productos || [])
        .concat(this.productService.productosCatalogo || [])
        .map(p => (p.sku || '').toUpperCase().trim())
        .filter(s => !!s)
    );

    // Encontrar el número secuencial más alto disponible (inicia en 1000)
    let numSiguiente = 1000;
    skusExistentes.forEach(s => {
      if (s.startsWith(prefijo + '-')) {
        const numPart = parseInt(s.replace(prefijo + '-', ''), 10);
        if (!isNaN(numPart) && numPart >= numSiguiente && numPart < 99000) {
          numSiguiente = numPart + 1;
        }
      }
    });

    let candidato = `${prefijo}-${numSiguiente}`;
    while (skusExistentes.has(candidato)) {
      numSiguiente++;
      candidato = `${prefijo}-${numSiguiente}`;
    }
    return candidato;
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

    // Validar preventivamente duplicados de SKU en memoria local
    const skuDuplicado = (this.productos || []).find(p =>
      p.sku?.toUpperCase().trim() === sku.toUpperCase().trim() &&
      String(p.id) !== String(this.productoForm.id)
    );
    if (skuDuplicado) {
      this.mostrarAlerta(
        'error',
        `El código SKU "${sku}" ya pertenece a "${skuDuplicado.nombreComercial}". Haz clic en el botón "Auto" para generar un código único.`
      );
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
      if (!this.productoForm.laboratorio?.trim()) {
        this.mostrarAlerta('error', 'Por favor especifique o seleccione el Laboratorio Fabricante.');
        return;
      }

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
        const skuInfo = guardado.sku !== sku ? ` (SKU asignado: ${guardado.sku})` : '';
        const msg = esEdit
          ? `Producto "${guardado.nombreComercial}" actualizado exitosamente${skuInfo}.`
          : `Producto "${guardado.nombreComercial}" guardado exitosamente en el catálogo${skuInfo}.`;
        this.mostrarAlerta('success', msg);
        this.cargarProductos();
        this.cargarLaboratorios();
        this.volverAGrilla();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al guardar producto:', err);
        this.guardando = false;
        if (err?.code === '23505' || err?.message?.includes('codigo_interno') || err?.details?.includes('codigo_interno')) {
          this.mostrarAlerta(
            'error',
            `El código SKU "${sku}" ya está registrado en la base de datos de Supabase. Haz clic en "Auto" para generar un SKU único.`
          );
        } else {
          this.mostrarAlerta('error', `Error al guardar en la base de datos: ${err?.message || 'Error desconocido'}`);
        }
        this.cdr.markForCheck();
      }
    });
  }

  onLaboratorioChange(event?: any): void {
    const val = (this.productoForm.laboratorio || '').trim();
    if (val) {
      const encontrado = this.laboratorios.find(l => l.nombre.toLowerCase().trim() === val.toLowerCase());
      if (encontrado) {
        this.productoForm.laboratorioId = encontrado.id;
        this.productoForm.laboratorio = encontrado.nombre;
      } else {
        this.productoForm.laboratorioId = null;
      }
    } else {
      this.productoForm.laboratorioId = null;
    }
    this.cdr.markForCheck();
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
    // Asegurar categoriaId
    if (!this.productoForm.categoriaId && this.productoForm.categoriaNombre) {
      const encontrada = this.categorias.find(c => c.nombre.toLowerCase().trim() === this.productoForm.categoriaNombre?.toLowerCase().trim());
      if (encontrada) {
        this.productoForm.categoriaId = encontrada.id;
      }
    }
    // Asegurar laboratorio y laboratorioId
    this.productoForm.laboratorio = p.laboratorio || '';
    this.productoForm.laboratorioId = p.laboratorioId || null;
    if (!this.productoForm.laboratorioId && this.productoForm.laboratorio) {
      const lab = this.laboratorios.find(l => l.nombre.toLowerCase().trim() === this.productoForm.laboratorio?.toLowerCase().trim());
      if (lab) {
        this.productoForm.laboratorioId = lab.id;
      }
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
    const nuevoEstado = !p.estaActivo;
    this.productService.cambiarEstadoProducto(p.id, nuevoEstado).subscribe({
      next: (ok) => {
        if (ok) {
          p.estaActivo = nuevoEstado;
          this.mostrarAlerta(
            nuevoEstado ? 'success' : 'info',
            `Producto "${p.nombreComercial}" ${nuevoEstado ? 'activado' : 'desactivado'}.`
          );
        } else {
          this.mostrarAlerta('error', `No se pudo cambiar el estado de "${p.nombreComercial}".`);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.mostrarAlerta('error', `Error de conexión al cambiar el estado.`);
        this.cdr.markForCheck();
      }
    });
  }

  // ==========================================
  // GESTIÓN DEL TACHO / ELIMINAR DE BASE DE DATOS
  // ==========================================

  abrirModalEliminar(p: ProductoCatalogoItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.productoAEliminar = p;
    this.mostrarModalEliminar = true;
    this.cdr.markForCheck();
  }

  cancelarEliminar(): void {
    if (this.eliminandoProducto) return;
    this.mostrarModalEliminar = false;
    this.productoAEliminar = null;
    this.cdr.markForCheck();
  }

  confirmarEliminarDeBaseDatos(): void {
    if (!this.productoAEliminar || !this.productoAEliminar.id) return;
    const prod = this.productoAEliminar;
    this.eliminandoProducto = true;
    this.cdr.markForCheck();

    this.productService.eliminarDelCatalogo(prod.id).subscribe({
      next: (eliminado) => {
        this.eliminandoProducto = false;
        this.mostrarModalEliminar = false;
        if (eliminado) {
          // Remover inmediatamente del listado en memoria y grilla
          this.productos = this.productos.filter(item => item.id !== prod.id);
          if (this.paginaActual > 1 && this.productosPaginados.length === 0) {
            this.paginaActual--;
          }
          this.mostrarAlerta(
            'success',
            `¡Producto "${prod.nombreComercial}" eliminado definitivamente de la base de datos de Supabase!`
          );
          if (this.vistaActual !== 'GRILLA') {
            this.volverAGrilla();
          }
        } else {
          this.mostrarAlerta('error', `No se pudo eliminar "${prod.nombreComercial}" de la base de datos.`);
        }
        this.productoAEliminar = null;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al eliminar producto de BD:', err);
        this.eliminandoProducto = false;
        this.mostrarModalEliminar = false;
        this.productoAEliminar = null;
        this.mostrarAlerta('error', `Error de conexión al eliminar el producto de la base de datos.`);
        this.cdr.markForCheck();
      }
    });
  }

  eliminarProducto(p: ProductoCatalogoItem): void {
    this.abrirModalEliminar(p);
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

  get totalActivos(): number {
    return this.productos.filter(p => p.estaActivo).length;
  }

  get totalDesactivados(): number {
    return this.productos.filter(p => !p.estaActivo).length;
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
      case 'LABORATORIO_ASC':
        result.sort((a, b) => (a.laboratorio || a.marca || '').localeCompare(b.laboratorio || b.marca || ''));
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

  alternarOrden(criterio: 'NOMBRE' | 'PRECIO' | 'CATEGORIA' | 'LABORATORIO'): void {
    if (criterio === 'NOMBRE') {
      this.ordenarPor = this.ordenarPor === 'NOMBRE_ASC' ? 'NOMBRE_DESC' : 'NOMBRE_ASC';
    } else if (criterio === 'PRECIO') {
      this.ordenarPor = this.ordenarPor === 'PRECIO_ASC' ? 'PRECIO_DESC' : 'PRECIO_ASC';
    } else if (criterio === 'CATEGORIA') {
      this.ordenarPor = this.ordenarPor === 'CATEGORIA_ASC' ? 'NOMBRE_ASC' : 'CATEGORIA_ASC';
    } else if (criterio === 'LABORATORIO') {
      this.ordenarPor = this.ordenarPor === 'LABORATORIO_ASC' ? 'NOMBRE_ASC' : 'LABORATORIO_ASC';
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
      this.productoForm.categoriaId = undefined;
      this.abrirModalNuevaCategoriaRapida();
      return;
    }
    const selNombre = (target?.value || this.productoForm.categoriaNombre || '').trim();
    if (selNombre) {
      const encontrada = this.categorias.find(c => c.nombre.toLowerCase().trim() === selNombre.toLowerCase());
      if (encontrada) {
        this.productoForm.categoriaId = encontrada.id;
        this.productoForm.categoriaNombre = encontrada.nombre;
      }
    }
  }

  guardarCategoriaDesdeModal(esModalRapido = false): void {
    const nom = (this.categoriaForm.nombre || '').trim();
    if (!nom) {
      this.mostrarAlerta('error', 'Por favor ingresa el nombre de la categoría.');
      return;
    }

    // Verificar si ya existe una categoría con este nombre
    const catExistente = this.categorias.find(c => c.nombre.toLowerCase().trim() === nom.toLowerCase());
    if (esModalRapido && catExistente) {
      this.productoForm.categoriaNombre = catExistente.nombre;
      this.productoForm.categoriaId = catExistente.id;
      this.cerrarModalNuevaCategoriaRapida();
      this.mostrarAlerta('info', `La categoría "${catExistente.nombre}" ya existe en el catálogo y ha sido autoseleccionada.`);
      this.cdr.markForCheck();
      return;
    }

    this.guardandoCategoria = true;
    this.cdr.markForCheck();

    const idTipo = this.categoriaForm.idtipoproducto !== undefined && this.categoriaForm.idtipoproducto !== null
      ? Number(this.categoriaForm.idtipoproducto)
      : mapTipoProductoToIdTipo(this.categoriaForm.tipoAsociado || this.tipoSeleccionado);

    const tipoDestino = mapIdTipoToTipoProducto(idTipo);

    const payload: Partial<CategoriaItem> = {
      id: this.categoriaEnEdicionId || catExistente?.id || undefined,
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
          this.productoForm.categoriaId = catGuardada.id;
          this.cerrarModalNuevaCategoriaRapida();
          this.mostrarAlerta('success', `¡Categoría "${catGuardada.nombre}" registrada con éxito (idtipoproducto: ${catGuardada.idtipoproducto}) y autoseleccionada!`);
          this.cdr.markForCheck();

          // Asegurar autoselección en el select de la plantilla tras el ciclo de detección
          setTimeout(() => {
            this.productoForm.categoriaNombre = catGuardada.nombre;
            this.productoForm.categoriaId = catGuardada.id;
            this.cdr.markForCheck();
          }, 50);
        } else {
          if (this.vistaActual !== 'GRILLA') {
            this.productoForm.categoriaNombre = catGuardada.nombre;
            this.productoForm.categoriaId = catGuardada.id;
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
        if (err?.code === '23505' || err?.message?.includes('nombre') || err?.details?.includes('nombre')) {
          this.mostrarAlerta('error', `Ya existe una categoría registrada con el nombre "${nom}".`);
        } else {
          this.mostrarAlerta('error', 'Ocurrió un error al guardar la categoría.');
        }
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
      this.productoForm.categoriaId = cat.id;
      this.cerrarModalCategorias();
      this.mostrarAlerta('success', `Categoría "${cat.nombre}" seleccionada para el producto.`);
    }
    this.cdr.markForCheck();
  }
}


