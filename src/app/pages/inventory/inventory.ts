import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService, LoteItem, ActaBaja } from '../../core/services/inventory.service';
import { ProductService, ProductoCatalogoItem } from '../../core/services/product.service';

export interface ItemLoteTemporal {
  productoId: string;
  productoNombre: string;
  tipoProducto: 'MEDICAMENTO' | 'PERFUME' | 'OTROS';
  sku: string;
  principioActivo?: string;
  laboratorio?: string;
  stock: number;
  vencimiento: string;
  pasillo?: string;
  estante?: string;
  nivel?: string;
  gaveta?: string;
  ubicacion?: string;
  registroSanitario?: string;
  temperatura?: string;
  concentracionFragancia?: string;
  volumenMl?: number;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.html'
})
export class Inventory implements OnInit {
  public authService = inject(AuthService);
  private inventoryService = inject(InventoryService);
  private productService = inject(ProductService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  // Vista actual: 'LISTADO' o 'NUEVO_LOTE'
  vistaActual: 'LISTADO' | 'NUEVO_LOTE' = 'LISTADO';

  cargando = false;
  lotesFefo: LoteItem[] = [];
  productosCatalogo: ProductoCatalogoItem[] = [];
  actasRegistradas: ActaBaja[] = [];

  // ================= FILTROS Y BÚSQUEDA =================
  busqueda = '';
  filtroTipoProducto: 'TODOS' | 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = 'TODOS';
  filtroEstado = 'TODOS'; // 'TODOS' | 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'VENCIDO'
  filtroCondicion = 'TODOS'; // 'TODOS' | 'Ambiente' | '2°C a 8°C (Cadena Frío)' | 'Lugar Fresco y Seco' | 'Caja de Seguridad'
  ordenarPor: 'FEFO_ASC' | 'FEFO_DESC' | 'PRODUCTO_ASC' | 'STOCK_DESC' | 'STOCK_ASC' = 'FEFO_ASC';

  // ================= PAGINACIÓN =================
  paginaActual = 1;
  itemsPorPagina = 10;

  // ================= MODAL LOTE MAESTRO-DETALLE (NUEVO / EDITAR) =================
  showLoteModal = false;
  modoModalLote: 'NUEVO' | 'EDITAR' = 'NUEVO';
  loteEnEdicionId: string | number | null = null;

  // Cabecera General del Lote (Compartido por todos los productos)
  loteCabecera = {
    lote: '',
    guiaReferencia: '',
    fechaIngreso: new Date().toISOString().split('T')[0]
  };

  // Lista de Productos en el Lote (Temporal antes de guardar todo en bloque)
  productosEnLoteTemporal: ItemLoteTemporal[] = [];

  // Formulario de agregar un producto al lote
  loteForm = {
    productoId: '',
    lote: '',
    vencimiento: '',
    stock: 50,
    ubicacion: '',
    pasillo: '',
    estante: '',
    nivel: '',
    gaveta: '',
    registroSanitario: '',
    temperatura: 'Ambiente',
    // Campos específicos para fragancias y perfumes
    concentracionFragancia: 'Eau de Parfum (EDP)',
    volumenMl: 100
  };
  errorModalLote = '';

  // Buscador de autocompletado para seleccionar producto
  busquedaProductoCatalogo = '';
  mostrarDropdownProductos = false;
  mostrarBuscadorProducto = false;

  get productosFiltradosParaLote(): ProductoCatalogoItem[] {
    if (!this.busquedaProductoCatalogo.trim()) {
      return this.productosCatalogo.slice(0, 30);
    }
    const q = this.busquedaProductoCatalogo.toLowerCase().trim();
    return this.productosCatalogo.filter(p =>
      (p.nombreComercial && p.nombreComercial.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.codigoBarra && p.codigoBarra.toLowerCase().includes(q)) ||
      (p.principioActivo && p.principioActivo.toLowerCase().includes(q)) ||
      (p.laboratorio && p.laboratorio.toLowerCase().includes(q)) ||
      (p.marca && p.marca.toLowerCase().includes(q))
    ).slice(0, 30);
  }

  seleccionarProductoCatalogo(prod: ProductoCatalogoItem) {
    this.loteForm.productoId = prod.id;
    this.busquedaProductoCatalogo = `${prod.nombreComercial}${prod.concentracion ? ' ' + prod.concentracion : ''}`;
    this.mostrarDropdownProductos = false;
    this.mostrarBuscadorProducto = false;
    this.onProductoChange();
  }

  abrirBuscadorProducto() {
    this.mostrarBuscadorProducto = true;
    this.mostrarDropdownProductos = true;
    this.busquedaProductoCatalogo = '';
  }

  cerrarDropdownProductos() {
    this.mostrarDropdownProductos = false;
    if (this.loteForm.productoId) {
      this.mostrarBuscadorProducto = false;
    }
  }

  limpiarBusquedaProducto() {
    this.busquedaProductoCatalogo = '';
    this.mostrarDropdownProductos = true;
  }

  get productoSeleccionado(): ProductoCatalogoItem | undefined {
    return this.productosCatalogo.find(p => p.id === this.loteForm.productoId);
  }

  get esProductoPerfume(): boolean {
    return this.productoSeleccionado?.tipoProducto === 'PERFUME';
  }

  get esProductoOtros(): boolean {
    return this.productoSeleccionado?.tipoProducto === 'OTROS';
  }

  get totalUnidadesEnLoteTemporal(): number {
    return this.productosEnLoteTemporal.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  }

  onProductoChange() {
    const prod = this.productoSeleccionado;
    if (prod && prod.tipoProducto === 'PERFUME') {
      this.loteForm.vencimiento = '';
      this.loteForm.registroSanitario = '';
    } else if (prod && prod.tipoProducto === 'OTROS') {
      this.loteForm.registroSanitario = '';
      if (!this.loteForm.vencimiento) {
        const f = new Date();
        f.setFullYear(f.getFullYear() + 2);
        this.loteForm.vencimiento = f.toISOString().split('T')[0];
      }
    } else if (prod && prod.tipoProducto === 'MEDICAMENTO') {
      if (!this.loteForm.vencimiento) {
        const f = new Date();
        f.setFullYear(f.getFullYear() + 2);
        this.loteForm.vencimiento = f.toISOString().split('T')[0];
      }
      if (!this.loteForm.registroSanitario) {
        this.loteForm.registroSanitario = 'EE-' + Math.floor(10000 + Math.random() * 90000);
      }
    }
  }

  generarCodigoLoteNuevo() {
    const anio = new Date().getFullYear();
    const correlativo = Math.floor(1000 + Math.random() * 9000);
    this.loteCabecera.lote = `LT-${anio}-${correlativo}`;
  }

  // ================= MODAL ELIMINAR LOTE =================
  showEliminarModal = false;
  loteAEliminar: LoteItem | null = null;

  // ================= MODAL ACTA DE BAJA (DIGEMID / SUNAT) =================
  showBajaModal = false;
  loteSeleccionadoParaBaja: LoteItem | null = null;
  cantidadBaja = 1;
  motivoBaja = 'Caducidad / Medicamento Vencido (DIGEMID)';
  motivosDisponibles = [
    'Caducidad / Medicamento Vencido (DIGEMID)',
    'Rotura o Deterioro de Empaque / Frasco',
    'Pérdida de Cadena de Frío',
    'Falla de Calidad / Retiro de Mercado',
    'Merma / Diferencia de Inventario Físico'
  ];
  quimicoResponsable = 'Dra. Elena Ramos';
  cmpQuimico = '';
  observacionesBaja = '';

  showActaImprimirModal = false;
  actaParaImprimir: ActaBaja | null = null;

  // ================= TOAST NOTIFICACIÓN =================
  mensajeToast: { tipo: 'success' | 'error' | 'info'; texto: string } | null = null;
  private toastTimeout: any;

  ngOnInit() {
    this.cargarDatos();
    this.detectarRuta();
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.detectarRuta();
      });
  }

  detectarRuta() {
    const url = this.router.url;
    if (url.includes('/editar/')) {
      this.vistaActual = 'NUEVO_LOTE';
      this.modoModalLote = 'EDITAR';
      const parts = url.split('/editar/');
      const id = parts[1]?.split('?')[0];
      if (id) {
        this.loteEnEdicionId = id;
        this.cargarLoteParaEdicion(id);
      }
    } else if (url.includes('/nuevo')) {
      this.vistaActual = 'NUEVO_LOTE';
      this.modoModalLote = 'NUEVO';
      this.iniciarNuevoLote();
    } else {
      this.vistaActual = 'LISTADO';
      this.modoModalLote = 'NUEVO';
    }
    this.cdr.markForCheck();
  }

  cargarLoteParaEdicion(id: string | number) {
    this.cargarProductosCatalogo();
    this.modoModalLote = 'EDITAR';
    this.loteEnEdicionId = id;
    this.errorModalLote = '';

    const aplicarDatos = () => {
      const item = this.lotesFefo.find(l => String(l.id) === String(id));
      if (item) {
        const esPerf = item.tipoProducto === 'PERFUME' || item.vencimiento === 'No expira';
        const u = item.ubicacion || (item.pasillo ? (item.pasillo + (item.estante ? `-${item.estante}` : '') + (item.nivel ? `-${item.nivel}` : '') + (item.gaveta ? `-${item.gaveta}` : '')) : '');
        this.loteForm = {
          productoId: item.productoId,
          lote: item.lote,
          vencimiento: esPerf ? '' : item.vencimiento,
          stock: item.stock,
          ubicacion: u,
          pasillo: u,
          estante: '',
          nivel: '',
          gaveta: '',
          registroSanitario: item.registroSanitario || '',
          temperatura: item.temperatura || 'Ambiente',
          concentracionFragancia: item.concentracionFragancia || 'Eau de Parfum (EDP)',
          volumenMl: item.volumenMl || 100
        };
        const prod = this.productosCatalogo.find(p => p.id === item.productoId);
        if (prod) {
          this.busquedaProductoCatalogo = `${prod.nombreComercial}${prod.concentracion ? ' ' + prod.concentracion : ''}`;
        }
        this.mostrarBuscadorProducto = false;
        this.mostrarDropdownProductos = false;
        this.cdr.markForCheck();
      }
    };

    if (this.lotesFefo.length > 0) {
      aplicarDatos();
    } else {
      this.inventoryService.listarLotesFefo().subscribe(lotes => {
        this.lotesFefo = lotes;
        aplicarDatos();
      });
    }
  }

  irANuevoLote() {
    this.modoModalLote = 'NUEVO';
    this.iniciarNuevoLote();
    this.router.navigate(['/inventario/nuevo']);
  }

  volverAListado() {
    this.modoModalLote = 'NUEVO';
    this.loteEnEdicionId = null;
    this.router.navigate(['/inventario']);
  }

  cargarDatos() {
    this.cargando = true;
    this.cargarProductosCatalogo();
    this.cargarLotes();
    this.cargarActas();
  }

  cargarLotes() {
    this.cargando = true;
    const activeSedeId = this.authService.activeSede()?.id;
    this.inventoryService.listarLotesFefo(activeSedeId).subscribe({
      next: (lotes) => {
        this.lotesFefo = lotes;
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
      }
    });
  }

  cargarProductosCatalogo() {
    this.productService.listarCatalogoActivos().subscribe(prods => {
      this.productosCatalogo = prods;
      if (prods.length > 0 && !this.loteForm.productoId) {
        this.loteForm.productoId = prods[0].id;
      }
    });
  }

  cargarActas() {
    this.inventoryService.listarActas().subscribe(actas => {
      this.actasRegistradas = actas;
    });
  }

  mostrarToast(tipo: 'success' | 'error' | 'info', texto: string) {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.mensajeToast = { tipo, texto };
    this.toastTimeout = setTimeout(() => {
      this.mensajeToast = null;
    }, 3500);
  }

  // ================= COMPUTED & GETTERS =================
  get totalProntoVencer(): number {
    return this.lotesFefo.filter(item => item.dias >= 0 && item.dias <= 90).length;
  }

  get totalVencidos(): number {
    return this.lotesFefo.filter(item => item.dias < 0).length;
  }

  get totalOptimos(): number {
    return this.lotesFefo.filter(item => item.dias > 90).length;
  }

  get totalStockGeneral(): number {
    return this.lotesFefo.reduce((sum, item) => sum + (item.stock || 0), 0);
  }

  get totalStockFiltrado(): number {
    return this.lotesFiltrados.reduce((sum, item) => sum + (item.stock || 0), 0);
  }

  obtenerTipoLote(item: LoteItem): 'MEDICAMENTO' | 'PERFUME' | 'OTROS' {
    if (item.tipoProducto === 'PERFUME' || item.vencimiento === 'No expira') return 'PERFUME';
    if (item.tipoProducto === 'OTROS') return 'OTROS';
    return 'MEDICAMENTO';
  }

  get totalMedicamentos(): number {
    return this.lotesFefo.filter(l => this.obtenerTipoLote(l) === 'MEDICAMENTO').length;
  }

  get totalPerfumes(): number {
    return this.lotesFefo.filter(l => this.obtenerTipoLote(l) === 'PERFUME').length;
  }

  get totalOtros(): number {
    return this.lotesFefo.filter(l => this.obtenerTipoLote(l) === 'OTROS').length;
  }

  get lotesFiltrados(): LoteItem[] {
    let result = [...this.lotesFefo];

    // 1. Filtro por tipo de producto (Medicamento, Perfume, Otros)
    if (this.filtroTipoProducto !== 'TODOS') {
      result = result.filter(item => this.obtenerTipoLote(item) === this.filtroTipoProducto);
    }

    // 2. Filtro de estado FEFO
    if (this.filtroEstado !== 'TODOS') {
      result = result.filter(item => {
        if (this.filtroEstado === 'VENCIDO') return item.dias < 0;
        if (this.filtroEstado === 'CRITICO') return item.dias >= 0 && item.dias <= 30;
        if (this.filtroEstado === 'ALERTA') return item.dias > 30 && item.dias <= 90;
        if (this.filtroEstado === 'OPTIMO') return item.dias > 90;
        return true;
      });
    }

    // 3. Filtro de condición / temperatura
    if (this.filtroCondicion !== 'TODOS') {
      result = result.filter(item => item.temperatura === this.filtroCondicion);
    }

    // 4. Filtro de texto predictivo
    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase().trim();
      result = result.filter(item =>
        (item.producto && item.producto.toLowerCase().includes(q)) ||
        (item.lote && item.lote.toLowerCase().includes(q)) ||
        (item.principioActivo && item.principioActivo.toLowerCase().includes(q)) ||
        (item.laboratorio && item.laboratorio.toLowerCase().includes(q)) ||
        (item.registroSanitario && item.registroSanitario.toLowerCase().includes(q)) ||
        (item.pasillo && item.pasillo.toLowerCase().includes(q)) ||
        (item.ubicacion && item.ubicacion.toLowerCase().includes(q))
      );
    }

    // 5. Ordenamiento
    switch (this.ordenarPor) {
      case 'FEFO_ASC':
        result.sort((a, b) => new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime());
        break;
      case 'FEFO_DESC':
        result.sort((a, b) => new Date(b.vencimiento).getTime() - new Date(a.vencimiento).getTime());
        break;
      case 'PRODUCTO_ASC':
        result.sort((a, b) => (a.producto || '').localeCompare(b.producto || ''));
        break;
      case 'STOCK_DESC':
        result.sort((a, b) => (b.stock || 0) - (a.stock || 0));
        break;
      case 'STOCK_ASC':
        result.sort((a, b) => (a.stock || 0) - (b.stock || 0));
        break;
    }

    return result;
  }

  get totalPaginas(): number {
    return Math.ceil(this.lotesFiltrados.length / this.itemsPorPagina) || 1;
  }

  get lotesPaginados(): LoteItem[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.lotesFiltrados.slice(inicio, inicio + this.itemsPorPagina);
  }

  cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
    }
  }

  alternarOrden(columna: 'FEFO' | 'PRODUCTO' | 'STOCK') {
    if (columna === 'FEFO') {
      this.ordenarPor = this.ordenarPor === 'FEFO_ASC' ? 'FEFO_DESC' : 'FEFO_ASC';
    } else if (columna === 'PRODUCTO') {
      this.ordenarPor = 'PRODUCTO_ASC';
    } else if (columna === 'STOCK') {
      this.ordenarPor = this.ordenarPor === 'STOCK_DESC' ? 'STOCK_ASC' : 'STOCK_DESC';
    }
    this.paginaActual = 1;
  }

  limpiarFiltros() {
    this.busqueda = '';
    this.filtroTipoProducto = 'TODOS';
    this.filtroEstado = 'TODOS';
    this.filtroCondicion = 'TODOS';
    this.ordenarPor = 'FEFO_ASC';
    this.paginaActual = 1;
  }

  getBadgeStatus(dias: number, tipoProducto?: string) {
    if (tipoProducto === 'PERFUME' || dias >= 90000) {
      return { class: 'bg-purple-50 text-purple-700 border border-purple-200/80', icon: 'fa-solid fa-spray-can-sparkles', text: 'PERFUMERÍA (NO EXPIRA)' };
    }
    if (dias < 0) return { class: 'bg-rose-50 text-rose-700 border border-rose-200/80', icon: 'fa-solid fa-ban', text: 'VENCIDO (BLOQUEADO)' };
    if (dias <= 30) return { class: 'bg-rose-50 text-rose-600 border border-rose-200/80', icon: 'fa-solid fa-triangle-exclamation', text: 'CRÍTICO (<30 DÍAS)' };
    if (dias <= 90) return { class: 'bg-amber-50 text-amber-700 border border-amber-200/80', icon: 'fa-solid fa-bell', text: 'ALERTA (≤90 DÍAS)' };
    return { class: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', icon: 'fa-solid fa-shield-halved', text: 'ÓPTIMO (>90 DÍAS)' };
  }

  // ================= ACCIONES: CREAR & EDITAR LOTE (MAESTRO-DETALLE) =================
  abrirModalNuevoLote() {
    this.irANuevoLote();
  }

  iniciarNuevoLote() {
    this.cargarProductosCatalogo();
    this.modoModalLote = 'NUEVO';
    this.loteEnEdicionId = null;
    this.errorModalLote = '';

    if (!this.loteCabecera.lote) {
      this.generarCodigoLoteNuevo();
    }
    this.loteCabecera.guiaReferencia = this.loteCabecera.guiaReferencia || '';
    this.loteCabecera.fechaIngreso = this.loteCabecera.fechaIngreso || new Date().toISOString().split('T')[0];

    const fechaFutura = new Date();
    fechaFutura.setFullYear(fechaFutura.getFullYear() + 2);

    const primerProd = this.productosCatalogo.length > 0 ? this.productosCatalogo[0] : null;
    const esPerf = primerProd?.tipoProducto === 'PERFUME';

    if (!this.loteForm.productoId && primerProd) {
      this.loteForm = {
        productoId: primerProd.id,
        lote: this.loteCabecera.lote,
        vencimiento: esPerf ? '' : fechaFutura.toISOString().split('T')[0],
        stock: 50,
        ubicacion: '',
        pasillo: '',
        estante: '',
        nivel: '',
        gaveta: '',
        registroSanitario: (esPerf || primerProd?.tipoProducto === 'OTROS') ? '' : 'EE-' + Math.floor(10000 + Math.random() * 90000),
        temperatura: 'Ambiente',
        concentracionFragancia: 'Eau de Parfum (EDP)',
        volumenMl: 100
      };
      this.busquedaProductoCatalogo = `${primerProd.nombreComercial}${primerProd.concentracion ? ' ' + primerProd.concentracion : ''}`;
      if (esPerf) {
        this.onProductoChange();
      }
    }
  }

  limpiarLoteActual() {
    this.productosEnLoteTemporal = [];
    this.generarCodigoLoteNuevo();
    this.loteCabecera.guiaReferencia = '';
    this.errorModalLote = '';
    this.loteForm.ubicacion = '';
    this.loteForm.pasillo = '';
    this.mostrarToast('info', 'Formulario del lote reiniciado.');
  }

  agregarProductoALote() {
    this.errorModalLote = '';
    if (!this.loteForm.productoId) {
      this.errorModalLote = 'Por favor selecciona un producto del catálogo.';
      return;
    }

    const prod = this.productoSeleccionado;
    if (!prod) {
      this.errorModalLote = 'El producto seleccionado no es válido.';
      return;
    }

    if (this.loteForm.stock === null || this.loteForm.stock === undefined || this.loteForm.stock <= 0) {
      this.errorModalLote = 'El stock físico debe ser un número válido mayor a cero.';
      return;
    }

    const esPerf = prod.tipoProducto === 'PERFUME';
    const esOtros = prod.tipoProducto === 'OTROS';

    if (!esPerf && !esOtros && !this.loteForm.vencimiento) {
      this.errorModalLote = 'Ingresa la fecha de vencimiento (obligatoria para medicamentos).';
      return;
    }

    if (esPerf && (!this.loteForm.volumenMl || this.loteForm.volumenMl <= 0)) {
      this.errorModalLote = 'Ingresa el volumen en mililitros (ml) para el perfume.';
      return;
    }

    const nombreCompleto = prod.nombreComercial + (prod.concentracion ? ` ${prod.concentracion}` : '');
    const principioAct = prod.principioActivo || (esPerf ? (prod.marca || 'Perfumería') : (prod.marca || 'Genérico'));
    const lab = prod.laboratorio || prod.marca || (esPerf ? 'Cosmética' : 'Fabricante');

    const ubicacionTexto = (this.loteForm.ubicacion || '').trim();

    const nuevoItem: ItemLoteTemporal = {
      productoId: prod.id,
      productoNombre: nombreCompleto,
      tipoProducto: prod.tipoProducto,
      sku: prod.sku,
      principioActivo: principioAct,
      laboratorio: lab,
      stock: Number(this.loteForm.stock),
      vencimiento: esPerf ? 'No expira' : (this.loteForm.vencimiento || 'No expira'),
      ubicacion: esPerf ? '' : ubicacionTexto,
      pasillo: esPerf ? '' : ubicacionTexto,
      estante: '',
      nivel: '',
      gaveta: '',
      registroSanitario: esPerf ? '' : (this.loteForm.registroSanitario || '').trim(),
      temperatura: esPerf ? 'Ambiente' : this.loteForm.temperatura,
      concentracionFragancia: esPerf ? this.loteForm.concentracionFragancia : undefined,
      volumenMl: esPerf ? Number(this.loteForm.volumenMl) : undefined
    };

    this.productosEnLoteTemporal.push(nuevoItem);

    // Resetear formulario para facilitar el ingreso del siguiente producto
    this.loteForm.stock = 50;
    this.loteForm.ubicacion = '';
    const fechaFutura = new Date();
    fechaFutura.setFullYear(fechaFutura.getFullYear() + 2);
    this.loteForm.vencimiento = fechaFutura.toISOString().split('T')[0];
    this.loteForm.registroSanitario = 'EE-' + Math.floor(10000 + Math.random() * 90000);

    this.mostrarToast('info', `"${prod.nombreComercial}" agregado a la lista del lote.`);
  }

  eliminarProductoDeLoteTemporal(index: number) {
    if (index >= 0 && index < this.productosEnLoteTemporal.length) {
      const removido = this.productosEnLoteTemporal.splice(index, 1);
      this.mostrarToast('info', `Se quitó "${removido[0]?.productoNombre}" de la lista del lote.`);
    }
  }

  guardarLoteCompleto() {
    this.errorModalLote = '';
    if (!this.loteCabecera.lote || !this.loteCabecera.lote.trim()) {
      this.errorModalLote = 'Debes ingresar un número o código de lote compartido.';
      return;
    }

    if (this.productosEnLoteTemporal.length === 0) {
      this.errorModalLote = 'Debes agregar al menos un producto a la lista del lote antes de guardar.';
      return;
    }

    const codigoLote = this.loteCabecera.lote.trim();
    const fechaIng = this.loteCabecera.fechaIngreso || new Date().toISOString().split('T')[0];

    const nuevosLotes: LoteItem[] = this.productosEnLoteTemporal.map((item, index) => {
      const esPerf = item.tipoProducto === 'PERFUME';
      return {
        id: 'lote-' + (Date.now() + index).toString().slice(-8),
        productoId: item.productoId,
        tipoProducto: item.tipoProducto,
        lote: codigoLote,
        producto: item.productoNombre,
        principioActivo: item.principioActivo || '',
        laboratorio: item.laboratorio || '',
        stock: item.stock,
        vencimiento: item.vencimiento,
        dias: esPerf ? 99999 : 0,
        fechaIngreso: fechaIng,
        ubicacion: item.ubicacion || item.pasillo || '',
        pasillo: item.pasillo,
        estante: item.estante,
        nivel: item.nivel,
        gaveta: item.gaveta,
        registroSanitario: item.registroSanitario,
        temperatura: item.temperatura,
        concentracionFragancia: item.concentracionFragancia,
        volumenMl: item.volumenMl
      };
    });

    this.inventoryService.agregarLotesBatch(nuevosLotes).subscribe(() => {
      this.showLoteModal = false;
      this.cargarLotes();
      this.mostrarToast('success', `Lote ${codigoLote} registrado con éxito con ${nuevosLotes.length} productos (${this.totalUnidadesEnLoteTemporal} unidades en total).`);
      this.productosEnLoteTemporal = [];
      this.loteCabecera.lote = '';
      this.loteCabecera.guiaReferencia = '';
      this.volverAListado();
    });
  }

  abrirModalEditarLote(item: LoteItem) {
    this.cargarProductosCatalogo();
    this.modoModalLote = 'EDITAR';
    this.loteEnEdicionId = item.id;
    this.errorModalLote = '';

    const esPerf = item.tipoProducto === 'PERFUME' || item.vencimiento === 'No expira';
    const u = item.ubicacion || (item.pasillo ? (item.pasillo + (item.estante ? `-${item.estante}` : '') + (item.nivel ? `-${item.nivel}` : '') + (item.gaveta ? `-${item.gaveta}` : '')) : '');

    this.loteForm = {
      productoId: item.productoId,
      lote: item.lote,
      vencimiento: esPerf ? '' : item.vencimiento,
      stock: item.stock,
      ubicacion: u,
      pasillo: u,
      estante: '',
      nivel: '',
      gaveta: '',
      registroSanitario: item.registroSanitario || '',
      temperatura: item.temperatura || 'Ambiente',
      concentracionFragancia: item.concentracionFragancia || 'Eau de Parfum (EDP)',
      volumenMl: item.volumenMl || 100
    };

    const prod = this.productosCatalogo.find(p => p.id === item.productoId);
    if (prod) {
      this.busquedaProductoCatalogo = `${prod.nombreComercial}${prod.concentracion ? ' ' + prod.concentracion : ''}`;
    }
    this.mostrarBuscadorProducto = false;
    this.mostrarDropdownProductos = false;

    // Navegar a la vista completa en modo edición
    this.vistaActual = 'NUEVO_LOTE';
    this.showLoteModal = false;
    this.router.navigate(['/inventario/editar', item.id]);
  }

  guardarLote() {
    if (this.modoModalLote === 'NUEVO') {
      this.guardarLoteCompleto();
      return;
    }

    // Modo EDITAR Individual
    if (!this.loteForm.productoId) {
      this.errorModalLote = 'Selecciona un producto del catálogo.';
      return;
    }
    if (!this.loteForm.lote.trim()) {
      this.errorModalLote = this.esProductoPerfume ? 'Ingresa el código o identificador del lote.' : 'Ingresa el número o código de lote.';
      return;
    }
    if (!this.esProductoPerfume && !this.esProductoOtros && !this.loteForm.vencimiento) {
      this.errorModalLote = 'Ingresa la fecha de vencimiento.';
      return;
    }
    if (this.loteForm.stock === null || this.loteForm.stock === undefined || this.loteForm.stock < 0) {
      this.errorModalLote = 'El stock físico debe ser un número válido igual o mayor a cero.';
      return;
    }

    const prod = this.productoSeleccionado;
    const esPerf = this.esProductoPerfume;
    const tipoDeterminado: 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = esPerf ? 'PERFUME' : (prod?.tipoProducto === 'OTROS' ? 'OTROS' : 'MEDICAMENTO');
    const nombreProd = prod
      ? prod.nombreComercial + (prod.concentracion ? ` ${prod.concentracion}` : '')
      : 'Producto';
    const principioAct = prod?.principioActivo || (esPerf ? (prod?.marca || 'Perfumería') : (prod?.marca || 'Genérico'));
    const lab = prod?.laboratorio || prod?.marca || (esPerf ? 'Cosmética' : 'Fabricante');

    const ubicacionStr = (this.loteForm.ubicacion || this.loteForm.pasillo || '').trim();

    const loteEditado: LoteItem = {
      id: this.loteEnEdicionId!,
      productoId: this.loteForm.productoId,
      tipoProducto: tipoDeterminado,
      lote: this.loteForm.lote.trim(),
      producto: nombreProd,
      principioActivo: principioAct,
      laboratorio: lab,
      stock: Number(this.loteForm.stock),
      vencimiento: esPerf ? 'No expira' : (this.loteForm.vencimiento || '2027-12-31'),
      dias: esPerf ? 99999 : 0,
      ubicacion: esPerf ? '' : ubicacionStr,
      pasillo: esPerf ? '' : ubicacionStr,
      estante: '',
      nivel: '',
      gaveta: '',
      registroSanitario: esPerf ? '' : this.loteForm.registroSanitario.trim(),
      temperatura: esPerf ? 'Ambiente' : this.loteForm.temperatura,
      concentracionFragancia: esPerf ? this.loteForm.concentracionFragancia : undefined,
      volumenMl: esPerf ? Number(this.loteForm.volumenMl) : undefined
    };

    this.inventoryService.actualizarLote(loteEditado).subscribe(() => {
      this.showLoteModal = false;
      this.cargarLotes();
      this.mostrarToast('success', `Lote ${loteEditado.lote} actualizado correctamente.`);
      this.modoModalLote = 'NUEVO';
      this.loteEnEdicionId = null;
      this.volverAListado();
    });
  }

  // ================= ACCIONES: ELIMINAR LOTE =================
  abrirModalEliminar(item: LoteItem) {
    this.loteAEliminar = item;
    this.showEliminarModal = true;
  }

  confirmarEliminarLote() {
    if (!this.loteAEliminar) return;
    const codigo = this.loteAEliminar.lote;
    this.inventoryService.eliminarLote(this.loteAEliminar.id).subscribe(() => {
      this.showEliminarModal = false;
      this.loteAEliminar = null;
      this.cargarLotes();
      this.mostrarToast('info', `Lote ${codigo} eliminado del inventario.`);
    });
  }

  // ================= ACCIONES: ACTA DE BAJAS DIGEMID =================
  openBajaModal(item: LoteItem) {
    this.loteSeleccionadoParaBaja = item;
    this.cantidadBaja = item.stock > 0 ? (item.dias < 0 ? item.stock : 1) : 0;
    this.observacionesBaja = '';
    this.showBajaModal = true;
  }

  confirmarActaBaja() {
    if (!this.loteSeleccionadoParaBaja || this.cantidadBaja <= 0 || this.cantidadBaja > this.loteSeleccionadoParaBaja.stock) {
      alert('Ingresa una cantidad válida a dar de baja.');
      return;
    }

    this.loteSeleccionadoParaBaja.stock -= this.cantidadBaja;

    const nuevaActa: ActaBaja = {
      id: 'ACTA-BAJA-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      fecha: new Date(),
      responsable: this.quimicoResponsable,
      cmpQuimico: undefined,
      motivo: this.motivoBaja,
      observaciones: this.observacionesBaja,
      loteId: this.loteSeleccionadoParaBaja.id,
      productoId: this.loteSeleccionadoParaBaja.productoId,
      producto: this.loteSeleccionadoParaBaja.producto,
      lote: this.loteSeleccionadoParaBaja.lote,
      cantidadBaja: this.cantidadBaja,
      costoTotalPerdida: this.cantidadBaja * 0.50
    };

    this.inventoryService.registrarBajaLote(nuevaActa).subscribe(() => {
      this.cargarActas();
      this.cargarLotes();
      this.mostrarToast('success', `Acta ${nuevaActa.id} registrada exitosamente.`);
    });

    this.showBajaModal = false;
    this.actaParaImprimir = nuevaActa;
    this.showActaImprimirModal = true;
  }

  imprimirActa() {
    window.print();
  }
}
