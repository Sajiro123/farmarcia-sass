import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

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
  id: number;
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
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos.html'
})
export class Pos implements OnInit {
  public authService = inject(AuthService);
  
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
  declaradoTarjeta: number | null = null;
  reporteZCierre: any = null;
  showReporteZModal = false;

  // ================= 2. CATÁLOGO CON FRACCIONAMIENTO Y RECETAS =================
  searchQuery = '';
  selectedCategory = 'Todos';
  categories = ['Todos', 'Analgésicos', 'Antibióticos', 'Cardiología', 'Venta Libre (OTC)', 'Cuidado Personal'];

  productos: ProductoFarmacia[] = [
    {
      id: 1,
      nombre: 'Paracetamol 500mg',
      principioActivo: 'Paracetamol',
      concentracion: '500mg',
      laboratorio: 'Genfar',
      tipo: 'Genérico • Blister x 10',
      categoria: 'Analgésicos',
      ubicacion: 'P1-E2-N1',
      requiereReceta: false,
      esControlado: false,
      lote: 'LT-982134',
      vto: '12/25',
      diasParaVencer: 480,
      stockUnidades: 450,
      unidadesPorCaja: 100,
      unidadesPorBlister: 10,
      precioCaja: 4.50,
      precioBlister: 0.50,
      precioUnidad: 0.10
    },
    {
      id: 2,
      nombre: 'Amoxicilina + Ác. Clavulánico 500/125mg',
      principioActivo: 'Amoxicilina + Clavulánico',
      concentracion: '500mg / 125mg',
      laboratorio: 'Portugal',
      tipo: 'Antibiótico • Blister x 6',
      categoria: 'Antibióticos',
      ubicacion: 'P1-E3-N2',
      requiereReceta: true,
      esControlado: false,
      lote: 'LT-772190',
      vto: '08/25',
      diasParaVencer: 65,
      stockUnidades: 60,
      unidadesPorCaja: 30,
      unidadesPorBlister: 6,
      precioCaja: 32.00,
      precioBlister: 7.00,
      precioUnidad: 1.30
    },
    {
      id: 3,
      nombre: 'Clonazepam 2mg (Controlado)',
      principioActivo: 'Clonazepam',
      concentracion: '2mg',
      laboratorio: 'Sandoz',
      tipo: 'Psicotrópico • Caja x 30',
      categoria: 'Cardiología',
      ubicacion: 'P3-CAJA-SEGURIDAD',
      requiereReceta: true,
      esControlado: true, // Requiere CMP y N° Receta
      lote: 'LT-48201',
      vto: '04/26',
      diasParaVencer: 600,
      stockUnidades: 90,
      unidadesPorCaja: 30,
      unidadesPorBlister: 10,
      precioCaja: 28.00,
      precioBlister: 10.00,
      precioUnidad: 1.20
    },
    {
      id: 4,
      nombre: 'Panadol Antigripal NF',
      principioActivo: 'Paracetamol + Clorfenamina + Fenilefrina',
      concentracion: '500/2/10mg',
      laboratorio: 'GSK',
      tipo: 'Marca • Sobre x 2',
      categoria: 'Venta Libre (OTC)',
      ubicacion: 'P2-E1-N1',
      requiereReceta: false,
      esControlado: false,
      lote: 'LT-GSK92',
      vto: '11/25',
      diasParaVencer: 450,
      stockUnidades: 210,
      unidadesPorCaja: 100,
      unidadesPorBlister: 2,
      precioCaja: 110.00,
      precioBlister: 2.50,
      precioUnidad: 1.30
    },
    {
      id: 5,
      nombre: 'Ibuprofeno 400mg',
      principioActivo: 'Ibuprofeno',
      concentracion: '400mg',
      laboratorio: 'Genfar',
      tipo: 'Genérico • Tableta',
      categoria: 'Analgésicos',
      ubicacion: 'P1-E2-N2',
      requiereReceta: false,
      esControlado: false,
      lote: 'LT-IBU20',
      vto: '11/24',
      diasParaVencer: 25, // Pronto vencimiento
      stockUnidades: 0, // Agotado para probar sustitutos
      unidadesPorCaja: 100,
      unidadesPorBlister: 10,
      precioCaja: 7.00,
      precioBlister: 0.80,
      precioUnidad: 0.15
    },
    {
      id: 6,
      nombre: 'Vitamina C 1g Efervescente',
      principioActivo: 'Ácido Ascórbico',
      concentracion: '1000mg',
      laboratorio: 'Bayer Redoxon',
      tipo: 'Tubo x 10',
      categoria: 'Cuidado Personal',
      ubicacion: 'P2-E4-N1',
      requiereReceta: false,
      esControlado: false,
      lote: 'LT-VIT34',
      vto: '05/26',
      diasParaVencer: 580,
      stockUnidades: 34,
      unidadesPorCaja: 10,
      unidadesPorBlister: 1,
      precioCaja: 15.00,
      precioBlister: 15.00,
      precioUnidad: 1.80
    }
  ];

  filteredProducts = [...this.productos];
  sustitutosSugeridos: ProductoFarmacia[] = [];
  showSustitutosModal = false;
  productoParaSustituir: ProductoFarmacia | null = null;

  // Modal para receta de psicotrópicos
  showRecetaModal = false;
  productoControladoPendiente: any = null;
  cmpMedico = '';
  nroReceta = '';
  pacienteReceta = '';

  // ================= 3. CARRITO & CONSULTA SUNAT/RENIEC =================
  cart: any[] = [];
  subtotal = 0;
  igv = 0;
  total = 0;

  // Cliente & Comprobante
  tipoComprobante: 'Boleta' | 'Factura' | 'Ticket' = 'Boleta';
  tipoDoc: 'DNI' | 'RUC' | 'SIN_DOC' = 'DNI';
  docNumero = '';
  customerName = 'Cliente Público';
  customerDireccion = '';
  consultandoDocumento = false;
  isEditingCustomer = false;

  // ================= 4. MODAL DE PAGO (ÚNICO / MIXTO) =================
  showPaymentModal = false;
  paymentMode: 'simple' | 'mixto' = 'simple';
  paymentMethod = 'Efectivo';
  montoRecibido: number | null = null;

  pagoEfectivo: number | null = null;
  efectivoRecibido: number | null = null;
  pagoYape: number | null = null;
  yapeRef = '';
  pagoTarjeta: number | null = null;
  tarjetaRef = '';
  pagoTransferencia: number | null = null;
  transfRef = '';

  // Ticket Modal
  showTicketModal = false;
  ticketData: TicketVenta | null = null;

  // ================= 5. HISTORIAL & ANULACIÓN CON PIN =================
  ventasTurno: TicketVenta[] = [
    {
      id: 'TKT-829104',
      fecha: new Date(Date.now() - 3600000),
      items: [{ id: 4, nombre: 'Panadol Antigripal NF (Blister)', cantidad: 2, precio: 2.50, subtotal: 5.00 }],
      subtotal: 4.24,
      igv: 0.76,
      total: 5.00,
      modoPago: 'simple',
      metodo: 'Yape / Plin',
      desglose: [{ metodo: 'Yape / Plin', monto: 5.00, referencia: 'Op: 489201' }],
      cliente: 'Juan Pérez',
      dni: '45892018',
      tipoComprobante: 'Boleta',
      sede: 'Sede Principal',
      estado: 'EMITIDO'
    }
  ];

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
    this.calculateTotal();
  }

  // --- MÉTODOS DE CAJA ---
  abrirCaja() {
    if (!this.fondoInicial || this.fondoInicial < 0) {
      alert('Ingresa un fondo de sencillo inicial válido.');
      return;
    }
    this.cajaAbierta = true;
    this.fechaApertura = new Date();
    this.showAperturaModal = false;
    alert(`✅ Caja aperturada exitosamente con S/ ${this.fondoInicial.toFixed(2)} de fondo.`);
  }

  openCierreCaja() {
    this.declaradoEfectivo = null;
    this.declaradoYape = null;
    this.declaradoTarjeta = null;
    this.showCierreModal = true;
  }

  get totalVentasEfectivo(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const ef = v.desglose.find(d => d.metodo === 'Efectivo');
        return sum + (ef ? ef.monto : (v.metodo === 'Efectivo' ? v.total : 0));
      }, 0);
  }

  get totalVentasYape(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const yp = v.desglose.find(d => d.metodo.includes('Yape'));
        return sum + (yp ? yp.monto : (v.metodo.includes('Yape') ? v.total : 0));
      }, 0);
  }

  get totalVentasTarjeta(): number {
    return this.ventasTurno
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const tj = v.desglose.find(d => d.metodo.includes('Tarjeta'));
        return sum + (tj ? tj.monto : (v.metodo.includes('Tarjeta') ? v.total : 0));
      }, 0);
  }

  get totalSistemaEsperado(): number {
    return this.fondoInicial + this.totalVentasEfectivo + this.totalVentasYape + this.totalVentasTarjeta;
  }

  get totalDeclaradoCajero(): number {
    return (Number(this.declaradoEfectivo) || 0) + (Number(this.declaradoYape) || 0) + (Number(this.declaradoTarjeta) || 0);
  }

  get diferenciaArqueo(): number {
    return Number((this.totalDeclaradoCajero - this.totalSistemaEsperado).toFixed(2));
  }

  confirmarCierreCaja() {
    this.reporteZCierre = {
      fechaApertura: this.fechaApertura,
      fechaCierre: new Date(),
      cajero: this.cajeroActual,
      sede: this.authService.activeSede()?.nombre || 'Sede Principal',
      fondoInicial: this.fondoInicial,
      totalEfectivo: this.totalVentasEfectivo,
      totalYape: this.totalVentasYape,
      totalTarjeta: this.totalVentasTarjeta,
      totalVentas: this.totalVentasEfectivo + this.totalVentasYape + this.totalVentasTarjeta,
      totalEsperado: this.totalSistemaEsperado,
      totalDeclarado: this.totalDeclaradoCajero,
      diferencia: this.diferenciaArqueo,
      ticketsEmitidos: this.ventasTurno.filter(v => v.estado === 'EMITIDO').length,
      ticketsAnulados: this.ventasTurno.filter(v => v.estado === 'ANULADO').length
    };

    this.cajaAbierta = false;
    this.showCierreModal = false;
    this.showReporteZModal = true;
  }

  // --- CONSULTA DNI / RUC SUNAT & RENIEC ---
  consultarDocumento() {
    if (!this.docNumero || this.docNumero.length < 8) {
      alert('Ingresa un número de DNI (8 dígitos) o RUC (11 dígitos).');
      return;
    }

    this.consultandoDocumento = true;
    setTimeout(() => {
      this.consultandoDocumento = false;
      if (this.docNumero.length === 8) {
        this.tipoDoc = 'DNI';
        this.tipoComprobante = 'Boleta';
        this.customerName = 'GARCIA LOPEZ, MARIA ELENA';
        this.customerDireccion = 'Av. Primavera 450, Lima';
      } else if (this.docNumero.length === 11) {
        this.tipoDoc = 'RUC';
        this.tipoComprobante = 'Factura';
        this.customerName = 'CLINICA SANTA MARIA S.A.C.';
        this.customerDireccion = 'Av. Javier Prado Este 1290, San Isidro';
      }
    }, 400);
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

  // --- VENTA FRACCIONADA (CAJA, BLISTER, UNIDAD) ---
  addToCart(prod: ProductoFarmacia, presentacion: 'caja' | 'blister' | 'unidad' = 'blister') {
    if (prod.stockUnidades === 0) {
      this.verSustitutos(prod);
      return;
    }

    // Si es medicamento controlado, pedir receta
    if (prod.esControlado) {
      this.productoControladoPendiente = { prod, presentacion };
      this.cmpMedico = '';
      this.nroReceta = '';
      this.pacienteReceta = this.customerName;
      this.showRecetaModal = true;
      return;
    }

    this.ejecutarAgregarAlCarrito(prod, presentacion);
  }

  confirmarRecetaControlada() {
    if (!this.cmpMedico || !this.nroReceta) {
      alert('Debe ingresar obligatoriamente el CMP del médico y el N° de Receta médica.');
      return;
    }
    const { prod, presentacion } = this.productoControladoPendiente;
    this.ejecutarAgregarAlCarrito(prod, presentacion, {
      cmpMedico: this.cmpMedico,
      nroReceta: this.nroReceta,
      paciente: this.pacienteReceta || this.customerName
    });
    this.showRecetaModal = false;
    this.productoControladoPendiente = null;
  }

  private ejecutarAgregarAlCarrito(prod: ProductoFarmacia, presentacion: 'caja' | 'blister' | 'unidad', receta?: any) {
    const factorUnidades = presentacion === 'caja' ? prod.unidadesPorCaja :
                           presentacion === 'blister' ? prod.unidadesPorBlister : 1;

    const precioAplicado = presentacion === 'caja' ? prod.precioCaja :
                           presentacion === 'blister' ? prod.precioBlister : prod.precioUnidad;

    const itemLabel = `${prod.nombre} (${presentacion.toUpperCase()})`;

    const existing = this.cart.find(item => item.id === prod.id && item.presentacion === presentacion);
    if (existing) {
      if ((existing.unidadesTotales + factorUnidades) <= prod.stockUnidades) {
        existing.cantidad++;
        existing.unidadesTotales += factorUnidades;
        existing.subtotal = existing.cantidad * existing.precio;
      } else {
        alert('No hay suficiente stock en unidades para añadir otra unidad.');
      }
    } else {
      this.cart.push({
        id: prod.id,
        nombre: itemLabel,
        prodRef: prod,
        presentacion,
        factorUnidades,
        unidadesTotales: factorUnidades,
        precio: precioAplicado,
        cantidad: 1,
        subtotal: precioAplicado,
        receta
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
    } else if (newQty === 0) {
      this.removeFromCart(index);
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
    const tj = Number(this.pagoTarjeta) || 0;
    const tr = Number(this.pagoTransferencia) || 0;
    return Number((ef + yp + tj + tr).toFixed(2));
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

  asignarRestante(metodo: 'efectivo' | 'yape' | 'tarjeta' | 'transf') {
    const actual = (metodo === 'efectivo' ? Number(this.pagoEfectivo) || 0 :
                    metodo === 'yape' ? Number(this.pagoYape) || 0 :
                    metodo === 'tarjeta' ? Number(this.pagoTarjeta) || 0 :
                    Number(this.pagoTransferencia) || 0);
    
    const nuevoMonto = Number((actual + this.restanteMixto).toFixed(2));
    if (nuevoMonto < 0) return;

    if (metodo === 'efectivo') {
      this.pagoEfectivo = nuevoMonto;
      this.efectivoRecibido = nuevoMonto;
    } else if (metodo === 'yape') {
      this.pagoYape = nuevoMonto;
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
      metodoLabel = 'Pago Mixto / Combinado';
      if (this.pagoYape && this.pagoYape > 0) {
        desglosePagos.push({ metodo: 'Yape / Plin', monto: this.pagoYape, referencia: this.yapeRef });
      }
      if (this.pagoEfectivo && this.pagoEfectivo > 0) {
        desglosePagos.push({ metodo: 'Efectivo', monto: this.pagoEfectivo });
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

    // Descontar Stock en unidades
    this.cart.forEach(cartItem => {
      const prod = this.productos.find(p => p.id === cartItem.id);
      if (prod) {
        prod.stockUnidades = Math.max(0, prod.stockUnidades - cartItem.unidadesTotales);
      }
    });
    this.filterProducts();

    // Extraer datos de receta si existiera en el carrito
    const itemConReceta = this.cart.find(it => it.receta);

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
      sede: this.authService.activeSede()?.nombre || 'Sede Principal',
      estado: 'EMITIDO'
    };
    
    this.ventasTurno.unshift(nuevoTicket);
    this.ticketData = nuevoTicket;
    
    this.showPaymentModal = false;
    this.showTicketModal = true;
    
    // Limpiar carrito
    this.cart = [];
    this.calculateTotal();
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

    // Reingresar stock
    this.ticketAAnular.items.forEach(it => {
      const prod = this.productos.find(p => p.id === it.id);
      if (prod) {
        prod.stockUnidades += it.unidadesTotales;
      }
    });
    this.filterProducts();

    this.ticketAAnular.estado = 'ANULADO';
    this.ticketAAnular.anulacionInfo = {
      autorizadoPor: this.anuladoPor,
      motivo: this.motivoAnulacion,
      observaciones: this.observacionesAnulacion,
      fecha: new Date()
    };

    this.showAnulacionModal = false;
    alert(`✅ Ticket ${this.ticketAAnular.id} anulado. Stock reingresado a inventario.`);
    this.ticketAAnular = null;
  }
}
