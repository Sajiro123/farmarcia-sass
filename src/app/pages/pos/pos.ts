import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProductService } from '../../core/services/product.service';
import { InventoryService } from '../../core/services/inventory.service';
import { VentaService } from '../../core/services/venta.service';
import { DecolectaService } from '../../core/services/decolecta.service';
import { CustomerService } from '../../core/services/customer.service';
import { StorageService } from '../../core/services/storage.service';

export interface PagoDetalle {
  metodo: string;
  monto: number;
  referencia?: string;
}

export interface TicketVenta {
  id: string;
  fecha: Date;
  items: any[];
  subtotal: number;
  igv: number;
  total: number;
  modoPago: string;
  metodo: string;
  desglose: PagoDetalle[];
  efectivoRecibido?: number | null;
  cambio?: number;
  cliente: string;
  dni: string;
  tipoComprobante: 'Boleta' | 'Factura' | 'Ticket';
  datosReceta?: {
    cmpMedico: string;
    nroReceta: string;
    paciente: string;
  };
  sede: string;
  estado: 'EMITIDO' | 'ANULADO';
  anulacionInfo?: {
    autorizadoPor: string;
    motivo: string;
    observaciones?: string;
    fecha: Date;
  };
}

export interface ProductoFarmacia {
  id: string | number;
  nombre: string;
  principioActivo: string;
  concentracion: string;
  laboratorio: string;
  tipo: string;
  categoria: string;
  ubicacion: string; // Pasillo-Estante-Nivel
  requiereReceta: boolean;
  esControlado: boolean; // Psicotrópico o Estupefaciente
  lote: string;
  vto: string;
  diasParaVencer: number;
  stockUnidades: number; // Stock base en unidades
  unidadesPorCaja: number;
  unidadesPorBlister: number;
  precioCaja: number;
  precioBlister: number;
  precioUnidad: number;
  imagenUrl?: string;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos.html'
})
export class Pos implements OnInit {
  public authService = inject(AuthService);
  private productService = inject(ProductService);
  private inventoryService = inject(InventoryService);
  private ventaService = inject(VentaService);
  private decolectaService = inject(DecolectaService);
  private customerService = inject(CustomerService);
  public storageService = inject(StorageService);
  
  // ================= 1. CONTROL DE CAJA Y TURNOS =================

  cajaAbierta = true;
  fondoInicial = 100.00;
  fechaApertura = new Date(Date.now() - 4 * 3600000);
  cajeroActual = 'Carlos Mendoza (Cajero Principal)';

  showAperturaModal = false;
  showCierreModal = false;
  
  // Arqueo Ciego
  declaradoEfectivo: number | null = null;
  declaradoYape: number | null = null;
  declaradoPlin: number | null = null;
  declaradoTarjeta: number | null = null;
  reporteZCierre: any = null;
  showReporteZModal = false;

  // ================= 2. CATÁLOGO CON FRACCIONAMIENTO Y RECETAS =================
  searchQuery = '';
  selectedCategory = 'Todos';
  categories = ['Todos', 'Analgésicos', 'Antibióticos', 'Cardiología', 'Venta Libre (OTC)', 'Cuidado Personal', 'Vitaminas'];

  productos: ProductoFarmacia[] = [];
  filteredProducts: ProductoFarmacia[] = [];

  sustitutosSugeridos: ProductoFarmacia[] = [];
  showSustitutosModal = false;
  productoParaSustituir: ProductoFarmacia | null = null;

  // Estado de Stepper y Presentación por Tarjeta
  cantidadesPorProducto: { [id: string]: number } = {};
  presentacionPorProducto: { [id: string]: 'unidad' | 'blister' | 'caja' } = {};

  // Modo de Vista del Catálogo (Tarjetas con fotos vs Lista compacta)
  vistaModo: 'cards' | 'lista' = (typeof localStorage !== 'undefined' && localStorage.getItem('medicare_pos_view_mode') as 'cards' | 'lista') || 'cards';

  // Modal para receta de psicotrópicos
  showRecetaModal = false;
  productoControladoPendiente: any = null;
  cmpMedico = '';
  nroReceta = '';
  pacienteReceta = '';

  // Subida Rápida de Imagen (Supabase Storage 1 GB)
  showModalImagen = false;
  productoParaFoto: ProductoFarmacia | null = null;
  urlFotoDirecta = '';
  subiendoFoto = false;
  errorSubidaFoto = '';

  // Fecha y Medios Rápidos
  fechaActual = new Date();
  metodoPagoRapido = 'Efectivo';

  // ================= 3. CARRITO & CONSULTA SUNAT/RENIEC =================
  cart: any[] = [];
  subtotal = 0;
  igv = 0;
  total = 0;

  // Cliente & Comprobante
  tipoComprobante: 'Boleta' | 'Factura' | 'Ticket' = 'Ticket';
  tipoDoc: 'DNI' | 'RUC' | 'SIN_DOC' = 'DNI';
  docNumero = '';
  customerName = 'Cliente de mostrador';
  customerDireccion = '';
  customerCelular = '';
  customerEmail = '';
  customerFechaNacimiento = '';
  customerPuntos = 0;
  consultandoDocumento = false;
  isEditingCustomer = false;

  // Notificaciones y Alertas con diseño
  mensajeToast: { tipo: 'warning' | 'error' | 'success' | 'info'; titulo?: string; texto: string } | null = null;
  alertaDocumento = '';

  mostrarAlerta(tipo: 'warning' | 'error' | 'success' | 'info', texto: string, titulo?: string) {
    this.mensajeToast = { tipo, texto, titulo };
    setTimeout(() => {
      if (this.mensajeToast?.texto === texto) {
        this.mensajeToast = null;
      }
    }, 5000);
  }

  // ================= 4. MODAL DE PAGO (ÚNICO / MIXTO) =================
  showPaymentModal = false;
  paymentMode: 'simple' | 'mixto' = 'simple';
  paymentMethod = 'Efectivo';
  montoRecibido: number | null = null;

  pagoEfectivo: number | null = null;
  efectivoRecibido: number | null = null;
  pagoYape: number | null = null;
  yapeRef = '';
  pagoPlin: number | null = null;
  plinRef = '';
  pagoTarjeta: number | null = null;
  tarjetaRef = '';
  pagoTransferencia: number | null = null;
  transfRef = '';

  // Ticket Modal
  showTicketModal = false;
  ticketData: TicketVenta | null = null;

  // ================= 5. HISTORIAL & ANULACIÓN CON PIN =================
  ventasTurno: TicketVenta[] = [];

  showAnulacionModal = false;
  ticketAAnular: TicketVenta | null = null;
  autorizadoresDisponibles = [
    'Dra. Elena Ramos (Químico Farmacéutico - Reg. CQFP 14820)',
    'Lic. Carlos Mendoza (Administrador General)',
    'Dr. Roberto Sánchez (Director Técnico de Sede)'
  ];
  anuladoPor: string = this.autorizadoresDisponibles[0];
  pinSeguridad = '';
  motivosAnulacionDisponibles = [
    'Error de digitación o medicamento incorrecto',
    'Cliente desistió de la compra / falta de dinero',
    'Cobro o comprobante duplicado en POS',
    'Producto con empaque defectuoso o deteriorado',
    'Error en el método de pago seleccionado',
    'Otro motivo (especificar en observaciones)'
  ];
  motivoAnulacion: string = this.motivosAnulacionDisponibles[0];
  observacionesAnulacion = '';
  errorAnulacion = '';

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'F12') {
      event.preventDefault();
      if (this.cart.length > 0 && this.cajaAbierta) {
        this.openPayment();
      }
    }
  }

  ngOnInit() {
    const turno = this.ventaService.getTurnoActual();
    this.cajaAbierta = turno.cajaAbierta;
    this.fondoInicial = turno.fondoInicial;
    if (turno.fechaApertura) this.fechaApertura = new Date(turno.fechaApertura);
    if (turno.cajeroActual) this.cajeroActual = turno.cajeroActual;

    this.calculateTotal();
    this.cargarProductosYVentas();
  }

  cargarProductosYVentas() {
    this.productService.listarCatalogoActivos().subscribe(catalogo => {
      this.inventoryService.listarLotesFefo().subscribe(lotes => {
        this.productos = (catalogo || []).map(p => {
          const lotesProd = (lotes || []).filter(l => l.productoId === p.id && l.stock > 0);
          const stockReal = lotesProd.length > 0
            ? lotesProd.reduce((sum, l) => sum + l.stock, 0)
            : (p.stockDisponible || 0);
          const loteMasCercano = lotesProd[0]; // Ya ordenado FEFO

          const vtoStr = loteMasCercano && loteMasCercano.vencimiento
            ? loteMasCercano.vencimiento.slice(2, 7).replace('-', '/')
            : (p.creadoEn ? '12/25' : '11/25');

          return {
            id: p.id,
            nombre: p.nombreComercial,
            principioActivo: p.principioActivo || (p.tipoProducto === 'PERFUME' ? (p.marca || 'Perfumería') : 'Genérico'),
            concentracion: p.concentracion || '',
            laboratorio: p.laboratorio || (p.tipoProducto === 'PERFUME' ? (p.marca || 'Cosmética') : 'Laboratorio'),
            tipo: p.tipoProducto === 'PERFUME' ? `Perfume • ${p.volumenMl || 100}ml` : (p.unidadesPorBlister ? `Blíster x ${p.unidadesPorBlister}` : 'Caja'),
            categoria: p.categoriaNombre || (p.tipoProducto === 'PERFUME' ? 'Cuidado Personal' : 'Venta Libre (OTC)'),
            ubicacion: p.ubicacionAlmacen || 'P1-E1-N1',
            requiereReceta: !!p.requiereReceta,
            esControlado: !!p.esControlado,
            lote: loteMasCercano ? loteMasCercano.lote : 'SIN-LOTE',
            vto: vtoStr,
            diasParaVencer: loteMasCercano ? loteMasCercano.dias : 999,
            stockUnidades: stockReal,
            unidadesPorCaja: p.unidadesPorCaja || 20,
            unidadesPorBlister: p.unidadesPorBlister || 10,
            precioCaja: p.precioCaja || p.precioVenta || 0,
            precioBlister: p.precioBlister || (p.precioCaja ? Number((p.precioCaja / Math.max(1, (p.unidadesPorCaja || 20) / (p.unidadesPorBlister || 10))).toFixed(2)) : p.precioVenta || 0),
            precioUnidad: p.precioUnidad || (p.precioCaja ? Number((p.precioCaja / (p.unidadesPorCaja || 20)).toFixed(2)) : p.precioVenta || 0),
            imagenUrl: p.imagenUrl || this.storageService.obtenerImagenPorDefecto(p.nombreComercial, p.categoriaNombre)
          };
        });

        // Actualizar categorías dinámicamente según productos en el catálogo
        const catSet = new Set(['Todos', 'Analgésicos', 'Antibióticos', 'Cardiología', 'Venta Libre (OTC)', 'Cuidado Personal', 'Vitaminas']);
        this.productos.forEach(pr => {
          if (pr.categoria) catSet.add(pr.categoria);
        });
        this.categories = Array.from(catSet);

        this.filterProducts();
      });
    });

    if (this.ventaService.ventas.length > 0) {
      this.ventasTurno = this.ventaService.ventas as any;
    }
  }

  // --- MÉTODOS DE CAJA ---
  abrirCaja() {
    if (!this.fondoInicial || this.fondoInicial < 0) {
      this.mostrarAlerta('warning', 'Ingresa un fondo de sencillo inicial válido.', 'Monto Inválido');
      return;
    }
    this.cajaAbierta = true;
    this.fechaApertura = new Date();
    this.showAperturaModal = false;

    this.ventaService.guardarTurnoActual({
      cajaAbierta: true,
      fechaApertura: this.fechaApertura.toISOString(),
      cajeroActual: this.cajeroActual,
      fondoInicial: this.fondoInicial,
      sede: this.authService.activeSede()?.nombre || 'Sede Cajamarca Central'
    });

    this.mostrarAlerta('success', `Caja aperturada exitosamente con S/ ${this.fondoInicial.toFixed(2)} de fondo.`, 'Caja Aperturada');
  }

  openCierreCaja() {
    this.declaradoEfectivo = null;
    this.declaradoYape = null;
    this.declaradoPlin = null;
    this.declaradoTarjeta = null;
    this.showCierreModal = true;
  }

  get totalVentasEfectivo(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const ef = v.desglose?.find(d => d.metodo.toLowerCase() === 'efectivo');
        return sum + (ef ? ef.monto : (v.metodo.toLowerCase() === 'efectivo' ? v.total : 0));
      }, 0);
  }

  get totalVentasYape(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const yp = v.desglose?.find(d => d.metodo.toLowerCase() === 'yape');
        return sum + (yp ? yp.monto : (v.metodo.toLowerCase() === 'yape' ? v.total : 0));
      }, 0);
  }

  get totalVentasPlin(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const pl = v.desglose?.find(d => d.metodo.toLowerCase() === 'plin');
        return sum + (pl ? pl.monto : (v.metodo.toLowerCase() === 'plin' ? v.total : 0));
      }, 0);
  }

  get totalVentasTarjeta(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const tj = v.desglose?.find(d => d.metodo.toLowerCase().includes('tarjeta'));
        return sum + (tj ? tj.monto : (v.metodo.toLowerCase().includes('tarjeta') ? v.total : 0));
      }, 0);
  }

  get totalSistemaEsperado(): number {
    return this.fondoInicial + this.totalVentasEfectivo + this.totalVentasYape + this.totalVentasPlin + this.totalVentasTarjeta;
  }

  get totalDeclaradoCajero(): number {
    return (Number(this.declaradoEfectivo) || 0) + (Number(this.declaradoYape) || 0) + (Number(this.declaradoPlin) || 0) + (Number(this.declaradoTarjeta) || 0);
  }

  get diferenciaArqueo(): number {
    return Number((this.totalDeclaradoCajero - this.totalSistemaEsperado).toFixed(2));
  }

  confirmarCierreCaja() {
    this.reporteZCierre = {
      fechaApertura: this.fechaApertura,
      fechaCierre: new Date(),
      cajero: this.cajeroActual,
      sede: this.authService.activeSede()?.nombre || 'Sede Cajamarca Central',
      fondoInicial: this.fondoInicial,
      totalEfectivo: this.totalVentasEfectivo,
      totalYape: this.totalVentasYape,
      totalPlin: this.totalVentasPlin,
      totalTarjeta: this.totalVentasTarjeta,
      totalVentas: this.totalVentasEfectivo + this.totalVentasYape + this.totalVentasPlin + this.totalVentasTarjeta,
      totalEsperado: this.totalSistemaEsperado,
      totalDeclarado: this.totalDeclaradoCajero,
      diferencia: this.diferenciaArqueo,
      ticketsEmitidos: this.ventasTurno.filter(v => v.estado === 'EMITIDO').length,
      ticketsAnulados: this.ventasTurno.filter(v => v.estado === 'ANULADO').length
    };

    this.cajaAbierta = false;
    this.showCierreModal = false;
    this.showReporteZModal = true;

    this.ventaService.guardarTurnoActual({
      cajaAbierta: false,
      fechaApertura: this.fechaApertura.toISOString(),
      fechaCierre: new Date().toISOString(),
      cajeroActual: this.cajeroActual,
      fondoInicial: this.fondoInicial,
      sede: this.authService.activeSede()?.nombre || 'Sede Cajamarca Central',
      totalVentas: this.totalVentasEfectivo + this.totalVentasYape + this.totalVentasPlin + this.totalVentasTarjeta,
      declaradoEfectivo: this.declaradoEfectivo,
      declaradoYape: this.declaradoYape,
      declaradoPlin: this.declaradoPlin,
      declaradoTarjeta: this.declaradoTarjeta,
      diferencia: this.diferenciaArqueo,
      reporteZCierre: this.reporteZCierre
    });
  }

  // --- CONSULTA DNI / RUC SUNAT & RENIEC VIA DECOLECTA ---
  consultarDocumento() {
    this.alertaDocumento = '';
    const num = this.docNumero ? this.docNumero.trim() : '';
    if (!num || (num.length !== 8 && num.length !== 11)) {
      this.alertaDocumento = 'Ingresa un número de DNI (8 dígitos) o RUC (11 dígitos).';
      return;
    }

    this.consultandoDocumento = true;
    this.customerCelular = '';
    this.customerEmail = '';
    this.customerPuntos = 0;

    if (num.length === 8) {
      this.tipoDoc = 'DNI';
      this.consultandoDocumento = false;
      this.alertaDocumento = '';
      if (this.loadCustomerLoyalty(num)) {
        this.mostrarAlerta('info', `Cliente registrado identificado: ${this.customerName}`, 'Cliente Encontrado');
      } else {
        this.isEditingCustomer = true; // Activa ingreso manual directo
        this.mostrarAlerta('info', 'DNI registrado para la venta. Ingrese el nombre del cliente.', 'Ingreso Manual');
      }
    } else if (num.length === 11) {
      this.tipoDoc = 'RUC';
      this.decolectaService.consultarRuc(num).subscribe({
        next: (res) => {
          this.consultandoDocumento = false;
          this.alertaDocumento = '';
          this.customerName = res.razon_social;
          if (res.direccion) {
            this.customerDireccion = res.direccion;
          }
          this.loadCustomerLoyalty(num);
          this.mostrarAlerta('success', `Empresa SUNAT identificada: ${this.customerName}`, 'RUC Encontrado');
        },
        error: (err) => {
          console.warn('Error Decolecta RUC en POS:', err);
          this.consultandoDocumento = false;
          if (this.loadCustomerLoyalty(num)) {
             this.mostrarAlerta('info', `Empresa encontrada en base de datos local: ${this.customerName}`, 'Cliente Local');
          } else {
            this.isEditingCustomer = true;
            this.mostrarAlerta('warning', 'La consulta automática en SUNAT no está disponible. Ingrese la Razón Social manualmente.', 'Aviso SUNAT');
          }
        }
      });
    }
  }

  loadCustomerLoyalty(id: string): boolean {
    const c = this.customerService.getCustomer(id);
    if (c) {
      if (!this.customerName || this.customerName === 'Cliente Público' || this.isEditingCustomer) {
        this.customerName = c.nombre;
      }
      this.customerCelular = c.celular || '';
      this.customerEmail = c.email || '';
      this.customerFechaNacimiento = c.fechaNacimiento || '';
      this.customerPuntos = c.puntosAcumulados;
      return true;
    }
    return false;
  }

  // --- FILTROS Y BÚSQUEDA ---
  selectCategory(cat: string) {
    this.selectedCategory = cat;
    this.filterProducts();
  }

  filterProducts() {
    let result = this.productos;
    if (this.selectedCategory !== 'Todos') {
      result = result.filter(p => p.categoria === this.selectedCategory);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(p => 
        p.nombre.toLowerCase().includes(q) || 
        p.principioActivo.toLowerCase().includes(q) ||
        p.laboratorio.toLowerCase().includes(q)
      );
    }
    this.filteredProducts = result;
  }

  // --- LIMPIEZA RÁPIDA DE BÚSQUEDA ---
  limpiarBusqueda() {
    this.searchQuery = '';
    this.filterProducts();
  }

  // --- GESTIÓN DE TARJETA: CANTIDAD Y PRESENTACIÓN ---
  getCantidadCard(id: string | number): number {
    return this.cantidadesPorProducto[id] || 1;
  }

  incrementarCantidadCard(prod: ProductoFarmacia) {
    const pres = this.getPresentacionCard(prod);
    const factor = pres === 'caja' ? prod.unidadesPorCaja : pres === 'blister' ? prod.unidadesPorBlister : 1;
    const actual = this.getCantidadCard(prod.id);
    const maxQty = Math.floor(prod.stockUnidades / factor);
    if (actual < maxQty) {
      this.cantidadesPorProducto[prod.id] = actual + 1;
    } else {
      this.mostrarAlerta('warning', `Stock máximo disponible: ${maxQty} ${pres}(s).`, 'Stock Límite');
    }
  }

  decrementarCantidadCard(prod: ProductoFarmacia) {
    const actual = this.getCantidadCard(prod.id);
    if (actual > 1) {
      this.cantidadesPorProducto[prod.id] = actual - 1;
    }
  }

  getPresentacionCard(prod: ProductoFarmacia): 'unidad' | 'blister' | 'caja' {
    return this.presentacionPorProducto[prod.id] || (prod.precioUnidad ? 'unidad' : 'caja');
  }

  setPresentacionCard(prod: ProductoFarmacia, pres: 'unidad' | 'blister' | 'caja') {
    this.presentacionPorProducto[prod.id] = pres;
    this.cantidadesPorProducto[prod.id] = 1;
  }

  getPrecioCard(prod: ProductoFarmacia): number {
    const pres = this.getPresentacionCard(prod);
    return pres === 'caja' ? prod.precioCaja : pres === 'blister' ? prod.precioBlister : prod.precioUnidad;
  }

  getStockPresentacion(prod: ProductoFarmacia): number {
    const pres = this.getPresentacionCard(prod);
    const factor = pres === 'caja' ? prod.unidadesPorCaja : pres === 'blister' ? prod.unidadesPorBlister : 1;
    return Math.floor(prod.stockUnidades / factor);
  }

  agregarAlCarritoCard(prod: ProductoFarmacia) {
    const pres = this.getPresentacionCard(prod);
    const qty = this.getCantidadCard(prod.id);
    this.addToCart(prod, pres, qty);
    this.cantidadesPorProducto[prod.id] = 1;
  }

  cambiarVistaModo(modo: 'cards' | 'lista') {
    this.vistaModo = modo;
    try {
      localStorage.setItem('medicare_pos_view_mode', modo);
    } catch (e) {
      console.warn('No se pudo guardar la preferencia de vista en localStorage:', e);
    }
  }

  // --- SUBIDA RÁPIDA DE IMAGEN (SUPABASE STORAGE 1 GB) ---
  abrirModalFoto(prod: ProductoFarmacia, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.productoParaFoto = prod;
    this.urlFotoDirecta = prod.imagenUrl || '';
    this.errorSubidaFoto = '';
    this.showModalImagen = true;
  }

  cerrarModalFoto() {
    this.showModalImagen = false;
    this.productoParaFoto = null;
    this.urlFotoDirecta = '';
    this.subiendoFoto = false;
    this.errorSubidaFoto = '';
  }

  async onArchivoFotoSeleccionado(event: any) {
    const file = event.target?.files?.[0];
    if (!file || !this.productoParaFoto) return;

    this.subiendoFoto = true;
    this.errorSubidaFoto = '';

    const res = await this.storageService.subirImagenProducto(file, String(this.productoParaFoto.id));
    this.subiendoFoto = false;

    if (res.error) {
      this.errorSubidaFoto = res.error;
      this.mostrarAlerta('error', res.error, 'Error al Subir');
    } else if (res.url) {
      this.aplicarFotoAProducto(res.url);
      this.mostrarAlerta('success', 'Foto subida exitosamente a Supabase Storage (1 GB).', 'Imagen Actualizada');
      this.cerrarModalFoto();
    }
  }

  guardarFotoUrl() {
    if (!this.productoParaFoto || !this.urlFotoDirecta.trim()) return;
    this.aplicarFotoAProducto(this.urlFotoDirecta.trim());
    this.mostrarAlerta('success', 'URL de imagen asignada correctamente al producto.', 'Imagen Actualizada');
    this.cerrarModalFoto();
  }

  private aplicarFotoAProducto(nuevaUrl: string) {
    if (!this.productoParaFoto) return;
    this.productoParaFoto.imagenUrl = nuevaUrl;

    // Actualizar también en el catálogo maestro y persistir
    this.productService.obtenerProductoCatalogo(String(this.productoParaFoto.id)).subscribe(prodCat => {
      if (prodCat) {
        prodCat.imagenUrl = nuevaUrl;
        this.productService.guardarEnCatalogo(prodCat).subscribe();
      }
    });

    // Actualizar en el carrito si ya fue agregado
    this.cart.forEach(item => {
      if (item.id === this.productoParaFoto?.id) {
        item.imagenUrl = nuevaUrl;
      }
    });
  }

  // --- MÉTODOS RÁPIDOS DE PAGO EN CARRITO ---
  seleccionarMetodoRapido(metodo: string) {
    this.metodoPagoRapido = metodo;
    if (metodo === 'Otros') {
      this.openPayment();
      this.setPaymentMode('mixto');
    }
  }

  cobrarTotalidad() {
    if (this.cart.length === 0) {
      this.mostrarAlerta('warning', 'El carrito está vacío. Agrega productos para realizar una venta.', 'Carrito Vacío');
      return;
    }
    this.paymentMethod = this.metodoPagoRapido === 'Visa' ? 'Tarjeta' : this.metodoPagoRapido;
    this.openPayment();
  }

  imprimirUltimoComprobante() {
    if (this.ventasTurno.length > 0) {
      const ultimo = this.ventasTurno[this.ventasTurno.length - 1];
      this.ticketData = ultimo;
      this.showTicketModal = true;
      setTimeout(() => window.print(), 300);
    } else {
      this.mostrarAlerta('info', 'No hay comprobantes emitidos en el turno actual para imprimir.', 'Sin Comprobantes');
    }
  }

  get folioActual(): string {
    const num = (this.ventasTurno.length + 1001).toString().padStart(7, '0');
    return num;
  }

  // --- VENTA FRACCIONADA (CAJA, BLISTER, UNIDAD) ---
  addToCart(prod: ProductoFarmacia, presentacion: 'caja' | 'blister' | 'unidad' = 'unidad', cantidad: number = 1) {
    if (prod.stockUnidades === 0) {
      this.verSustitutos(prod);
      return;
    }

    // Si es medicamento controlado, pedir receta
    if (prod.esControlado) {
      this.productoControladoPendiente = { prod, presentacion, cantidad };
      this.cmpMedico = '';
      this.nroReceta = '';
      this.pacienteReceta = this.customerName;
      this.showRecetaModal = true;
      return;
    }

    this.ejecutarAgregarAlCarrito(prod, presentacion, cantidad);
  }

  confirmarRecetaControlada() {
    if (!this.cmpMedico || !this.nroReceta) {
      this.mostrarAlerta('warning', 'Debe ingresar obligatoriamente el CMP del médico y el N° de Receta médica.', 'Receta Requerida');
      return;
    }
    const { prod, presentacion, cantidad } = this.productoControladoPendiente;
    this.ejecutarAgregarAlCarrito(prod, presentacion, cantidad || 1, {
      cmpMedico: this.cmpMedico,
      nroReceta: this.nroReceta,
      paciente: this.pacienteReceta || this.customerName
    });
    this.showRecetaModal = false;
    this.productoControladoPendiente = null;
  }

  private ejecutarAgregarAlCarrito(prod: ProductoFarmacia, presentacion: 'caja' | 'blister' | 'unidad', cantidad: number = 1, receta?: any) {
    const factorUnidades = presentacion === 'caja' ? prod.unidadesPorCaja :
                           presentacion === 'blister' ? prod.unidadesPorBlister : 1;

    const precioAplicado = presentacion === 'caja' ? prod.precioCaja :
                           presentacion === 'blister' ? prod.precioBlister : prod.precioUnidad;

    const itemLabel = `${prod.nombre}`;
    const unidadesToAdd = factorUnidades * cantidad;

    const existing = this.cart.find(item => item.id === prod.id && item.presentacion === presentacion);
    if (existing) {
      if ((existing.unidadesTotales + unidadesToAdd) <= prod.stockUnidades) {
        existing.cantidad += cantidad;
        existing.unidadesTotales += unidadesToAdd;
        existing.subtotal = existing.cantidad * existing.precio;
      } else {
        this.mostrarAlerta('warning', 'No hay suficiente stock para añadir esa cantidad.', 'Stock Límite');
      }
    } else {
      this.cart.push({
        id: prod.id,
        nombre: itemLabel,
        prodRef: prod,
        presentacion,
        factorUnidades,
        unidadesTotales: unidadesToAdd,
        precio: precioAplicado,
        cantidad: cantidad,
        subtotal: precioAplicado * cantidad,
        receta,
        imagenUrl: prod.imagenUrl
      });
    }
    this.calculateTotal();
  }

  // --- SUSTITUTOS / GENÉRICOS ---
  verSustitutos(prod: ProductoFarmacia) {
    this.productoParaSustituir = prod;
    // Buscar medicamentos con el mismo principio activo
    this.sustitutosSugeridos = this.productos.filter(p => 
      p.id !== prod.id && 
      p.principioActivo.toLowerCase() === prod.principioActivo.toLowerCase() &&
      p.stockUnidades > 0
    );
    this.showSustitutosModal = true;
  }

  // --- CARRITO CONTROLS ---
  removeFromCart(index: number) {
    this.cart.splice(index, 1);
    this.calculateTotal();
  }

  updateQuantity(index: number, change: number) {
    const item = this.cart[index];
    const newQty = item.cantidad + change;
    const nuevasUnidades = newQty * item.factorUnidades;
    
    if (newQty > 0 && nuevasUnidades <= item.prodRef.stockUnidades) {
      item.cantidad = newQty;
      item.unidadesTotales = nuevasUnidades;
      item.subtotal = item.cantidad * item.precio;
    } else if (newQty <= 0) {
      this.removeFromCart(index);
    } else {
      this.mostrarAlerta('warning', 'No hay suficiente stock para incrementar la cantidad.', 'Stock Límite');
    }
    this.calculateTotal();
  }

  calculateTotal() {
    this.subtotal = this.cart.reduce((sum, item) => sum + (item.precio * item.cantidad / 1.18), 0);
    this.total = this.cart.reduce((sum, item) => sum + item.subtotal, 0);
    this.igv = this.total - this.subtotal;
  }

  // --- MODAL DE PAGO ---
  openPayment() {
    if (this.cart.length === 0) return;
    this.paymentMode = 'simple';
    this.paymentMethod = 'Efectivo';
    this.montoRecibido = this.total;
    
    this.pagoEfectivo = null;
    this.efectivoRecibido = null;
    this.pagoYape = null;
    this.yapeRef = '';
    this.pagoPlin = null;
    this.plinRef = '';
    this.pagoTarjeta = null;
    this.tarjetaRef = '';
    this.pagoTransferencia = null;
    this.transfRef = '';
    
    this.showPaymentModal = true;
  }

  setPaymentMode(mode: 'simple' | 'mixto') {
    this.paymentMode = mode;
    if (mode === 'mixto') {
      this.pagoYape = Number((this.total / 2).toFixed(2));
      this.pagoEfectivo = Number((this.total - this.pagoYape).toFixed(2));
      this.efectivoRecibido = this.pagoEfectivo;
    }
  }

  selectPayment(method: string) {
    this.paymentMethod = method;
  }

  get cambioSimple(): number {
    if (!this.montoRecibido || this.montoRecibido < this.total) return 0;
    return this.montoRecibido - this.total;
  }

  get totalCubiertoMixto(): number {
    const ef = Number(this.pagoEfectivo) || 0;
    const yp = Number(this.pagoYape) || 0;
    const pl = Number(this.pagoPlin) || 0;
    const tj = Number(this.pagoTarjeta) || 0;
    const tr = Number(this.pagoTransferencia) || 0;
    return Number((ef + yp + pl + tj + tr).toFixed(2));
  }

  get restanteMixto(): number {
    return Number((this.total - this.totalCubiertoMixto).toFixed(2));
  }

  get cambioEfectivoMixto(): number {
    const pagoEf = Number(this.pagoEfectivo) || 0;
    const recEf = Number(this.efectivoRecibido) || 0;
    if (recEf > pagoEf && pagoEf > 0) {
      return Number((recEf - pagoEf).toFixed(2));
    }
    return 0;
  }

  get puedeCompletarVenta(): boolean {
    if (this.paymentMode === 'simple') {
      if (this.paymentMethod === 'Efectivo') {
        return (this.montoRecibido || 0) >= this.total;
      }
      return true;
    } else {
      const cubiertoExacto = Math.abs(this.totalCubiertoMixto - this.total) < 0.01;
      const efectivoValido = !this.pagoEfectivo || ((this.efectivoRecibido || 0) >= this.pagoEfectivo);
      return cubiertoExacto && efectivoValido;
    }
  }

  asignarRestante(metodo: 'efectivo' | 'yape' | 'plin' | 'tarjeta' | 'transf') {
    const actual = (metodo === 'efectivo' ? Number(this.pagoEfectivo) || 0 :
                    metodo === 'yape' ? Number(this.pagoYape) || 0 :
                    metodo === 'plin' ? Number(this.pagoPlin) || 0 :
                    metodo === 'tarjeta' ? Number(this.pagoTarjeta) || 0 :
                    Number(this.pagoTransferencia) || 0);
    
    const nuevoMonto = Number((actual + this.restanteMixto).toFixed(2));
    if (nuevoMonto < 0) return;

    if (metodo === 'efectivo') {
      this.pagoEfectivo = nuevoMonto;
      this.efectivoRecibido = nuevoMonto;
    } else if (metodo === 'yape') {
      this.pagoYape = nuevoMonto;
    } else if (metodo === 'plin') {
      this.pagoPlin = nuevoMonto;
    } else if (metodo === 'tarjeta') {
      this.pagoTarjeta = nuevoMonto;
    } else if (metodo === 'transf') {
      this.pagoTransferencia = nuevoMonto;
    }
  }

  completeSale() {
    if (!this.puedeCompletarVenta) return;

    let metodoLabel = this.paymentMethod;
    let desglosePagos: PagoDetalle[] = [];

    if (this.paymentMode === 'mixto') {
      metodoLabel = 'Pago Mixto';
      if (this.pagoEfectivo && this.pagoEfectivo > 0) {
        desglosePagos.push({ metodo: 'Efectivo', monto: this.pagoEfectivo });
      }
      if (this.pagoYape && this.pagoYape > 0) {
        desglosePagos.push({ metodo: 'Yape', monto: this.pagoYape, referencia: this.yapeRef });
      }
      if (this.pagoPlin && this.pagoPlin > 0) {
        desglosePagos.push({ metodo: 'Plin', monto: this.pagoPlin, referencia: this.plinRef });
      }
      if (this.pagoTarjeta && this.pagoTarjeta > 0) {
        desglosePagos.push({ metodo: 'Tarjeta', monto: this.pagoTarjeta, referencia: this.tarjetaRef });
      }
      if (this.pagoTransferencia && this.pagoTransferencia > 0) {
        desglosePagos.push({ metodo: 'Transferencia', monto: this.pagoTransferencia, referencia: this.transfRef });
      }
    } else {
      desglosePagos.push({ metodo: this.paymentMethod, monto: this.total });
    }

    // Descontar Stock en unidades (en POS y en almacén persistente)
    this.cart.forEach(cartItem => {
      const prod = this.productos.find(p => p.id === cartItem.id);
      if (prod) {
        prod.stockUnidades = Math.max(0, prod.stockUnidades - cartItem.unidadesTotales);
      }
      this.inventoryService.descontarStockFefo(String(cartItem.id), cartItem.unidadesTotales).subscribe();
    });
    this.filterProducts();

    // Extraer datos de receta si existiera en el carrito
    const itemConReceta = this.cart.find(it => it.receta);

    // Guardar/Actualizar Cliente y Acumular Puntos
    if (this.docNumero) {
      this.customerService.addOrUpdateCustomer({
        id: this.docNumero,
        nombre: this.customerName,
        celular: this.customerCelular,
        email: this.customerEmail,
        direccion: this.customerDireccion,
        fechaNacimiento: this.customerFechaNacimiento ? this.customerFechaNacimiento.trim() : undefined,
        puntosAcumulados: this.customerPuntos // Mantiene los anteriores
      });
      this.customerService.addPuntos(this.docNumero, this.total);
    }

    const nuevoTicket: TicketVenta = {
      id: (this.tipoComprobante === 'Factura' ? 'F001-' : this.tipoComprobante === 'Boleta' ? 'B001-' : 'TKT-') + Math.floor(100000 + Math.random() * 900000),
      fecha: new Date(),
      items: [...this.cart],
      subtotal: this.subtotal,
      igv: this.igv,
      total: this.total,
      modoPago: this.paymentMode,
      metodo: metodoLabel,
      desglose: desglosePagos,
      efectivoRecibido: this.paymentMode === 'mixto' ? this.efectivoRecibido : this.montoRecibido,
      cambio: this.paymentMode === 'mixto' ? this.cambioEfectivoMixto : this.cambioSimple,
      cliente: this.customerName,
      dni: this.docNumero || '00000000',
      tipoComprobante: this.tipoComprobante,
      datosReceta: itemConReceta ? itemConReceta.receta : undefined,
      sede: this.authService.activeSede()?.nombre || 'Sede Cajamarca Central',
      estado: 'EMITIDO'
    };
    
    this.ticketData = nuevoTicket;
    
    // Persistir venta directamente en Supabase / Local
    this.ventaService.registrarVenta(nuevoTicket as any).subscribe();
    this.ventasTurno = this.ventaService.ventas as any;
    
    this.showPaymentModal = false;
    this.showTicketModal = true;
    
    // Limpiar carrito y resetear datos del cliente para la siguiente venta
    this.cart = [];
    this.calculateTotal();
    this.docNumero = '';
    this.customerName = 'Cliente Público';
    this.customerDireccion = '';
    this.customerCelular = '';
    this.customerEmail = '';
    this.customerFechaNacimiento = '';
    this.customerPuntos = 0;
    this.alertaDocumento = '';
    this.isEditingCustomer = false;
  }
  
  closeTicket() {
    this.showTicketModal = false;
    this.ticketData = null;
  }
  
  printTicket() {
    window.print();
  }

  // --- ANULACIÓN SEGURA CON PIN ---
  openAnulacionModal(ticket?: TicketVenta) {
    this.ticketAAnular = ticket || (this.ventasTurno.find(v => v.estado === 'EMITIDO') || null);
    this.pinSeguridad = '';
    this.errorAnulacion = '';
    this.showAnulacionModal = true;
  }

  confirmarAnulacion() {
    if (!this.ticketAAnular) {
      this.errorAnulacion = 'Selecciona un ticket válido para anular.';
      return;
    }

    if (!this.pinSeguridad || this.pinSeguridad.trim().length < 4) {
      this.errorAnulacion = 'PIN de seguridad inválido. Debe contener al menos 4 dígitos.';
      return;
    }

    // Reingresar stock (en POS y en almacén persistente)
    this.ticketAAnular.items.forEach(it => {
      const prod = this.productos.find(p => p.id === it.id);
      if (prod) {
        prod.stockUnidades += it.unidadesTotales;
      }
      this.inventoryService.reingresarStock(String(it.id), it.unidadesTotales).subscribe();
    });
    this.filterProducts();

    this.ticketAAnular.estado = 'ANULADO';
    this.ticketAAnular.anulacionInfo = {
      autorizadoPor: this.anuladoPor,
      motivo: this.motivoAnulacion,
      observaciones: this.observacionesAnulacion,
      fecha: new Date()
    };

    // Persistir anulación en Supabase / Local
    this.ventaService.anularVenta(this.ticketAAnular.id, this.ticketAAnular.anulacionInfo).subscribe();

    const ticketId = this.ticketAAnular.id;
    this.showAnulacionModal = false;
    this.mostrarAlerta('success', `Ticket ${ticketId} anulado correctamente. Stock reingresado a inventario.`, 'Ticket Anulado');
    this.ticketAAnular = null;
  }
}
