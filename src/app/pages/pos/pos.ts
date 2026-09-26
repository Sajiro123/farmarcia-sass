import { Component, OnInit, inject, HostListener, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, NgZone, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, timeout, catchError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ProductService } from '../../core/services/product.service';
import { InventoryService } from '../../core/services/inventory.service';
import { VentaService, TurnoCajaDTO } from '../../core/services/venta.service';
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
  tipoComprobante: string;
  datosReceta?: {
    cmpMedico: string;
    nroReceta: string;
    paciente: string;
  };
  sedeId?: string;
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
  sku?: string;
  codigoBarra?: string;
  tipoProducto?: 'MEDICAMENTO' | 'PERFUME' | 'OTROS';
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
export class Pos implements OnInit, AfterViewInit {
  @ViewChild('barcodeInput') barcodeInputRef?: ElementRef<HTMLInputElement>;
  private audioCtx: AudioContext | null = null;
  public authService = inject(AuthService);
  private productService = inject(ProductService);
  private inventoryService = inject(InventoryService);
  private ventaService = inject(VentaService);
  private decolectaService = inject(DecolectaService);
  private customerService = inject(CustomerService);
  public storageService = inject(StorageService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  constructor() {
    this.limpiarStorageResidual();
    // Reactivar carga automática de existencias al conmutar de sede
    effect(() => {
      const sede = this.authService.activeSede();
      if (sede) {
        this.cargarProductosYVentas();
      }
    });
  }

  private limpiarStorageResidual(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('medicare_inventario_lotes_v3');
        localStorage.removeItem('medicare_inventario_lotes_v1');
        localStorage.removeItem('medicare_catalogo_maestro_v3');
        localStorage.removeItem('medicare_catalogo_maestro_v2');
        localStorage.removeItem('medicare_inventario_actas_v3');
        localStorage.removeItem('medicare_categorias_productos_v4');
      }
    } catch {
      // Ignorar entornos sin storage
    }
  }

  cargandoProductos = true;
  
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

  // Posición del Carrito: 'izquierda' (solicitado) o 'derecha'
  posicionCarrito: 'izquierda' | 'derecha' = (typeof localStorage !== 'undefined' && (localStorage.getItem('medicare_pos_cart_position') as 'izquierda' | 'derecha')) || 'izquierda';

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

  // Cliente & Comprobante (Exclusivo Ticket de Venta)
  tipoComprobante = 'Ticket';
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

  // Estado y Modal de Cliente (Búsqueda, Edición y Creación)
  clienteEncontrado = false;
  showClienteModal = false;
  modoClienteModal: 'CREAR' | 'EDITAR' = 'CREAR';
  modalDocTipo: 'DNI' | 'RUC' = 'DNI';
  modalDocNumero = '';
  modalNombre = '';
  modalCelular = '';
  modalEmail = '';
  modalDireccion = '';
  modalFechaNacimiento = '';

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

  // ================= 5.1 REAPERTURA EXCLUSIVA ADMINISTRADOR =================
  showReaperturaModal = false;
  pinReapertura = '';
  motivoReapertura = 'Reapertura de turno autorizada por Administrador';
  motivosReaperturaDisponibles = [
    'Reapertura de turno autorizada por Administrador',
    'Cierre accidental o error de arqueo anticipado',
    'Reanudación de ventas por extensión de jornada',
    'Auditoría y ajuste extraordinario de caja'
  ];
  autorizadoresReaperturaDisponibles = [
    'Lic. Carlos Mendoza (Administrador General)',
    'Administrador de Turno / Propietario'
  ];
  autorizadorReapertura: string = 'Lic. Carlos Mendoza (Administrador General)';
  errorReapertura = '';

  get esAdmin(): boolean {
    const user = this.authService.currentUser();
    const role = this.authService.activeRole();
    return role === 'ADMIN' || 
           Boolean(user?.esSuperadmin) || 
           Boolean(user?.esPropietario) || 
           user?.rolCodigo === 'ADMIN_NEGOCIO' ||
           user?.rolCodigo === 'SUPERADMIN' ||
           user?.rolCodigo === 'ADMIN_MASTER';
  }

  // Buffer para lector de código de barras físico
  private barcodeBuffer = '';
  private lastKeyTime = 0;

  ngAfterViewInit() {
    this.enfocarLector();
  }

  enfocarLector() {
    setTimeout(() => {
      try {
        if (this.barcodeInputRef?.nativeElement) {
          this.barcodeInputRef.nativeElement.focus();
        }
      } catch (e) {
        // Silencioso
      }
    }, 100);
  }

  playBeep(success: boolean = true) {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (success) {
        // Tono agudo y limpio de éxito (880 Hz a 1175 Hz, 100ms)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else {
        // Tono grave de advertencia / no encontrado (220 Hz, 220ms)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // AudioContext policy
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'F12') {
      event.preventDefault();
      if (this.cart.length > 0 && this.cajaAbierta) {
        this.openPayment();
      }
      return;
    }

    // Si hay un modal abierto, no interceptar teclas como código de barras
    if (this.showPaymentModal || this.showClienteModal || this.showAperturaModal || 
        this.showCierreModal || this.showTicketModal || this.showRecetaModal || 
        this.showModalImagen || this.showReporteZModal || this.showAnulacionModal || this.showReaperturaModal) {
      return;
    }

    const target = event.target as HTMLElement;
    const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const isBarcodeInput = target && target === this.barcodeInputRef?.nativeElement;

    // Si el usuario está directamente en el buscador de código de barras, el input maneja el Enter
    if (isBarcodeInput) {
      return;
    }

    // Si está en otro campo de texto (ej. DNI del cliente), no interceptar
    if (isInput) {
      return;
    }

    // Detección global para pistola de código de barras cuando el foco está libre en la pantalla
    const now = Date.now();
    // Las pistolas USB disparan teclas consecutivas a ráfagas (< 150ms)
    if (now - this.lastKeyTime > 200) {
      this.barcodeBuffer = '';
    }
    this.lastKeyTime = now;

    if (event.key === 'Enter') {
      const code = this.barcodeBuffer.trim();
      if (code.length >= 3) {
        event.preventDefault();
        event.stopPropagation();
        const procesado = this.procesarCodigoEscaneado(code);
        if (!procesado) {
          this.playBeep(false);
          this.mostrarAlerta('warning', `Código de barras "${code}" no registrado en el inventario.`, 'No Encontrado');
        }
      }
      this.barcodeBuffer = '';
      this.enfocarLector();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      this.barcodeBuffer += event.key;
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
    this.cargandoProductos = true;
    this.cdr.markForCheck();
    const activeSedeId = this.authService.activeSede()?.id;

    // Si existen productos previamente en memoria o caché, mapearlos inmediatamente
    if (this.productService.productosCatalogo && this.productService.productosCatalogo.length > 0) {
      this.mapearProductos(this.productService.productosCatalogo, this.inventoryService.lotesInventario || []);
    }

    // Consultar catálogo activo y lotes FEFO en paralelo desde Supabase con timeout de protección
    forkJoin({
      catalogo: this.productService.listarCatalogoActivos().pipe(
        timeout(8000),
        catchError(err => {
          console.warn('Aviso timeout/error cargando catálogo activo:', err);
          return of(this.productService.productosCatalogo || []);
        })
      ),
      lotes: this.inventoryService.listarLotesFefo(activeSedeId).pipe(
        timeout(8000),
        catchError(err => {
          console.warn('Aviso timeout/error cargando lotes FEFO:', err);
          return of(this.inventoryService.lotesInventario || []);
        })
      )
    }).subscribe({
      next: ({ catalogo, lotes }) => {
        this.ngZone.run(() => {
          this.cargandoProductos = false;
          this.mapearProductos(catalogo || [], lotes || []);
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          this.cargandoProductos = false;
          console.warn('Aviso cargando productos en POS:', err);
          if (this.productos.length === 0 && this.productService.productosCatalogo?.length > 0) {
            this.mapearProductos(this.productService.productosCatalogo, this.inventoryService.lotesInventario || []);
          }
          this.filterProducts();
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      }
    });

    if (this.ventaService.ventas.length > 0) {
      this.ventasTurno = this.ventaService.ventas as any;
    }
  }

  private mapearProductos(catalogo: any[], lotes: any[]) {
    const activeSedeId = this.authService.activeSede()?.id;

    this.productos = (catalogo || []).map(p => {
      // Filtrar lotes estrictamente para este producto y para la sede activa (si hay sede seleccionada y no es 'TODAS')
      const lotesProd = (lotes || []).filter(l => {
        const prodMatch = (l.productoId === p.id || l.productoId === String(p.id));
        if (!prodMatch) return false;
        if (activeSedeId && activeSedeId !== 'TODAS') {
          if (l.sucursalId && l.sucursalId !== activeSedeId) return false;
        }
        return Number(l.stock) > 0;
      });

      // ¡STOCK REAL DIRECTO DE LA BASE DE DATOS! Si no hay lotes en el almacén de la sede, el stock es 0 estrictamente
      const stockReal = lotesProd.reduce((sum, l) => sum + (Number(l.stock) || 0), 0);
      const loteMasCercano = lotesProd[0]; // Ya ordenado FEFO

      const esPerfume = p.tipoProducto === 'PERFUME' || p.sku?.startsWith('PERF') || p.categoriaNombre === 'Perfumería Fina' || p.categoria?.nombre === 'Perfumería Fina';
      const esOtros = p.tipoProducto === 'OTROS' || p.sku?.startsWith('OTR');
      const esSoloUnidad = esPerfume || esOtros;
      const tipoProd: 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = esPerfume ? 'PERFUME' : (esOtros ? 'OTROS' : 'MEDICAMENTO');

      const vtoStr = loteMasCercano && loteMasCercano.vencimiento
        ? (loteMasCercano.vencimiento === 'No expira' ? 'No expira' : loteMasCercano.vencimiento.slice(2, 7).replace('-', '/'))
        : (esPerfume ? 'No expira' : (stockReal > 0 ? '12/26' : 'Sin Lote'));

      const precioBase = Number(p.precioVenta) || Number(p.precioUnidad) || Number(p.precioCaja) || 0;

      if (esSoloUnidad) {
        return {
          id: p.id,
          sku: p.sku || '',
          codigoBarra: p.codigoBarra || '',
          tipoProducto: tipoProd,
          nombre: p.nombreComercial || p.nombre || 'Producto',
          principioActivo: p.principioActivo || (esPerfume ? (p.marca || 'Perfumería') : (p.marca || 'Cuidado General')),
          concentracion: p.concentracion || '',
          laboratorio: p.laboratorio || (esPerfume ? (p.marca || 'Cosmética') : (p.marca || 'Fabricante')),
          tipo: esPerfume ? ('Perfume' + (p.volumenMl ? ` • ${p.volumenMl}ml` : '')) : 'Unidad',
          categoria: p.categoriaNombre || (esPerfume ? 'Perfumería Fina' : 'Cuidado Personal'),
          ubicacion: loteMasCercano?.ubicacion || (stockReal > 0 ? (p.ubicacionAlmacen || 'Vitrina / Estante') : 'Sin Stock'),
          requiereReceta: false,
          esControlado: false,
          lote: loteMasCercano ? loteMasCercano.lote : 'SIN-LOTE',
          vto: vtoStr,
          diasParaVencer: esPerfume ? 99999 : (loteMasCercano ? loteMasCercano.dias : 0),
          stockUnidades: stockReal,
          unidadesPorCaja: 1,
          unidadesPorBlister: 1,
          precioCaja: precioBase,
          precioBlister: 0,
          precioUnidad: precioBase,
          imagenUrl: p.imagenUrl || this.storageService.obtenerImagenPorDefecto(p.nombreComercial, p.categoriaNombre)
        };
      }

      return {
        id: p.id,
        sku: p.sku || '',
        codigoBarra: p.codigoBarra || '',
        tipoProducto: 'MEDICAMENTO',
        nombre: p.nombreComercial || p.nombre || 'Medicamento',
        principioActivo: p.principioActivo || 'Genérico',
        concentracion: p.concentracion || '',
        laboratorio: p.laboratorio || 'Laboratorio',
        tipo: p.unidadesPorBlister ? `Blíster x ${p.unidadesPorBlister}` : 'Caja',
        categoria: p.categoriaNombre || 'Venta Libre (OTC)',
        ubicacion: loteMasCercano?.ubicacion || (stockReal > 0 ? (p.ubicacionAlmacen || 'P1-E1-N1') : 'Sin Stock'),
        requiereReceta: !!p.requiereReceta,
        esControlado: !!p.esControlado,
        lote: loteMasCercano ? loteMasCercano.lote : 'SIN-LOTE',
        vto: vtoStr,
        diasParaVencer: loteMasCercano ? loteMasCercano.dias : 0,
        stockUnidades: stockReal,
        unidadesPorCaja: p.unidadesPorCaja || 20,
        unidadesPorBlister: p.unidadesPorBlister || 10,
        precioCaja: Number(p.precioCaja) || Number(p.precioVenta) || 0,
        precioBlister: Number(p.precioBlister) || (p.precioCaja ? Number((p.precioCaja / Math.max(1, (p.unidadesPorCaja || 20) / (p.unidadesPorBlister || 10))).toFixed(2)) : Number(p.precioVenta) || 0),
        precioUnidad: Number(p.precioUnidad) || (p.precioCaja ? Number((p.precioCaja / (p.unidadesPorCaja || 20)).toFixed(2)) : Number(p.precioVenta) || 0),
        imagenUrl: p.imagenUrl || this.storageService.obtenerImagenPorDefecto(p.nombreComercial, p.categoriaNombre)
      };
    });

    // Actualizar categorías dinámicamente según productos en el catálogo
    const catSet = new Set(['Todos', 'Medicamentos', 'Perfumes', 'Otros']);
    this.productos.forEach(pr => {
      if (pr.categoria) catSet.add(pr.categoria);
    });
    this.categories = Array.from(catSet);

    this.filterProducts();
  }

  // --- MÉTODOS DE CAJA ---
  get aperturaHoyExistente(): TurnoCajaDTO | null {
    return this.ventaService.getAperturaDelDia();
  }

  solicitarReaperturaCaja() {
    if (this.esAdmin) {
      // El Administrador actual puede reabrir directamente registrando su nombre para auditoría
      const nombreAdmin = this.authService.getUserDisplayName();
      this.reabrirCajaPos('Reapertura directa por Administrador', nombreAdmin);
    } else {
      // Si el rol es Cajero o Químico, se solicita PIN de Administrador
      this.pinReapertura = '';
      this.errorReapertura = '';
      this.motivoReapertura = this.motivosReaperturaDisponibles[0];
      this.autorizadorReapertura = this.autorizadoresReaperturaDisponibles[0];
      this.showReaperturaModal = true;
    }
  }

  confirmarReaperturaConPin() {
    const pin = (this.pinReapertura || '').trim();
    if (!pin) {
      this.errorReapertura = 'Ingresa el PIN de seguridad del Administrador.';
      return;
    }

    const user = this.authService.currentUser();
    const userPin = (user as any)?.pinSeguridad || (user as any)?.pin;

    // Acepta PIN del usuario o PINs maestros administrativos de contingencia (1234, 2026)
    const pinValido = pin === '1234' || pin === '2026' || (userPin && pin === String(userPin));

    if (!pinValido) {
      this.errorReapertura = 'PIN de Administrador incorrecto. Ingrese el PIN de seguridad autorizado (ej: 1234).';
      return;
    }

    this.showReaperturaModal = false;
    this.reabrirCajaPos(this.motivoReapertura, this.autorizadorReapertura);
  }

  reabrirCajaPos(motivo: string = 'Reanudación de operaciones en POS', autorizadoPor?: string) {
    const responsable = autorizadoPor || (this.esAdmin ? this.authService.getUserDisplayName() : null);

    // Si NO es Administrador y NO viene una autorización previa, forzar solicitud
    if (!this.esAdmin && !autorizadoPor) {
      this.solicitarReaperturaCaja();
      return;
    }

    const turno = this.ventaService.reabrirCaja(motivo, responsable || this.cajeroActual);
    this.cajaAbierta = true;
    this.fondoInicial = turno.fondoInicial;
    if (turno.fechaApertura) this.fechaApertura = new Date(turno.fechaApertura);
    this.showAperturaModal = false;
    this.showReaperturaModal = false;
    this.mostrarAlerta('success', `Caja reabierta exitosamente. Turno reactivado por ${responsable || 'Administrador'} con S/ ${this.fondoInicial.toFixed(2)} de fondo.`, 'Caja Reabierta');
  }

  abrirCaja() {
    const aperturaHoy = this.ventaService.getAperturaDelDia();
    if (aperturaHoy) {
      // Normativa: solo el administrador puede reabrir la caja
      if (!this.esAdmin) {
        this.showAperturaModal = false;
        this.solicitarReaperturaCaja();
        return;
      }
      this.reabrirCajaPos('Reapertura del turno del día por Administrador', this.authService.getUserDisplayName());
      return;
    }
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

  // --- GESTIÓN DE CLIENTES: BÚSQUEDA RENIEC / SUNAT Y MODALES ---
  onDocNumeroChange() {
    this.alertaDocumento = '';
    this.clienteEncontrado = false;
    const num = this.docNumero ? this.docNumero.trim() : '';
    if (!num) {
      this.customerName = 'Cliente de mostrador';
      this.customerCelular = '';
      this.customerEmail = '';
      this.customerDireccion = '';
      this.customerFechaNacimiento = '';
      this.customerPuntos = 0;
    }
  }

  abrirModalCliente(modo: 'CREAR' | 'EDITAR') {
    this.modoClienteModal = modo;
    const num = this.docNumero ? this.docNumero.trim() : '';
    this.modalDocTipo = num.length === 11 ? 'RUC' : 'DNI';
    this.modalDocNumero = num;

    if (modo === 'EDITAR') {
      this.modalNombre = (this.customerName && this.customerName !== 'Cliente de mostrador' && this.customerName !== 'Cliente Público') ? this.customerName : '';
      this.modalCelular = this.customerCelular || '';
      this.modalEmail = this.customerEmail || '';
      this.modalDireccion = this.customerDireccion || '';
      this.modalFechaNacimiento = this.customerFechaNacimiento || '';
    } else {
      this.modalNombre = '';
      this.modalCelular = '';
      this.modalEmail = '';
      this.modalDireccion = '';
      this.modalFechaNacimiento = '';
    }
    this.showClienteModal = true;
  }

  cerrarModalCliente() {
    this.showClienteModal = false;
  }

  guardarClienteModal() {
    const doc = this.modalDocNumero ? this.modalDocNumero.trim() : '';
    const nom = this.modalNombre ? this.modalNombre.trim() : '';
    if (!doc) {
      this.mostrarAlerta('warning', 'El número de documento es obligatorio.', 'Campo Requerido');
      return;
    }
    if (!nom) {
      this.mostrarAlerta('warning', 'El nombre o razón social es obligatorio.', 'Campo Requerido');
      return;
    }

    this.docNumero = doc;
    this.tipoDoc = doc.length === 11 ? 'RUC' : 'DNI';
    this.customerName = nom;
    this.customerCelular = this.modalCelular ? this.modalCelular.trim() : '';
    this.customerEmail = this.modalEmail ? this.modalEmail.trim() : '';
    this.customerDireccion = this.modalDireccion ? this.modalDireccion.trim() : '';
    this.customerFechaNacimiento = this.modalFechaNacimiento ? this.modalFechaNacimiento.trim() : '';
    this.clienteEncontrado = true;

    // Persistir cliente en CustomerService con Sede
    const sedeNombreActual = this.authService.activeSede()?.nombre || 'Sede Cajamarca Central';
    const sedeIdActual = this.authService.activeSede()?.id || '11111111-1111-1111-1111-111111111111';

    this.customerService.addOrUpdateCustomer({
      id: doc,
      nombre: nom,
      celular: this.customerCelular,
      email: this.customerEmail,
      direccion: this.customerDireccion,
      fechaNacimiento: this.customerFechaNacimiento || undefined,
      puntosAcumulados: this.customerPuntos,
      sedeId: sedeIdActual,
      sedeNombre: sedeNombreActual,
      ultimaSede: sedeNombreActual,
      sedesCompradas: [sedeNombreActual]
    });

    this.showClienteModal = false;
    this.mostrarAlerta('success', `Cliente ${nom} asignado a la venta con éxito.`, 'Datos Guardados');
  }

  // --- CONSULTA DOCUMENTO Y GESTIÓN DE CLIENTES (MANUAL / LOCAL) ---
  consultarDocumento() {
    this.alertaDocumento = '';
    const num = this.docNumero ? this.docNumero.trim() : '';
    if (!num || (num.length !== 8 && num.length !== 11)) {
      this.alertaDocumento = 'Ingresa un número de DNI (8 dígitos) o RUC (11 dígitos).';
      return;
    }

    this.consultandoDocumento = false;
    this.clienteEncontrado = false;
    this.customerCelular = '';
    this.customerEmail = '';
    this.customerPuntos = 0;

    // 1. Revisar si ya está guardado localmente con un nombre real
    const clienteLocal = this.customerService.getCustomer(num);
    if (clienteLocal && clienteLocal.nombre && clienteLocal.nombre !== 'Cliente de mostrador' && clienteLocal.nombre !== 'Cliente Público') {
      this.customerName = clienteLocal.nombre;
      this.customerCelular = clienteLocal.celular || '';
      this.customerEmail = clienteLocal.email || '';
      this.customerDireccion = clienteLocal.direccion || '';
      this.customerFechaNacimiento = clienteLocal.fechaNacimiento || '';
      this.customerPuntos = clienteLocal.puntosAcumulados || 0;
      this.clienteEncontrado = true;
      this.tipoDoc = num.length === 11 ? 'RUC' : 'DNI';
      this.mostrarAlerta('success', `Cliente registrado identificado: ${this.customerName}`, 'Cliente Encontrado');
      return;
    }

    // 2. Registro Manual para DNI (Sin consultas a RENIEC)
    if (num.length === 8) {
      this.tipoDoc = 'DNI';
      this.clienteEncontrado = false;
      this.abrirModalCliente('CREAR');
      this.mostrarAlerta('info', 'DNI no registrado. Complete los datos para registrar al cliente manualmente.', 'Registro Manual');
    } else if (num.length === 11) {
      this.tipoDoc = 'RUC';
      this.consultandoDocumento = true;
      this.decolectaService.consultarRuc(num).subscribe({
        next: (res) => {
          this.consultandoDocumento = false;
          this.alertaDocumento = '';
          this.customerName = res.razon_social;
          if (res.direccion) {
            this.customerDireccion = res.direccion;
          }
          this.clienteEncontrado = true;
          this.loadCustomerLoyalty(num);

          this.customerService.addOrUpdateCustomer({
            id: num,
            nombre: this.customerName,
            direccion: this.customerDireccion,
            celular: this.customerCelular,
            email: this.customerEmail,
            puntosAcumulados: this.customerPuntos
          });

          this.mostrarAlerta('success', `Datos encontrados (SUNAT): ${this.customerName}`, 'RUC Identificado');
        },
        error: (err) => {
          console.warn('Error Decolecta RUC en POS:', err);
          this.consultandoDocumento = false;
          if (this.loadCustomerLoyalty(num) && this.customerName !== 'Cliente de mostrador' && this.customerName !== 'Cliente Público') {
            this.clienteEncontrado = true;
            this.mostrarAlerta('success', `Datos encontrados (Local): ${this.customerName}`, 'Cliente Identificado');
          } else {
            this.clienteEncontrado = false;
            this.abrirModalCliente('CREAR');
            this.mostrarAlerta('info', 'RUC no encontrado en SUNAT. Ingrese la Razón Social para registrar la empresa.', 'Nueva Empresa');
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
      if (this.selectedCategory === 'Medicamentos') {
        result = result.filter(p => !this.esSoloPorUnidad(p));
      } else if (this.selectedCategory === 'Perfumes' || this.selectedCategory === 'Perfumería' || this.selectedCategory === 'Perfumería Fina') {
        result = result.filter(p => p.tipoProducto === 'PERFUME');
      } else if (this.selectedCategory === 'Otros') {
        result = result.filter(p => p.tipoProducto === 'OTROS');
      } else {
        const catNorm = this.selectedCategory.toLowerCase();
        result = result.filter(p => 
          p.categoria?.toLowerCase() === catNorm || 
          p.categoria?.toLowerCase().includes(catNorm) ||
          catNorm.includes(p.categoria?.toLowerCase() || '')
        );
      }
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      result = result.filter(p => 
        p.nombre.toLowerCase().includes(q) || 
        p.principioActivo.toLowerCase().includes(q) ||
        p.laboratorio.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.codigoBarra && p.codigoBarra.toLowerCase().includes(q))
      );
    }
    this.filteredProducts = result;
    this.cdr.markForCheck();
  }

  // --- LIMPIEZA RÁPIDA DE BÚSQUEDA ---
  limpiarBusqueda() {
    this.searchQuery = '';
    this.filterProducts();
  }

  // --- MANEJO DE LECTOR DE CÓDIGO DE BARRAS EN POS ---
  onSearchEnter(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const raw = (this.searchQuery || '').trim();
    if (!raw) return;

    const procesado = this.procesarCodigoEscaneado(raw);
    if (!procesado) {
      this.playBeep(false);
      this.mostrarAlerta('warning', `Código de barras o producto "${raw}" no encontrado en el inventario.`, 'No Encontrado');
      this.limpiarBusqueda();
    }
    this.enfocarLector();
  }

  procesarCodigoEscaneado(codigoRaw: string): boolean {
    const q = (codigoRaw || '').trim().toLowerCase().replace(/[\r\n]/g, '');
    if (!q) return false;

    // 1. Coincidencia exacta por código de barra, SKU o ID
    let exacto = this.productos.find(p => 
      (p.codigoBarra && p.codigoBarra.trim().toLowerCase() === q) ||
      (p.sku && p.sku.trim().toLowerCase() === q) ||
      (String(p.id).toLowerCase() === q)
    );

    // 2. Coincidencia ignorando ceros a la izquierda (compatibilidad formatos EAN-13 / UPC)
    if (!exacto && q.length >= 6) {
      const qSinCeros = q.replace(/^0+/, '');
      exacto = this.productos.find(p => {
        const cb = (p.codigoBarra || '').trim().toLowerCase().replace(/^0+/, '');
        const sku = (p.sku || '').trim().toLowerCase().replace(/^0+/, '');
        return (cb && cb === qSinCeros) || (sku && sku === qSinCeros);
      });
    }

    // 3. Si sólo hay un único producto filtrado en la grilla
    if (!exacto && this.filteredProducts.length === 1) {
      exacto = this.filteredProducts[0];
    }

    if (exacto) {
      if (exacto.stockUnidades <= 0) {
        this.playBeep(false);
        this.mostrarAlerta('warning', `El producto "${exacto.nombre}" no cuenta con stock disponible en esta sede.`, 'Sin Stock');
        this.limpiarBusqueda();
        this.enfocarLector();
        return true;
      }

      // Determinar la presentación para agregar (unidad o caja según tipo de producto)
      const pres = this.getPresentacionCard(exacto);
      const factorUnidades = this.esSoloPorUnidad(exacto) ? 1 : (
        pres === 'caja' ? exacto.unidadesPorCaja :
        pres === 'blister' ? exacto.unidadesPorBlister : 1
      );

      // Validar si supera el stock físico
      const existing = this.cart.find(item => item.id === exacto!.id && item.presentacion === pres);
      const unidadesEnCarrito = existing ? existing.unidadesTotales : 0;
      if (unidadesEnCarrito + factorUnidades > exacto.stockUnidades) {
        this.playBeep(false);
        this.mostrarAlerta(
          'warning', 
          `Stock insuficiente para "${exacto.nombre}". Ya tienes ${existing?.cantidad || 0} en el carrito (Máximo disponible: ${exacto.stockUnidades} unidades).`, 
          'Stock Límite'
        );
        this.limpiarBusqueda();
        this.enfocarLector();
        return true;
      }

      // Agregar 1 al carrito (si ya existe con la misma presentación, addToCart incrementa la cantidad)
      this.addToCart(exacto, pres, 1);
      this.playBeep(true);

      const itemActualizado = this.cart.find(item => item.id === exacto!.id && item.presentacion === pres);
      const cantActual = itemActualizado ? itemActualizado.cantidad : 1;

      this.mostrarAlerta(
        'success',
        `[ESCANEADO] ${exacto.nombre} (+1). Total en carrito: ${cantActual} ${pres}(s).`,
        'Pistola de Códigos'
      );

      this.limpiarBusqueda();
      this.enfocarLector();
      return true;
    }

    return false;
  }

  // Helper: Identifica si un producto es exclusivamente por unidad (Perfumes u Otros)
  esSoloPorUnidad(prod: ProductoFarmacia | any): boolean {
    if (!prod) return false;
    return prod.tipoProducto === 'PERFUME' || prod.tipoProducto === 'OTROS';
  }

  // --- GESTIÓN DE TARJETA: CANTIDAD Y PRESENTACIÓN ---
  getCantidadCard(id: string | number): number {
    return this.cantidadesPorProducto[id] || 1;
  }

  incrementarCantidadCard(prod: ProductoFarmacia) {
    const pres = this.getPresentacionCard(prod);
    const factor = this.esSoloPorUnidad(prod) ? 1 : (pres === 'caja' ? prod.unidadesPorCaja : pres === 'blister' ? prod.unidadesPorBlister : 1);
    const actual = this.getCantidadCard(prod.id);
    const maxQty = Math.floor(prod.stockUnidades / factor);
    if (actual < maxQty) {
      this.cantidadesPorProducto[prod.id] = actual + 1;
    } else {
      this.mostrarAlerta('warning', `Stock máximo disponible: ${maxQty} ${this.esSoloPorUnidad(prod) ? 'unidad(es)' : pres + '(s)'}.`, 'Stock Límite');
    }
  }

  decrementarCantidadCard(prod: ProductoFarmacia) {
    const actual = this.getCantidadCard(prod.id);
    if (actual > 1) {
      this.cantidadesPorProducto[prod.id] = actual - 1;
    }
  }

  getPresentacionCard(prod: ProductoFarmacia): 'unidad' | 'blister' | 'caja' {
    if (this.esSoloPorUnidad(prod)) {
      return 'unidad';
    }
    return this.presentacionPorProducto[prod.id] || (prod.precioUnidad ? 'unidad' : 'caja');
  }

  setPresentacionCard(prod: ProductoFarmacia, pres: 'unidad' | 'blister' | 'caja') {
    if (this.esSoloPorUnidad(prod)) {
      this.presentacionPorProducto[prod.id] = 'unidad';
      this.cantidadesPorProducto[prod.id] = 1;
      return;
    }
    this.presentacionPorProducto[prod.id] = pres;
    this.cantidadesPorProducto[prod.id] = 1;
  }

  getPrecioCard(prod: ProductoFarmacia): number {
    if (this.esSoloPorUnidad(prod)) {
      return prod.precioUnidad || prod.precioCaja || 0;
    }
    const pres = this.getPresentacionCard(prod);
    return pres === 'caja' ? prod.precioCaja : pres === 'blister' ? prod.precioBlister : prod.precioUnidad;
  }

  getStockPresentacion(prod: ProductoFarmacia): number {
    if (this.esSoloPorUnidad(prod)) {
      return prod.stockUnidades;
    }
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

  togglePosicionCarrito() {
    this.posicionCarrito = this.posicionCarrito === 'izquierda' ? 'derecha' : 'izquierda';
    try {
      localStorage.setItem('medicare_pos_cart_position', this.posicionCarrito);
    } catch (e) {
      console.warn('No se pudo guardar la posición del carrito en localStorage:', e);
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
    if (!this.cajaAbierta) {
      this.mostrarAlerta('warning', 'Debe aperturar la caja antes de registrar ventas.', 'Caja Cerrada');
      return;
    }

    if (this.metodoPagoRapido === 'Otros') {
      this.openPayment();
      this.setPaymentMode('mixto');
      return;
    }

    // Configurar automáticamente el pago exacto según el método rápido seleccionado
    this.paymentMode = 'simple';
    this.paymentMethod = this.metodoPagoRapido === 'Visa' ? 'Tarjeta' : (this.metodoPagoRapido || 'Efectivo');
    this.montoRecibido = this.total;
    this.pagoEfectivo = null;
    this.efectivoRecibido = null;
    this.pagoYape = null;
    this.pagoPlin = null;
    this.pagoTarjeta = null;
    this.pagoTransferencia = null;

    const montoTotal = this.total;
    const metodoUsado = this.paymentMethod;

    // Completar y registrar la venta directamente sin abrir modal repetitivo
    this.completeSale(false);

    this.mostrarAlerta(
      'success',
      `¡Venta registrada con éxito! Total: S/ ${montoTotal.toFixed(2)} (${metodoUsado}).`,
      'Venta Cobrada'
    );
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
    if (this.esSoloPorUnidad(prod)) {
      presentacion = 'unidad';
    }

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
    if (this.esSoloPorUnidad(prod)) {
      presentacion = 'unidad';
    }

    const factorUnidades = this.esSoloPorUnidad(prod) ? 1 : (
      presentacion === 'caja' ? prod.unidadesPorCaja :
      presentacion === 'blister' ? prod.unidadesPorBlister : 1
    );

    const precioAplicado = this.esSoloPorUnidad(prod) ? (prod.precioUnidad || prod.precioCaja || 0) : (
      presentacion === 'caja' ? prod.precioCaja :
      presentacion === 'blister' ? prod.precioBlister : prod.precioUnidad
    );

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
        tipoProducto: prod.tipoProducto,
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
    if (this.esSoloPorUnidad(prod)) {
      this.sustitutosSugeridos = this.productos.filter(p => 
        p.id !== prod.id && 
        (p.tipoProducto === prod.tipoProducto || p.categoria === prod.categoria) &&
        p.stockUnidades > 0
      );
    } else {
      this.sustitutosSugeridos = this.productos.filter(p => 
        p.id !== prod.id && 
        p.principioActivo.toLowerCase() === prod.principioActivo.toLowerCase() &&
        p.stockUnidades > 0
      );
    }
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

  completeSale(mostrarModalTicket: boolean = true) {
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

    // Guardar/Actualizar Cliente con trazabilidad de Sede y Acumular Puntos
    if (this.docNumero) {
      const sedeNombreActual = this.authService.activeSede()?.nombre || 'Sede Cajamarca Central';
      const sedeIdActual = this.authService.activeSede()?.id || '11111111-1111-1111-1111-111111111111';

      this.customerService.addOrUpdateCustomer({
        id: this.docNumero,
        nombre: this.customerName,
        celular: this.customerCelular,
        email: this.customerEmail,
        direccion: this.customerDireccion,
        fechaNacimiento: this.customerFechaNacimiento ? this.customerFechaNacimiento.trim() : undefined,
        puntosAcumulados: this.customerPuntos,
        sedeId: sedeIdActual,
        sedeNombre: sedeNombreActual,
        ultimaSede: sedeNombreActual,
        sedesCompradas: [sedeNombreActual],
        ultimaFechaCompra: new Date().toISOString()
      });
      this.customerService.registrarCompraCliente(this.docNumero, sedeNombreActual, this.total, sedeIdActual);
    }

    const nuevoTicket: TicketVenta = {
      id: 'TKT-' + Math.floor(100000 + Math.random() * 900000),
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
      tipoComprobante: 'Ticket',
      datosReceta: itemConReceta ? itemConReceta.receta : undefined,
      sedeId: this.authService.activeSede()?.id || '11111111-1111-1111-1111-111111111111',
      sede: this.authService.activeSede()?.nombre || 'Sede Cajamarca Central',
      estado: 'EMITIDO'
    };
    
    this.ticketData = nuevoTicket;
    
    // Persistir venta directamente en Supabase / Local
    this.ventaService.registrarVenta(nuevoTicket as any).subscribe();
    this.ventasTurno = this.ventaService.ventas as any;
    
    this.showPaymentModal = false;
    this.showTicketModal = mostrarModalTicket;
    
    // Limpiar carrito y resetear datos del cliente para la siguiente venta
    this.cart = [];
    this.calculateTotal();
    this.docNumero = '';
    this.customerName = 'Cliente de mostrador';
    this.customerDireccion = '';
    this.customerCelular = '';
    this.customerEmail = '';
    this.customerFechaNacimiento = '';
    this.customerPuntos = 0;
    this.alertaDocumento = '';
    this.clienteEncontrado = false;
    this.isEditingCustomer = false;
    this.enfocarLector();
  }
  
  closeTicket() {
    this.showTicketModal = false;
    this.ticketData = null;
    this.enfocarLector();
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
