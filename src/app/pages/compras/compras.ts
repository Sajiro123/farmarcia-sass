import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

export interface CompraItem {
  id: number;
  nombre: string;
  categoria: string;
  modalidadIngreso: 'cajas' | 'unidades';
  requiereLote: boolean;
  lote: string;
  vencimiento: string;
  cantidadCajas: number;
  unidadesPorCaja: number;
  totalUnidades: number;
  costoPorCaja: number;
  costoUnitario: number;
  precioVentaSugerido: number;
  margenPorcentaje: number;
}

export interface ProductoReorden {
  id: number;
  nombre: string;
  laboratorio: string;
  stockActual: number;
  ventaDiariaPromedio: number;
  diasEntregaProveedor: number;
  stockSeguridad: number;
  puntoReorden: number;
  cantidadSugeridaPedir: number;
  costoEstimadoCaja: number;
  enQuiebre: boolean;
}

export interface CuentaPorPagar {
  id: string;
  proveedor: string;
  nroFactura: string;
  fechaEmision: Date;
  fechaVencimiento: Date;
  diasRestantes: number;
  montoTotal: number;
  montoPagado: number;
  saldoPendiente: number;
  estado: 'PENDIENTE' | 'PAGADO' | 'VENCIDO';
}

@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './compras.html'
})
export class Compras implements OnInit {
  public authService = inject(AuthService);

  tabActiva: 'recepcion' | 'reorden' | 'cuentas' = 'recepcion';

  // 1. Recepción de Facturas
  proveedor = 'Droguería & Distribuidora Farmacéutica del Centro S.A.C.';
  rucProveedor = '20519827361';
  tipoComprobante: 'Factura' | 'Guía de Remisión' | 'Boleta' = 'Factura';
  nroComprobante = 'F001-004829';
  condicionPago: 'Contado' | 'Crédito 15 días' | 'Crédito 30 días' = 'Crédito 30 días';

  modalidadIngreso: 'cajas' | 'unidades' = 'cajas';
  requiereLote = false;
  productoSeleccionado = 'Paracetamol 500mg';
  categoriaSeleccionada = 'Analgésicos';
  loteInput = '';
  vencimientoInput = '';
  cantidadCajas = 10;
  unidadesPorCaja = 100;
  costoPorCaja = 35.00;
  precioVentaSugerido = 0.50;

  itemsCompra: CompraItem[] = [
    {
      id: 1,
      nombre: 'Paracetamol 500mg (Caja x 100)',
      categoria: 'Analgésicos',
      modalidadIngreso: 'cajas',
      requiereLote: true,
      lote: 'LT-982134',
      vencimiento: '2027-12',
      cantidadCajas: 10,
      unidadesPorCaja: 100,
      totalUnidades: 1000,
      costoPorCaja: 35.00,
      costoUnitario: 0.35,
      precioVentaSugerido: 0.50,
      margenPorcentaje: 42.8
    },
    {
      id: 2,
      nombre: 'Pañales Huggies Talla G (Fardo x 4)',
      categoria: 'Cuidado Personal',
      modalidadIngreso: 'cajas',
      requiereLote: false,
      lote: 'ING-AUTO-202608',
      vencimiento: 'Sin Venc.',
      cantidadCajas: 5,
      unidadesPorCaja: 4,
      totalUnidades: 20,
      costoPorCaja: 120.00,
      costoUnitario: 30.00,
      precioVentaSugerido: 38.00,
      margenPorcentaje: 26.6
    }
  ];

  // 2. Reorden Inteligente & Sugerencia de Compras
  productosReorden: ProductoReorden[] = [
    {
      id: 1,
      nombre: 'Ibuprofeno 400mg (Genfar)',
      laboratorio: 'Genfar S.A.',
      stockActual: 0,
      ventaDiariaPromedio: 15,
      diasEntregaProveedor: 3,
      stockSeguridad: 30,
      puntoReorden: 75, // (15 * 3) + 30 = 75
      cantidadSugeridaPedir: 150,
      costoEstimadoCaja: 7.00,
      enQuiebre: true
    },
    {
      id: 2,
      nombre: 'Amoxicilina + Clavulánico 500/125mg',
      laboratorio: 'Portugal',
      stockActual: 12,
      ventaDiariaPromedio: 8,
      diasEntregaProveedor: 4,
      stockSeguridad: 20,
      puntoReorden: 52, // (8 * 4) + 20 = 52
      cantidadSugeridaPedir: 60,
      costoEstimadoCaja: 32.00,
      enQuiebre: true
    },
    {
      id: 3,
      nombre: 'Panadol Antigripal NF (Sobre x 2)',
      laboratorio: 'GSK',
      stockActual: 210,
      ventaDiariaPromedio: 25,
      diasEntregaProveedor: 2,
      stockSeguridad: 50,
      puntoReorden: 100,
      cantidadSugeridaPedir: 0,
      costoEstimadoCaja: 110.00,
      enQuiebre: false
    }
  ];

  // 3. Cuentas por Pagar (Facturas a Crédito)
  cuentasPorPagar: CuentaPorPagar[] = [
    {
      id: 'CXP-001',
      proveedor: 'Laboratorios Genfar S.A.',
      nroFactura: 'F002-009182',
      fechaEmision: new Date(Date.now() - 86400000 * 20),
      fechaVencimiento: new Date(Date.now() + 86400000 * 10),
      diasRestantes: 10,
      montoTotal: 1450.00,
      montoPagado: 0,
      saldoPendiente: 1450.00,
      estado: 'PENDIENTE'
    },
    {
      id: 'CXP-002',
      proveedor: 'Droguería del Centro S.A.C.',
      nroFactura: 'F001-003912',
      fechaEmision: new Date(Date.now() - 86400000 * 35),
      fechaVencimiento: new Date(Date.now() - 86400000 * 5),
      diasRestantes: -5,
      montoTotal: 820.00,
      montoPagado: 0,
      saldoPendiente: 820.00,
      estado: 'VENCIDO'
    }
  ];

  // Modal Orden de Compra Generada
  showOrdenCompraModal = false;
  ordenCompraGenerada: any = null;

  ngOnInit() {
    this.recalcularTotalesItem();
  }

  get totalUnidadesCalculadas(): number {
    if (this.modalidadIngreso === 'cajas') {
      return (Number(this.cantidadCajas) || 0) * (Number(this.unidadesPorCaja) || 1);
    }
    return Number(this.cantidadCajas) || 0;
  }

  get costoUnitarioCalculado(): number {
    if (this.totalUnidadesCalculadas <= 0) return 0;
    const costoTotalItem = (Number(this.cantidadCajas) || 0) * (Number(this.costoPorCaja) || 0);
    return Number((costoTotalItem / this.totalUnidadesCalculadas).toFixed(3));
  }

  get margenCalculado(): number {
    if (this.costoUnitarioCalculado <= 0 || this.precioVentaSugerido <= 0) return 0;
    const ganancia = this.precioVentaSugerido - this.costoUnitarioCalculado;
    return Number(((ganancia / this.precioVentaSugerido) * 100).toFixed(1));
  }

  get subtotalFactura(): number {
    return this.itemsCompra.reduce((sum, it) => sum + (it.cantidadCajas * it.costoPorCaja), 0);
  }

  get totalFactura(): number {
    return Number(this.subtotalFactura.toFixed(2));
  }

  recalcularTotalesItem() {
    if (!this.requiereLote && !this.loteInput) {
      this.loteInput = 'ING-AUTO-' + new Date().toISOString().slice(0, 7).replace('-', '');
    }
  }

  onToggleRequiereLote() {
    if (!this.requiereLote) {
      this.loteInput = 'ING-AUTO-' + new Date().toISOString().slice(0, 7).replace('-', '');
      this.vencimientoInput = 'Sin Venc.';
    } else {
      this.loteInput = '';
      this.vencimientoInput = '';
    }
  }

  agregarItemACompra() {
    if (!this.productoSeleccionado || this.cantidadCajas <= 0 || this.costoPorCaja <= 0) {
      alert('Por favor completa los datos del producto, cantidad y costo.');
      return;
    }

    const nuevoItem: CompraItem = {
      id: Date.now(),
      nombre: this.productoSeleccionado + (this.modalidadIngreso === 'cajas' ? ' (Caja x ' + this.unidadesPorCaja + ')' : ''),
      categoria: this.categoriaSeleccionada,
      modalidadIngreso: this.modalidadIngreso,
      requiereLote: this.requiereLote,
      lote: this.loteInput || 'ING-AUTO-' + Date.now().toString().slice(-4),
      vencimiento: this.vencimientoInput || (this.requiereLote ? '2027-12' : 'Sin Venc.'),
      cantidadCajas: this.cantidadCajas,
      unidadesPorCaja: this.modalidadIngreso === 'cajas' ? this.unidadesPorCaja : 1,
      totalUnidades: this.totalUnidadesCalculadas,
      costoPorCaja: this.costoPorCaja,
      costoUnitario: this.costoUnitarioCalculado,
      precioVentaSugerido: this.precioVentaSugerido,
      margenPorcentaje: this.margenCalculado
    };

    this.itemsCompra.push(nuevoItem);
    this.productoSeleccionado = '';
    this.cantidadCajas = 1;
    this.costoPorCaja = 0;
    this.loteInput = '';
    this.vencimientoInput = '';
  }

  eliminarItem(index: number) {
    this.itemsCompra.splice(index, 1);
  }

  guardarYRecepcionarCompra() {
    if (this.itemsCompra.length === 0) {
      alert('Agrega al menos un producto a la factura de compra.');
      return;
    }

    // Si es crédito, registrar en Cuentas por Pagar
    if (this.condicionPago !== 'Contado') {
      const diasCredito = this.condicionPago === 'Crédito 15 días' ? 15 : 30;
      this.cuentasPorPagar.unshift({
        id: 'CXP-' + Math.floor(100 + Math.random() * 900),
        proveedor: this.proveedor,
        nroFactura: this.nroComprobante,
        fechaEmision: new Date(),
        fechaVencimiento: new Date(Date.now() + diasCredito * 86400000),
        diasRestantes: diasCredito,
        montoTotal: this.totalFactura,
        montoPagado: 0,
        saldoPendiente: this.totalFactura,
        estado: 'PENDIENTE'
      });
    }

    alert('Factura recepcionada exitosamente.');
    this.itemsCompra = [];
    this.nroComprobante = 'F001-' + Math.floor(10000 + Math.random() * 90000);
  }

  // Generar Orden de Compra Automática por Punto de Reorden
  generarOrdenCompraAutomatica() {
    const itemsParaPedir = this.productosReorden.filter(p => p.stockActual <= p.puntoReorden);
    if (itemsParaPedir.length === 0) {
      alert('Todos los productos se encuentran con stock óptimo.');
      return;
    }

    this.ordenCompraGenerada = {
      id: 'OC-2026-' + Math.floor(1000 + Math.random() * 9000),
      fecha: new Date(),
      proveedorSugerido: 'Droguería & Distribuidora Farmacéutica del Centro S.A.C.',
      items: itemsParaPedir.map(p => ({
        producto: p.nombre,
        laboratorio: p.laboratorio,
        stockActual: p.stockActual,
        puntoReorden: p.puntoReorden,
        cantidadPedir: p.cantidadSugeridaPedir,
        costoEstimado: p.cantidadSugeridaPedir * (p.costoEstimadoCaja / 10)
      })),
      totalEstimado: itemsParaPedir.reduce((s, p) => s + (p.cantidadSugeridaPedir * (p.costoEstimadoCaja / 10)), 0)
    };

    this.showOrdenCompraModal = true;
  }

  registrarPagoCuenta(cxp: CuentaPorPagar) {
    cxp.montoPagado = cxp.montoTotal;
    cxp.saldoPendiente = 0;
    cxp.estado = 'PAGADO';
    alert('✅ Pago registrado para la Factura ' + cxp.nroFactura);
  }

  imprimirOC() {
    window.print();
  }
}
