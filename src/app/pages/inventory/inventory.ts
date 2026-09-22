import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService, LoteItem, ActaBaja } from '../../core/services/inventory.service';
import { ProductService, ProductoCatalogoItem } from '../../core/services/product.service';

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

  cargando = false;
  lotesFefo: LoteItem[] = [];
  productosCatalogo: ProductoCatalogoItem[] = [];
  actasRegistradas: ActaBaja[] = [];

  // ================= FILTROS Y BÚSQUEDA =================
  busqueda = '';
  filtroEstado = 'TODOS'; // 'TODOS' | 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'VENCIDO'
  filtroCondicion = 'TODOS'; // 'TODOS' | 'Ambiente' | '2°C a 8°C (Cadena Frío)' | 'Lugar Fresco y Seco' | 'Caja de Seguridad'
  ordenarPor: 'FEFO_ASC' | 'FEFO_DESC' | 'PRODUCTO_ASC' | 'STOCK_DESC' | 'STOCK_ASC' = 'FEFO_ASC';

  // ================= PAGINACIÓN =================
  paginaActual = 1;
  itemsPorPagina = 10;

  // ================= MODAL LOTE (NUEVO / EDITAR) =================
  showLoteModal = false;
  modoModalLote: 'NUEVO' | 'EDITAR' = 'NUEVO';
  loteEnEdicionId: string | number | null = null;

  loteForm = {
    productoId: '',
    lote: '',
    vencimiento: '',
    stock: 50,
    pasillo: 'P1',
    estante: 'E1',
    nivel: 'N1',
    gaveta: 'G1',
    registroSanitario: '',
    temperatura: 'Ambiente',
    // Campos específicos para fragancias y perfumes
    concentracionFragancia: 'Eau de Parfum (EDP)',
    volumenMl: 100,
    batchCode: '',
    destinoUnidad: 'VENTA' as 'VENTA' | 'TESTER',
    genero: 'Unisex',
    familiaOlfativa: 'Amaderada'
  };
  errorModalLote = '';

  get productoSeleccionado(): ProductoCatalogoItem | undefined {
    return this.productosCatalogo.find(p => p.id === this.loteForm.productoId);
  }

  get esProductoPerfume(): boolean {
    return this.productoSeleccionado?.tipoProducto === 'PERFUME';
  }

  onProductoChange() {
    const prod = this.productoSeleccionado;
    if (prod && prod.tipoProducto === 'PERFUME') {
      if (prod.volumenMl) this.loteForm.volumenMl = prod.volumenMl;
      if (prod.familiaOlfativa) this.loteForm.familiaOlfativa = prod.familiaOlfativa;
      if (prod.generoObjetivo) {
        this.loteForm.genero = prod.generoObjetivo === 'HOMBRE' ? 'Hombre' : prod.generoObjetivo === 'MUJER' ? 'Mujer' : 'Unisex';
      }
      this.loteForm.vencimiento = '';
      this.loteForm.registroSanitario = '';
      if (!this.loteForm.batchCode) {
        this.loteForm.batchCode = 'BC-' + Math.floor(10000 + Math.random() * 90000);
      }
    }
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
  cmpQuimico = 'CQFP 14820';
  observacionesBaja = '';

  showActaImprimirModal = false;
  actaParaImprimir: ActaBaja | null = null;

  // ================= TOAST NOTIFICACIÓN =================
  mensajeToast: { tipo: 'success' | 'error' | 'info'; texto: string } | null = null;
  private toastTimeout: any;

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    this.cargando = true;
    this.cargarProductosCatalogo();
    this.cargarLotes();
    this.cargarActas();
  }

  cargarLotes() {
    this.cargando = true;
    this.inventoryService.listarLotesFefo().subscribe({
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

  get lotesFiltrados(): LoteItem[] {
    let result = [...this.lotesFefo];

    // 1. Filtro de estado FEFO
    if (this.filtroEstado !== 'TODOS') {
      result = result.filter(item => {
        if (this.filtroEstado === 'VENCIDO') return item.dias < 0;
        if (this.filtroEstado === 'CRITICO') return item.dias >= 0 && item.dias <= 30;
        if (this.filtroEstado === 'ALERTA') return item.dias > 30 && item.dias <= 90;
        if (this.filtroEstado === 'OPTIMO') return item.dias > 90;
        return true;
      });
    }

    // 2. Filtro de condición / temperatura
    if (this.filtroCondicion !== 'TODOS') {
      result = result.filter(item => item.temperatura === this.filtroCondicion);
    }

    // 3. Filtro de texto predictivo
    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase().trim();
      result = result.filter(item =>
        (item.producto && item.producto.toLowerCase().includes(q)) ||
        (item.lote && item.lote.toLowerCase().includes(q)) ||
        (item.principioActivo && item.principioActivo.toLowerCase().includes(q)) ||
        (item.laboratorio && item.laboratorio.toLowerCase().includes(q)) ||
        (item.registroSanitario && item.registroSanitario.toLowerCase().includes(q)) ||
        (item.pasillo && item.pasillo.toLowerCase().includes(q))
      );
    }

    // 4. Ordenamiento
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

  // ================= ACCIONES: CREAR & EDITAR LOTE =================
  abrirModalNuevoLote() {
    this.cargarProductosCatalogo();
    this.modoModalLote = 'NUEVO';
    this.loteEnEdicionId = null;
    this.errorModalLote = '';

    const fechaFutura = new Date();
    fechaFutura.setFullYear(fechaFutura.getFullYear() + 2);

    const primerProd = this.productosCatalogo.length > 0 ? this.productosCatalogo[0] : null;
    const esPerf = primerProd?.tipoProducto === 'PERFUME';

    this.loteForm = {
      productoId: primerProd ? primerProd.id : '',
      lote: esPerf ? 'BATCH-' + Math.floor(1000 + Math.random() * 9000) : 'LT-' + Math.floor(100000 + Math.random() * 900000),
      vencimiento: esPerf ? '' : fechaFutura.toISOString().split('T')[0],
      stock: 50,
      pasillo: 'P1',
      estante: 'E1',
      nivel: 'N1',
      gaveta: 'G1',
      registroSanitario: esPerf ? '' : 'EE-' + Math.floor(10000 + Math.random() * 90000),
      temperatura: 'Ambiente',
      concentracionFragancia: 'Eau de Parfum (EDP)',
      volumenMl: primerProd?.volumenMl || 100,
      batchCode: 'BC-' + Math.floor(10000 + Math.random() * 90000),
      destinoUnidad: 'VENTA',
      genero: primerProd?.generoObjetivo === 'HOMBRE' ? 'Hombre' : primerProd?.generoObjetivo === 'MUJER' ? 'Mujer' : 'Unisex',
      familiaOlfativa: primerProd?.familiaOlfativa || 'Amaderada'
    };

    if (esPerf) {
      this.onProductoChange();
    }

    this.showLoteModal = true;
  }

  abrirModalEditarLote(item: LoteItem) {
    this.cargarProductosCatalogo();
    this.modoModalLote = 'EDITAR';
    this.loteEnEdicionId = item.id;
    this.errorModalLote = '';

    const esPerf = item.tipoProducto === 'PERFUME' || item.vencimiento === 'No expira';

    this.loteForm = {
      productoId: item.productoId,
      lote: item.lote,
      vencimiento: esPerf ? '' : item.vencimiento,
      stock: item.stock,
      pasillo: item.pasillo || 'P1',
      estante: item.estante || 'E1',
      nivel: item.nivel || 'N1',
      gaveta: item.gaveta || 'G1',
      registroSanitario: item.registroSanitario || '',
      temperatura: item.temperatura || 'Ambiente',
      concentracionFragancia: item.concentracionFragancia || 'Eau de Parfum (EDP)',
      volumenMl: item.volumenMl || 100,
      batchCode: item.batchCode || '',
      destinoUnidad: item.destinoUnidad || 'VENTA',
      genero: item.genero || 'Unisex',
      familiaOlfativa: item.familiaOlfativa || 'Amaderada'
    };

    this.showLoteModal = true;
  }

  guardarLote() {
    if (!this.loteForm.productoId) {
      this.errorModalLote = 'Selecciona un producto del catálogo.';
      return;
    }
    if (!this.loteForm.lote.trim()) {
      this.errorModalLote = this.esProductoPerfume ? 'Ingresa el código o identificador del lote.' : 'Ingresa el número o código de lote.';
      return;
    }
    if (!this.esProductoPerfume && !this.loteForm.vencimiento) {
      this.errorModalLote = 'Ingresa la fecha de vencimiento.';
      return;
    }
    if (this.loteForm.stock === null || this.loteForm.stock === undefined || this.loteForm.stock < 0) {
      this.errorModalLote = 'El stock físico debe ser un número válido igual o mayor a cero.';
      return;
    }

    const prod = this.productoSeleccionado;
    const esPerf = this.esProductoPerfume;
    const nombreProd = prod
      ? prod.nombreComercial + (prod.concentracion ? ` ${prod.concentracion}` : '')
      : 'Producto';
    const principioAct = prod?.principioActivo || (esPerf ? (prod?.marca || 'Perfumería') : 'Genérico');
    const lab = prod?.laboratorio || (esPerf ? (prod?.marca || 'Cosmética') : 'Laboratorio');

    if (this.modoModalLote === 'NUEVO') {
      const nuevoItem: LoteItem = {
        id: 'lote-' + Date.now().toString().slice(-8),
        productoId: this.loteForm.productoId,
        tipoProducto: esPerf ? 'PERFUME' : 'MEDICAMENTO',
        lote: this.loteForm.lote.trim(),
        producto: nombreProd,
        principioActivo: principioAct,
        laboratorio: lab,
        stock: Number(this.loteForm.stock),
        vencimiento: esPerf ? 'No expira' : this.loteForm.vencimiento,
        dias: esPerf ? 99999 : 0,
        pasillo: esPerf ? '' : this.loteForm.pasillo.trim(),
        estante: esPerf ? '' : this.loteForm.estante.trim(),
        nivel: esPerf ? '' : this.loteForm.nivel.trim(),
        gaveta: esPerf ? '' : this.loteForm.gaveta.trim(),
        registroSanitario: esPerf ? '' : (this.loteForm.registroSanitario.trim() || 'REG-DIGEMID'),
        temperatura: esPerf ? 'Ambiente' : this.loteForm.temperatura,
        concentracionFragancia: esPerf ? this.loteForm.concentracionFragancia : undefined,
        volumenMl: esPerf ? Number(this.loteForm.volumenMl) : undefined,
        batchCode: esPerf ? this.loteForm.batchCode.trim() : undefined,
        destinoUnidad: esPerf ? this.loteForm.destinoUnidad : undefined,
        genero: esPerf ? this.loteForm.genero : undefined,
        familiaOlfativa: esPerf ? this.loteForm.familiaOlfativa : undefined
      };

      this.inventoryService.agregarLote(nuevoItem).subscribe(() => {
        this.showLoteModal = false;
        this.cargarLotes();
        this.mostrarToast('success', `Lote ${nuevoItem.lote} ingresado correctamente (${nuevoItem.stock} unid.).`);
      });
    } else {
      // Modo EDITAR
      const loteEditado: LoteItem = {
        id: this.loteEnEdicionId!,
        productoId: this.loteForm.productoId,
        tipoProducto: esPerf ? 'PERFUME' : 'MEDICAMENTO',
        lote: this.loteForm.lote.trim(),
        producto: nombreProd,
        principioActivo: principioAct,
        laboratorio: lab,
        stock: Number(this.loteForm.stock),
        vencimiento: esPerf ? 'No expira' : this.loteForm.vencimiento,
        dias: esPerf ? 99999 : 0,
        pasillo: esPerf ? '' : this.loteForm.pasillo.trim(),
        estante: esPerf ? '' : this.loteForm.estante.trim(),
        nivel: esPerf ? '' : this.loteForm.nivel.trim(),
        gaveta: esPerf ? '' : this.loteForm.gaveta.trim(),
        registroSanitario: esPerf ? '' : (this.loteForm.registroSanitario.trim() || 'REG-DIGEMID'),
        temperatura: esPerf ? 'Ambiente' : this.loteForm.temperatura,
        concentracionFragancia: esPerf ? this.loteForm.concentracionFragancia : undefined,
        volumenMl: esPerf ? Number(this.loteForm.volumenMl) : undefined,
        batchCode: esPerf ? this.loteForm.batchCode.trim() : undefined,
        destinoUnidad: esPerf ? this.loteForm.destinoUnidad : undefined,
        genero: esPerf ? this.loteForm.genero : undefined,
        familiaOlfativa: esPerf ? this.loteForm.familiaOlfativa : undefined
      };

      this.inventoryService.actualizarLote(loteEditado).subscribe(() => {
        this.showLoteModal = false;
        this.cargarLotes();
        this.mostrarToast('success', `Lote ${loteEditado.lote} actualizado correctamente.`);
      });
    }
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
      cmpQuimico: this.cmpQuimico,
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
