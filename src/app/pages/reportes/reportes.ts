import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { VentaService, TicketVentaDTO, TurnoCajaDTO } from '../../core/services/venta.service';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService, LoteItem } from '../../core/services/inventory.service';
import { ProductService, ProductoCatalogoItem } from '../../core/services/product.service';
import { SearchService } from '../../core/services/search.service';

import { DatePickerModule } from 'primeng/datepicker';

export interface ItemReporteStock {
  productoId: string;
  sku: string;
  nombre: string;
  laboratorio: string;
  categoria: string;
  tipoProducto: 'MEDICAMENTO' | 'PERFUME' | 'OTROS';
  cantidadLotes: number;
  lotePrincipal: string;
  proximoVencimiento: string;
  sede: string;
  stockTotal: number;
  costoUnitario: number;
  precioVentaUnitario: number;
  costoInversionTotal: number;
  valorVentaTotal: number;
  gananciaProyectada: number;
}

export interface ResumenDiaReporte {
  fecha: string; // YYYY-MM-DD
  fechaFormateada: string;
  diaSemana: string;
  cajeroPrincipal: string;
  cajeros: string[];
  fondoApertura: number;
  totalVentas: number;
  totalEfectivo: number;
  totalYape: number;
  totalPlin: number;
  totalTarjeta: number;
  ticketsEmitidos: number;
  ticketsAnulados: number;
  ticketPromedio: number;
  turnosDelDia: TurnoCajaDTO[];
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePickerModule, RouterLink],
  templateUrl: './reportes.html'
})
export class Reportes implements OnInit {
  public ventaService = inject(VentaService);
  public authService = inject(AuthService);
  public inventoryService = inject(InventoryService);
  public productService = inject(ProductService);
  private searchService = inject(SearchService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  // --- NAVEGACIÓN POR PESTAÑAS ---
  tabActiva: 'GENERAL' | 'DETALLADO' | 'APERTURAS' | 'STOCK' = 'GENERAL';

  // Datos base
  turnoActual: TurnoCajaDTO | null = null;
  historialTurnos: TurnoCajaDTO[] = [];
  ventas: TicketVentaDTO[] = [];

  get turnoHoy(): TurnoCajaDTO | null {
    if (!this.turnoActual || !this.turnoActual.fechaApertura) return null;
    const hoyIso = new Date().toLocaleDateString('en-CA');
    const fIso = this.toIsoDate(this.turnoActual.fechaApertura);
    return fIso === hoyIso ? this.turnoActual : null;
  }

  // ================= 4. PESTAÑA: REPORTE DE STOCK VALORIZADO =================
  lotesStockReporte: LoteItem[] = [];
  catalogoStockReporte: ProductoCatalogoItem[] = [];
  itemsReporteStock: ItemReporteStock[] = [];
  busquedaStock = '';
  filtroSedeStock = 'TODAS';
  filtroTipoStock: 'TODOS' | 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = 'TODOS';
  filtroNivelStock: 'CON_STOCK' | 'TODOS' | 'STOCK_BAJO' | 'SIN_STOCK' = 'CON_STOCK';
  ordenStock: 'VALOR_DESC' | 'STOCK_DESC' | 'STOCK_ASC' | 'NOMBRE_ASC' = 'VALOR_DESC';
  paginaStock = 1;
  itemsPorPaginaStock = 15;

  // ================= 1. PESTAÑA: REPORTE GENERAL =================
  fechaInicioGeneral: string = '';
  fechaFinGeneral: string = '';
  rangoFechasGeneral: (Date | null)[] = [];
  filtroSedeGeneral = 'TODAS';
  reportePorDias: ResumenDiaReporte[] = [];

  // ================= 2. PESTAÑA: REPORTE DETALLADO =================
  fechaDetallada: string = new Date().toLocaleDateString('en-CA');
  busquedaDetalle = '';
  filtroMetodoDetalle = 'TODOS';
  filtroEstadoDetalle = 'TODOS';
  filtroSedeDetalle = 'TODAS';
  ventasDetalladas: TicketVentaDTO[] = [];
  paginaDetalle = 1;
  itemsPorPaginaDetalle = 10;

  // ================= 3. PESTAÑA: APERTURAS DE CAJA =================
  todasLasAperturas: TurnoCajaDTO[] = [];
  aperturasFiltradas: TurnoCajaDTO[] = [];
  fechaInicioApertura: string = '';
  fechaFinApertura: string = '';
  rangoFechasApertura: (Date | null)[] = [];
  filtroCajeroApertura = 'TODOS';
  busquedaApertura = '';
  filtroEstadoApertura = 'TODOS';
  filtroSedeApertura = 'TODAS';

  // Modales existentes
  showDetalleModal = false;
  ticketSeleccionado: TicketVentaDTO | null = null;

  showCorregirPagoModal = false;
  ticketACorregir: TicketVentaDTO | null = null;
  nuevoMetodoPago = 'Yape';
  referenciaPago = '';

  // Modal Reapertura de Caja (Regla: solo 1 apertura por día; reabrir si fue cerrada)
  showReabrirModal = false;
  turnoAReabrir: TurnoCajaDTO | null = null;
  motivoReapertura = 'Reanudación de ventas de la jornada';
  autorizadoPorReapertura = 'Supervisor de Farmacia';

  mensajeToast: { tipo: 'success' | 'warning' | 'error'; texto: string } | null = null;

  // Estado de conexión en vivo con Supabase
  cargandoSupabase = false;
  ultimaConsultaNube: Date = new Date();
  conteoVentasNube = 0;

  get sedeActivaNombre(): string {
    return this.authService.activeSede()?.nombre || 'Medicare Farmacia';
  }

  normalizarNombreSede(nombre?: string): string {
    if (!nombre) return 'Medicare Farmacia';
    const n = nombre.toLowerCase().trim();
    if (n.includes('kelly') || n.includes('apurimac') || n.includes('baños')) {
      return 'D Kelly Store';
    }
    return 'Medicare Farmacia';
  }

  sedeCoincide(sedeItem?: string, filtro?: string): boolean {
    if (!filtro || filtro === 'TODAS') return true;
    return this.normalizarNombreSede(sedeItem) === this.normalizarNombreSede(filtro);
  }

  obtenerSucursalIdPorNombre(nombreSede: string): string | undefined {
    if (!nombreSede || nombreSede === 'TODAS') return undefined;
    const sedes = this.authService.getSedes();
    const s = sedes.find(x => this.normalizarNombreSede(x.nombre) === this.normalizarNombreSede(nombreSede));
    if (s) return s.id;
    if (this.normalizarNombreSede(nombreSede) === 'D Kelly Store') return '45fca103-2669-48b8-8a1c-7e5380da5e1f';
    return '11111111-1111-1111-1111-111111111111';
  }

  ngOnInit() {
    // Sincronizar reportes con la Sede Activa para mantener información 100% independiente
    const sedeActiva = this.authService.activeSede();
    const nombreSede = sedeActiva?.nombre || 'Medicare Farmacia';
    this.filtroSedeGeneral = nombreSede;
    this.filtroSedeDetalle = nombreSede;
    this.filtroSedeApertura = nombreSede;
    this.filtroSedeStock = 'TODAS';

    // Configurar fechas iniciales del reporte general y aperturas (últimos 14 días a hoy)
    const fin = new Date();
    const ini = new Date();
    ini.setDate(ini.getDate() - 13);
    this.fechaFinGeneral = fin.toLocaleDateString('en-CA');
    this.fechaInicioGeneral = ini.toLocaleDateString('en-CA');
    this.fechaFinApertura = fin.toLocaleDateString('en-CA');
    this.fechaInicioApertura = ini.toLocaleDateString('en-CA');
    this.rangoFechasGeneral = [ini, fin];
    this.rangoFechasApertura = [ini, fin];

    // Cargar datos iniciales desde memoria local para renderizado instantáneo
    this.turnoActual = this.ventaService.getTurnoActual();
    this.historialTurnos = this.ventaService.getHistorialTurnos();
    this.ventas = [...this.ventaService.ventas];
    this.cargarAperturas();
    this.calcularReporteGeneral();

    // Verificar si se solicitó abrir directamente la pestaña de STOCK desde Inventario
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam === 'STOCK') {
      this.tabActiva = 'STOCK';
      this.consultarSupabaseStock();
    } else {
      // Sincronizar en vivo con Supabase Cloud PostgreSQL
      this.consultarSupabaseGeneral();
    }
  }

  cargarDatos() {
    this.recargarDatosNube();
  }

  recargarDatosNube() {
    if (this.tabActiva === 'GENERAL') {
      this.consultarSupabaseGeneral();
    } else if (this.tabActiva === 'DETALLADO') {
      this.consultarSupabaseDetalle();
    } else if (this.tabActiva === 'APERTURAS') {
      this.consultarSupabaseAperturas();
    } else if (this.tabActiva === 'STOCK') {
      this.consultarSupabaseStock();
    }
  }

  consultarSupabaseGeneral() {
    this.cargandoSupabase = true;
    this.cdr.markForCheck();
    const sucursalId = this.obtenerSucursalIdPorNombre(this.filtroSedeGeneral);

    forkJoin({
      ventas: this.ventaService.consultarVentasSupabase(this.fechaInicioGeneral, this.fechaFinGeneral, sucursalId),
      turnos: this.ventaService.consultarTurnosSupabase(this.fechaInicioGeneral, this.fechaFinGeneral, sucursalId)
    }).subscribe({
      next: ({ ventas, turnos }) => {
        this.ngZone.run(() => {
          this.cargandoSupabase = false;
          this.ultimaConsultaNube = new Date();
          this.conteoVentasNube = ventas.length;

          // Deduplicar ventas por id (fusionando ventas locales en memoria con la nube)
          const mapa = new Map<string, TicketVentaDTO>();
          this.ventaService.ventas.forEach(v => {
            if (v && v.id) mapa.set(v.id, v);
          });
          ventas.forEach(v => {
            if (v && v.id) mapa.set(v.id, v);
          });
          this.ventas = Array.from(mapa.values());

          this.historialTurnos = turnos || [];
          this.cargarAperturas();
          this.calcularReporteGeneral();

          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          this.cargandoSupabase = false;
          console.warn('Error al consultar Supabase en Reporte General:', err);
          const mapa = new Map<string, TicketVentaDTO>();
          this.ventaService.ventas.forEach(v => { if (v?.id) mapa.set(v.id, v); });
          this.ventas.forEach(v => { if (v?.id) mapa.set(v.id, v); });
          this.ventas = Array.from(mapa.values());
          this.calcularReporteGeneral();
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      }
    });
  }

  consultarSupabaseDetalle() {
    this.cargandoSupabase = true;
    this.cdr.markForCheck();
    const sucursalId = this.obtenerSucursalIdPorNombre(this.filtroSedeDetalle);
    this.ventaService.consultarVentasSupabase(this.fechaDetallada, this.fechaDetallada, sucursalId)
      .subscribe({
        next: (ventasDb) => {
          this.ngZone.run(() => {
            this.cargandoSupabase = false;
            this.ultimaConsultaNube = new Date();

            const mapa = new Map<string, TicketVentaDTO>();
            this.ventaService.ventas.forEach(v => { if (v?.id) mapa.set(v.id, v); });
            this.ventas.forEach(v => { if (v?.id) mapa.set(v.id, v); });
            ventasDb.forEach(v => { if (v?.id) mapa.set(v.id, v); });
            this.ventas = Array.from(mapa.values());

            this.aplicarFiltrosDetallados();
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.cargandoSupabase = false;
            const mapa = new Map<string, TicketVentaDTO>();
            this.ventaService.ventas.forEach(v => { if (v?.id) mapa.set(v.id, v); });
            this.ventas.forEach(v => { if (v?.id) mapa.set(v.id, v); });
            this.ventas = Array.from(mapa.values());
            this.aplicarFiltrosDetallados();
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        }
      });
  }

  consultarSupabaseAperturas() {
    this.cargandoSupabase = true;
    this.cdr.markForCheck();
    const sucursalId = this.obtenerSucursalIdPorNombre(this.filtroSedeApertura);
    this.ventaService.consultarTurnosSupabase(this.fechaInicioApertura, this.fechaFinApertura, sucursalId)
      .subscribe({
        next: (turnosDb) => {
          this.ngZone.run(() => {
            this.cargandoSupabase = false;
            this.ultimaConsultaNube = new Date();

            this.historialTurnos = turnosDb || [];
            const hoyIso = new Date().toLocaleDateString('en-CA');
            const turnoHoyDb = this.historialTurnos.find(t => this.toIsoDate(t.fechaApertura) === hoyIso);
            if (turnoHoyDb) {
              this.turnoActual = turnoHoyDb;
            } else {
              this.turnoActual = this.ventaService.getTurnoActual();
            }

            this.cargarAperturas();
            this.calcularReporteGeneral();
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.cargandoSupabase = false;
            this.cargarAperturas();
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        }
      });
  }

  cambiarTab(tab: 'GENERAL' | 'DETALLADO' | 'APERTURAS' | 'STOCK') {
    this.tabActiva = tab;
    if (tab === 'GENERAL') {
      this.consultarSupabaseGeneral();
    } else if (tab === 'DETALLADO') {
      this.consultarSupabaseDetalle();
    } else if (tab === 'APERTURAS') {
      this.consultarSupabaseAperturas();
    } else if (tab === 'STOCK') {
      this.consultarSupabaseStock();
    }
  }

  // ================= LÓGICA: REPORTE DE STOCK VALORIZADO =================
  consultarSupabaseStock() {
    this.cargandoSupabase = true;
    this.cdr.markForCheck();

    const sucursalId = this.obtenerSucursalIdPorNombre(this.filtroSedeStock);

    // Precarga inmediata si ya hay datos en memoria
    if (this.inventoryService.lotesInventario?.length > 0 || this.productService.productosCatalogo?.length > 0) {
      this.lotesStockReporte = [...(this.inventoryService.lotesInventario || [])];
      this.catalogoStockReporte = [...(this.productService.productosCatalogo || [])];
      this.calcularReporteStock();
    }

    forkJoin({
      lotes: this.inventoryService.listarLotesFefo(sucursalId || 'TODAS'),
      catalogo: this.productService.listarCatalogoActivos()
    }).subscribe({
      next: ({ lotes, catalogo }) => {
        this.ngZone.run(() => {
          this.cargandoSupabase = false;
          this.ultimaConsultaNube = new Date();
          this.lotesStockReporte = lotes || [];
          this.catalogoStockReporte = catalogo || [];
          this.calcularReporteStock();
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.cargandoSupabase = false;
          this.calcularReporteStock();
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      }
    });
  }

  calcularReporteStock() {
    const mapaCatalogo = new Map<string, ProductoCatalogoItem>();
    (this.catalogoStockReporte || []).forEach(p => {
      if (p?.id) mapaCatalogo.set(String(p.id), p);
    });

    const agrupado = new Map<string, {
      productoId: string;
      sku: string;
      nombre: string;
      laboratorio: string;
      categoria: string;
      tipoProducto: 'MEDICAMENTO' | 'PERFUME' | 'OTROS';
      cantidadLotes: number;
      lotePrincipal: string;
      proximoVencimiento: string;
      sede: string;
      stockTotal: number;
      precioVentaUnitario: number;
      costoInversionTotal: number;
      valorVentaTotal: number;
    }>();

    // 1. Procesar todos los lotes en stock_inventario
    (this.lotesStockReporte || []).forEach(l => {
      if (this.filtroSedeStock !== 'TODAS' && !this.sedeCoincide(l.sucursalNombre, this.filtroSedeStock)) {
        return;
      }

      const prodCat = mapaCatalogo.get(String(l.productoId));
      const key = String(l.productoId || l.producto);
      const stockLote = Number(l.stock) || 0;

      const pvUnit = (l.precioVentaUnitario && l.precioVentaUnitario > 0)
        ? l.precioVentaUnitario
        : (Number(prodCat?.precioUnidad) || Number(prodCat?.precioVenta) || Number(prodCat?.precioCaja) || 0);

      const costoUnit = (l.costoTotalProveedor && l.costoTotalProveedor > 0 && stockLote > 0)
        ? Number((l.costoTotalProveedor / stockLote).toFixed(2))
        : ((l.costoUnitario && l.costoUnitario > 0) ? l.costoUnitario : Number((pvUnit * 0.70).toFixed(2)));

      const costoLote = (l.costoTotalProveedor && l.costoTotalProveedor > 0)
        ? Number(l.costoTotalProveedor)
        : Number((stockLote * costoUnit).toFixed(2));

      const valorVentaLote = Number((stockLote * pvUnit).toFixed(2));

      const tipo: 'MEDICAMENTO' | 'PERFUME' | 'OTROS' = l.tipoProducto || prodCat?.tipoProducto || 'MEDICAMENTO';
      const sku = l.sku || prodCat?.sku || ('MED-' + key.slice(0, 6));
      const categoria = l.categoriaNombre || prodCat?.categoriaNombre || 'General';
      const lab = l.laboratorio || prodCat?.laboratorio || prodCat?.marca || 'General';
      const nombre = l.producto || prodCat?.nombreComercial || 'Producto';

      const existente = agrupado.get(key);
      if (existente) {
        existente.cantidadLotes += 1;
        existente.stockTotal += stockLote;
        existente.costoInversionTotal = Number((existente.costoInversionTotal + costoLote).toFixed(2));
        existente.valorVentaTotal = Number((existente.valorVentaTotal + valorVentaLote).toFixed(2));
        if (l.vencimiento && l.vencimiento !== 'No expira' && (existente.proximoVencimiento === 'No expira' || l.vencimiento < existente.proximoVencimiento)) {
          existente.proximoVencimiento = l.vencimiento;
          existente.lotePrincipal = l.lote;
        }
      } else {
        agrupado.set(key, {
          productoId: key,
          sku,
          nombre,
          laboratorio: lab,
          categoria,
          tipoProducto: tipo,
          cantidadLotes: 1,
          lotePrincipal: l.lote || 'S/L',
          proximoVencimiento: l.vencimiento || 'No expira',
          sede: l.sucursalNombre || this.sedeActivaNombre,
          stockTotal: stockLote,
          precioVentaUnitario: pvUnit,
          costoInversionTotal: costoLote,
          valorVentaTotal: valorVentaLote
        });
      }
    });

    // 2. Si el usuario desea ver también productos del catálogo sin lotes/stock
    if (this.filtroNivelStock === 'TODOS' || this.filtroNivelStock === 'SIN_STOCK') {
      (this.catalogoStockReporte || []).forEach(p => {
        const key = String(p.id);
        if (!agrupado.has(key)) {
          const pvUnit = Number(p.precioUnidad) || Number(p.precioVenta) || Number(p.precioCaja) || 0;
          agrupado.set(key, {
            productoId: key,
            sku: p.sku || ('MED-' + key.slice(0, 6)),
            nombre: p.nombreComercial,
            laboratorio: p.laboratorio || p.marca || 'General',
            categoria: p.categoriaNombre || 'General',
            tipoProducto: p.tipoProducto || 'MEDICAMENTO',
            cantidadLotes: 0,
            lotePrincipal: 'SIN LOTE',
            proximoVencimiento: '—',
            sede: this.filtroSedeStock === 'TODAS' ? 'Todas las sedes' : this.filtroSedeStock,
            stockTotal: 0,
            precioVentaUnitario: pvUnit,
            costoInversionTotal: 0,
            valorVentaTotal: 0
          });
        }
      });
    }

    this.itemsReporteStock = Array.from(agrupado.values()).map(item => {
      const costoUnitPromedio = item.stockTotal > 0
        ? Number((item.costoInversionTotal / item.stockTotal).toFixed(2))
        : Number((item.precioVentaUnitario * 0.70).toFixed(2));
      const ganancia = Math.max(0, Number((item.valorVentaTotal - item.costoInversionTotal).toFixed(2)));
      return {
        ...item,
        costoUnitario: costoUnitPromedio,
        gananciaProyectada: ganancia
      };
    });

    this.paginaStock = 1;
    this.cdr.markForCheck();
  }

  get itemsReporteStockFiltrados(): ItemReporteStock[] {
    let list = [...this.itemsReporteStock];

    // Filtro por nivel de stock
    if (this.filtroNivelStock === 'CON_STOCK') {
      list = list.filter(i => i.stockTotal > 0);
    } else if (this.filtroNivelStock === 'STOCK_BAJO') {
      list = list.filter(i => i.stockTotal > 0 && i.stockTotal <= 10);
    } else if (this.filtroNivelStock === 'SIN_STOCK') {
      list = list.filter(i => i.stockTotal === 0);
    }

    // Filtro por tipo de producto
    if (this.filtroTipoStock !== 'TODOS') {
      list = list.filter(i => i.tipoProducto === this.filtroTipoStock);
    }

    // Búsqueda inteligente por texto
    if (this.busquedaStock && this.busquedaStock.trim()) {
      list = this.searchService.search(
        list,
        this.busquedaStock,
        ['nombre', 'sku', 'laboratorio', 'categoria', 'lotePrincipal'],
        { nombre: 3, sku: 2 }
      );
    }

    // Ordenamiento
    switch (this.ordenStock) {
      case 'VALOR_DESC':
        list.sort((a, b) => b.valorVentaTotal - a.valorVentaTotal);
        break;
      case 'STOCK_DESC':
        list.sort((a, b) => b.stockTotal - a.stockTotal);
        break;
      case 'STOCK_ASC':
        list.sort((a, b) => a.stockTotal - b.stockTotal);
        break;
      case 'NOMBRE_ASC':
        list.sort((a, b) => a.nombre.localeCompare(b.nombre));
        break;
    }

    return list;
  }

  get itemsReporteStockPaginados(): ItemReporteStock[] {
    const inicio = (this.paginaStock - 1) * this.itemsPorPaginaStock;
    return this.itemsReporteStockFiltrados.slice(inicio, inicio + this.itemsPorPaginaStock);
  }

  get totalPaginasStock(): number {
    return Math.max(1, Math.ceil(this.itemsReporteStockFiltrados.length / this.itemsPorPaginaStock));
  }

  cambiarPaginaStock(p: number) {
    if (p >= 1 && p <= this.totalPaginasStock) {
      this.paginaStock = p;
    }
  }

  get totalUnidadesStockReporte(): number {
    return this.itemsReporteStockFiltrados.reduce((sum, i) => sum + i.stockTotal, 0);
  }

  get totalLotesStockReporte(): number {
    return this.itemsReporteStockFiltrados.reduce((sum, i) => sum + i.cantidadLotes, 0);
  }

  get totalCostoInversionStockReporte(): number {
    return this.itemsReporteStockFiltrados.reduce((sum, i) => sum + i.costoInversionTotal, 0);
  }

  get totalValorVentaStockReporte(): number {
    return this.itemsReporteStockFiltrados.reduce((sum, i) => sum + i.valorVentaTotal, 0);
  }

  get totalGananciaStockReporte(): number {
    return this.itemsReporteStockFiltrados.reduce((sum, i) => sum + i.gananciaProyectada, 0);
  }

  limpiarFiltrosStock() {
    this.busquedaStock = '';
    this.filtroTipoStock = 'TODOS';
    this.filtroNivelStock = 'CON_STOCK';
    this.ordenStock = 'VALOR_DESC';
    this.paginaStock = 1;
    this.calcularReporteStock();
  }

  // ================= LÓGICA: REPORTE GENERAL =================
  calcularReporteGeneral() {
    const inicioStr = this.fechaInicioGeneral;
    const finStr = this.fechaFinGeneral;

    // Obtener conjunto único de fechas dentro del rango para la sede seleccionada
    const fechasSet = new Set<string>();

    this.ventas.forEach(v => {
      const f = this.toIsoDate(v.fecha);
      const coincideSede = this.sedeCoincide(v.sede, this.filtroSedeGeneral);
      if (coincideSede && (!inicioStr || f >= inicioStr) && (!finStr || f <= finStr)) {
        fechasSet.add(f);
      }
    });

    this.todasLasAperturas.forEach(t => {
      const f = this.toIsoDate(t.fechaApertura);
      const coincideSede = this.sedeCoincide(t.sede, this.filtroSedeGeneral);
      if (coincideSede && (!inicioStr || f >= inicioStr) && (!finStr || f <= finStr)) {
        fechasSet.add(f);
      }
    });

    // Si no existen movimientos ni aperturas en el rango, no generar datos ficticios
    if (fechasSet.size === 0) {
      this.reportePorDias = [];
      return;
    }

    const fechasOrdenadas = Array.from(fechasSet).sort().reverse();

    this.reportePorDias = fechasOrdenadas.map(fechaStr => {
      // Ventas de este día
      let ventasDia = this.ventas.filter(v => this.toIsoDate(v.fecha) === fechaStr);
      if (this.filtroSedeGeneral !== 'TODAS') {
        ventasDia = ventasDia.filter(v => this.sedeCoincide(v.sede, this.filtroSedeGeneral));
      }

      // Turnos de este día filtrados estrictamente por sede
      let turnosDia = this.todasLasAperturas.filter(t => this.toIsoDate(t.fechaApertura) === fechaStr);
      if (this.filtroSedeGeneral !== 'TODAS') {
        turnosDia = turnosDia.filter(t => this.sedeCoincide(t.sede, this.filtroSedeGeneral));
      }

      // Cajeros que trabajaron ese día
      const setCajeros = new Set<string>();
      turnosDia.forEach(t => {
        if (t.cajeroActual) setCajeros.add(t.cajeroActual);
      });
      if (setCajeros.size === 0) {
        ventasDia.forEach(v => {
          if (v.cajero) setCajeros.add(v.cajero);
        });
      }
      if (setCajeros.size === 0) {
        if (this.turnoActual?.cajaAbierta && this.turnoActual?.cajeroActual && this.toIsoDate(this.turnoActual?.fechaApertura) === fechaStr) {
          setCajeros.add(this.turnoActual.cajeroActual);
        } else {
          setCajeros.add('Sin turno asignado');
        }
      }
      const cajerosArray = Array.from(setCajeros);
      const cajeroPrincipal = cajerosArray.join(', ');

      // Fondo de apertura de ese día
      let fondo = 0;
      if (turnosDia.length > 0) {
        fondo = Number(turnosDia[0].fondoInicial) || 0;
      } else if (this.turnoActual?.cajaAbierta && this.toIsoDate(this.turnoActual?.fechaApertura) === fechaStr) {
        fondo = Number(this.turnoActual.fondoInicial) || 0;
      } else {
        fondo = 0;
      }

      // Desglose de ventas
      const emitidas = ventasDia.filter(v => v.estado === 'EMITIDO');
      const totalVentas = emitidas.reduce((sum, v) => sum + v.total, 0);

      const totalEfectivo = emitidas.reduce((sum, v) => {
        const ef = v.desglose?.find(d => d.metodo.toLowerCase() === 'efectivo');
        return sum + (ef ? ef.monto : (v.metodo.toLowerCase() === 'efectivo' ? v.total : 0));
      }, 0);

      const totalYape = emitidas.reduce((sum, v) => {
        const yp = v.desglose?.find(d => d.metodo.toLowerCase() === 'yape' || (d.metodo.includes('Yape') && !d.metodo.includes('Plin')));
        if (yp) return sum + yp.monto;
        if (v.metodo.toLowerCase() === 'yape' || v.metodo === 'Yape / Plin') return sum + v.total;
        return sum;
      }, 0);

      const totalPlin = emitidas.reduce((sum, v) => {
        const pl = v.desglose?.find(d => d.metodo.toLowerCase() === 'plin' || (d.metodo.includes('Plin') && !d.metodo.includes('Yape')));
        if (pl) return sum + pl.monto;
        if (v.metodo.toLowerCase() === 'plin') return sum + v.total;
        return sum;
      }, 0);

      const totalTarjeta = emitidas.reduce((sum, v) => {
        const tj = v.desglose?.find(d => d.metodo.toLowerCase().includes('tarjeta'));
        return sum + (tj ? tj.monto : (v.metodo.toLowerCase().includes('tarjeta') ? v.total : 0));
      }, 0);

      const ticketsEmitidos = emitidas.length;
      const ticketsAnulados = ventasDia.filter(v => v.estado === 'ANULADO').length;
      const ticketPromedio = ticketsEmitidos > 0 ? Number((totalVentas / ticketsEmitidos).toFixed(2)) : 0;

      return {
        fecha: fechaStr,
        fechaFormateada: this.formatFechaLegible(fechaStr),
        diaSemana: this.getDiaSemana(fechaStr),
        cajeroPrincipal,
        cajeros: cajerosArray,
        fondoApertura: fondo,
        totalVentas,
        totalEfectivo,
        totalYape,
        totalPlin,
        totalTarjeta,
        ticketsEmitidos,
        ticketsAnulados,
        ticketPromedio,
        turnosDelDia: turnosDia
      };
    });
  }

  formatDateToYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  onRangoGeneralChange(fechas: (Date | null)[] | null) {
    if (!fechas || fechas.length === 0) {
      this.fechaInicioGeneral = '';
      this.fechaFinGeneral = '';
      this.consultarSupabaseGeneral();
      return;
    }
    if (fechas[0] && fechas[1]) {
      this.fechaInicioGeneral = this.formatDateToYmd(fechas[0]);
      this.fechaFinGeneral = this.formatDateToYmd(fechas[1]);
      this.consultarSupabaseGeneral();
    }
  }

  onRangoAperturasChange(fechas: (Date | null)[] | null) {
    if (!fechas || fechas.length === 0) {
      this.fechaInicioApertura = '';
      this.fechaFinApertura = '';
      this.consultarSupabaseAperturas();
      return;
    }
    if (fechas[0] && fechas[1]) {
      this.fechaInicioApertura = this.formatDateToYmd(fechas[0]);
      this.fechaFinApertura = this.formatDateToYmd(fechas[1]);
      this.consultarSupabaseAperturas();
    }
  }

  setRangoGeneral(rango: 'HOY' | '7DIAS' | 'MES' | 'TODO') {
    const hoy = new Date();
    const hoyStr = this.formatDateToYmd(hoy);

    if (rango === 'HOY') {
      this.fechaInicioGeneral = hoyStr;
      this.fechaFinGeneral = hoyStr;
      this.rangoFechasGeneral = [hoy, hoy];
    } else if (rango === '7DIAS') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      this.fechaInicioGeneral = this.formatDateToYmd(d);
      this.fechaFinGeneral = hoyStr;
      this.rangoFechasGeneral = [d, hoy];
    } else if (rango === 'MES') {
      const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      this.fechaInicioGeneral = this.formatDateToYmd(primerDia);
      this.fechaFinGeneral = hoyStr;
      this.rangoFechasGeneral = [primerDia, hoy];
    } else if (rango === 'TODO') {
      this.fechaInicioGeneral = '';
      this.fechaFinGeneral = '';
      this.rangoFechasGeneral = [];
    }

    this.consultarSupabaseGeneral();
  }

  // KPIs calculados del Período General
  get kpiTotalVentasGeneral(): number {
    return this.reportePorDias.reduce((sum, d) => sum + d.totalVentas, 0);
  }

  get kpiTotalEfectivoGeneral(): number {
    return this.reportePorDias.reduce((sum, d) => sum + d.totalEfectivo, 0);
  }

  get kpiTotalDigitalGeneral(): number {
    return this.reportePorDias.reduce((sum, d) => sum + d.totalYape + d.totalPlin, 0);
  }

  get kpiTotalTarjetaGeneral(): number {
    return this.reportePorDias.reduce((sum, d) => sum + d.totalTarjeta, 0);
  }

  get kpiTotalTicketsGeneral(): number {
    return this.reportePorDias.reduce((sum, d) => sum + d.ticketsEmitidos, 0);
  }

  // Atajo: ir desde una fila del reporte general al reporte detallado de ese día
  irADetalleDia(fechaStr: string) {
    this.fechaDetallada = fechaStr;
    this.tabActiva = 'DETALLADO';
    this.consultarSupabaseDetalle();
  }

  // ================= LÓGICA: REPORTE DETALLADO (POR FECHA ÚNICA) =================
  aplicarFiltrosDetallados() {
    let list = this.ventas.filter(v => this.toIsoDate(v.fecha) === this.fechaDetallada);

    // Filtro método de pago
    if (this.filtroMetodoDetalle !== 'TODOS') {
      const f = this.filtroMetodoDetalle.toLowerCase();
      list = list.filter(v => {
        if (f === 'mixto') {
          return v.metodo.toLowerCase().includes('mixto') || (v.desglose && v.desglose.length > 1);
        }
        return v.metodo.toLowerCase().includes(f) || v.desglose?.some(d => d.metodo.toLowerCase().includes(f));
      });
    }

    // Filtro estado
    if (this.filtroEstadoDetalle !== 'TODOS') {
      list = list.filter(v => v.estado === this.filtroEstadoDetalle);
    }

    // Filtro Sede
    if (this.filtroSedeDetalle && this.filtroSedeDetalle !== 'TODAS') {
      list = list.filter(v => this.sedeCoincide(v.sede, this.filtroSedeDetalle));
    }

    // Buscador
    if (this.busquedaDetalle.trim()) {
      const q = this.busquedaDetalle.toLowerCase();
      list = list.filter(v =>
        v.id.toLowerCase().includes(q) ||
        v.cliente.toLowerCase().includes(q) ||
        v.dni.includes(q) ||
        v.items.some(it => it.nombre.toLowerCase().includes(q))
      );
    }

    // Ordenar por hora (más recientes primero)
    list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    this.ventasDetalladas = list;
    this.paginaDetalle = 1;
    this.cdr.markForCheck();
  }

  setFechaDetalle(tipo: 'HOY' | 'AYER') {
    const d = new Date();
    if (tipo === 'AYER') d.setDate(d.getDate() - 1);
    this.fechaDetallada = d.toLocaleDateString('en-CA');
    this.consultarSupabaseDetalle();
  }

  moverFechaDetalle(dias: number) {
    const [y, m, d] = this.fechaDetallada.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dias);
    this.fechaDetallada = dt.toLocaleDateString('en-CA');
    this.consultarSupabaseDetalle();
  }

  // KPIs del día detallado
  get kpiTotalVentasDetalle(): number {
    return this.ventasDetalladas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => sum + v.total, 0);
  }

  get kpiTotalEfectivoDetalle(): number {
    return this.ventasDetalladas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const ef = v.desglose?.find(d => d.metodo.toLowerCase() === 'efectivo');
        return sum + (ef ? ef.monto : (v.metodo.toLowerCase() === 'efectivo' ? v.total : 0));
      }, 0);
  }

  get kpiTotalYapePlinDetalle(): number {
    return this.ventasDetalladas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const yp = v.desglose?.find(d => d.metodo.toLowerCase() === 'yape' || d.metodo.toLowerCase() === 'plin');
        if (yp) return sum + yp.monto;
        if (v.metodo.toLowerCase() === 'yape' || v.metodo.toLowerCase() === 'plin' || v.metodo.includes('Yape')) return sum + v.total;
        return sum;
      }, 0);
  }

  get kpiTotalTarjetaDetalle(): number {
    return this.ventasDetalladas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const tj = v.desglose?.find(d => d.metodo.toLowerCase().includes('tarjeta'));
        return sum + (tj ? tj.monto : (v.metodo.toLowerCase().includes('tarjeta') ? v.total : 0));
      }, 0);
  }

  get kpiTicketsEmitidosDetalle(): number {
    return this.ventasDetalladas.filter(v => v.estado === 'EMITIDO').length;
  }

  get ventasDetalladasPaginadas(): TicketVentaDTO[] {
    const inicio = (this.paginaDetalle - 1) * this.itemsPorPaginaDetalle;
    return this.ventasDetalladas.slice(inicio, inicio + this.itemsPorPaginaDetalle);
  }

  get totalPaginasDetalle(): number {
    return Math.max(1, Math.ceil(this.ventasDetalladas.length / this.itemsPorPaginaDetalle));
  }

  cambiarPaginaDetalle(p: number) {
    if (p >= 1 && p <= this.totalPaginasDetalle) {
      this.paginaDetalle = p;
    }
  }

  // ================= LÓGICA: REPORTE DE APERTURAS DE CAJA =================
  cargarAperturas() {
    // Regla estricta: solo debe haber UNA apertura por día POR CADA SEDE
    const mapaPorDiaSede = new Map<string, TurnoCajaDTO>();

    // 1. Si hay turno actual registrado con fecha válida, colocarlo para su fecha y sede
    if (this.turnoActual && this.turnoActual.fechaApertura) {
      const fechaIso = this.toIsoDate(this.turnoActual.fechaApertura);
      if (fechaIso) {
        const clave = `${fechaIso}_${this.normalizarNombreSede(this.turnoActual.sede)}`;
        mapaPorDiaSede.set(clave, this.turnoActual);
      }
    }

    // 2. Agregar turnos históricos válidos, respetando que no haya más de una apertura por fecha y sede
    this.historialTurnos.forEach(t => {
      if (t.fechaApertura) {
        const fechaIso = this.toIsoDate(t.fechaApertura);
        if (fechaIso) {
          const clave = `${fechaIso}_${this.normalizarNombreSede(t.sede)}`;
          if (!mapaPorDiaSede.has(clave)) {
            mapaPorDiaSede.set(clave, t);
          }
        }
      }
    });

    // Ordenar de más reciente a más antiguo
    const lista = Array.from(mapaPorDiaSede.values()).sort(
      (a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime()
    );

    this.todasLasAperturas = lista;
    this.aplicarFiltrosAperturas();
  }

  setRangoAperturas(rango: 'HOY' | '7DIAS' | 'MES' | 'TODO') {
    const hoy = new Date();
    const hoyStr = this.formatDateToYmd(hoy);

    if (rango === 'HOY') {
      this.fechaInicioApertura = hoyStr;
      this.fechaFinApertura = hoyStr;
      this.rangoFechasApertura = [hoy, hoy];
    } else if (rango === '7DIAS') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      this.fechaInicioApertura = this.formatDateToYmd(d);
      this.fechaFinApertura = hoyStr;
      this.rangoFechasApertura = [d, hoy];
    } else if (rango === 'MES') {
      const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      this.fechaInicioApertura = this.formatDateToYmd(primerDia);
      this.fechaFinApertura = hoyStr;
      this.rangoFechasApertura = [primerDia, hoy];
    } else if (rango === 'TODO') {
      this.fechaInicioApertura = '';
      this.fechaFinApertura = '';
      this.rangoFechasApertura = [];
    }

    this.consultarSupabaseAperturas();
  }

  aplicarFiltrosAperturas() {
    let list = [...this.todasLasAperturas];

    // Filtro Rango de Fechas (Desde / Hasta)
    if (this.fechaInicioApertura) {
      list = list.filter(t => this.toIsoDate(t.fechaApertura) >= this.fechaInicioApertura);
    }
    if (this.fechaFinApertura) {
      list = list.filter(t => this.toIsoDate(t.fechaApertura) <= this.fechaFinApertura);
    }

    // Filtro Quién trabajó en el local (Cajero)
    if (this.filtroCajeroApertura !== 'TODOS') {
      list = list.filter(t => t.cajeroActual === this.filtroCajeroApertura);
    }

    // Filtro Estado de Caja
    if (this.filtroEstadoApertura !== 'TODOS') {
      const abierta = this.filtroEstadoApertura === 'ABIERTO';
      list = list.filter(t => t.cajaAbierta === abierta);
    }

    // Filtro Sede / Local
    if (this.filtroSedeApertura !== 'TODAS') {
      list = list.filter(t => this.sedeCoincide(t.sede, this.filtroSedeApertura));
    }

    // Búsqueda general
    if (this.busquedaApertura.trim()) {
      const q = this.busquedaApertura.toLowerCase();
      list = list.filter(t =>
        t.cajeroActual.toLowerCase().includes(q) ||
        (t.id && t.id.toLowerCase().includes(q)) ||
        (t.sede && t.sede.toLowerCase().includes(q))
      );
    }

    this.aperturasFiltradas = list;
    this.cdr.markForCheck();
  }

  get kpiTotalAperturas(): number {
    return this.aperturasFiltradas.length;
  }

  get kpiPromedioFondoInicial(): number {
    if (this.aperturasFiltradas.length === 0) return 0;
    const total = this.aperturasFiltradas.reduce((sum, t) => sum + (t.fondoInicial || 0), 0);
    return Number((total / this.aperturasFiltradas.length).toFixed(2));
  }

  get cajerosUnicosAperturas(): string[] {
    const set = new Set<string>();
    this.todasLasAperturas.forEach(t => {
      if (t.cajeroActual) set.add(t.cajeroActual);
    });
    return Array.from(set);
  }

  // ================= TOTALES AL FINAL DE LAS TABLAS (FOOTERS) =================
  get totalFondoAperturaGeneral(): number {
    return this.reportePorDias.reduce((sum, d) => sum + d.fondoApertura, 0);
  }

  get ticketPromedioGeneralGlobal(): number {
    return this.kpiTotalTicketsGeneral > 0
      ? Number((this.kpiTotalVentasGeneral / this.kpiTotalTicketsGeneral).toFixed(2))
      : 0;
  }

  get totalProductosVendidosDetalle(): number {
    return this.ventasDetalladas.reduce((sum, v) => {
      const cantItems = v.items?.reduce((s, it) => s + (it.cantidad || 0), 0) || 0;
      return sum + cantItems;
    }, 0);
  }

  get totalFondosAperturaFiltrados(): number {
    return this.aperturasFiltradas.reduce((sum, t) => sum + (t.fondoInicial || 0), 0);
  }

  get totalRecaudadoAperturasFiltradas(): number {
    return this.aperturasFiltradas.reduce((sum, t) => sum + (t.totalVentas || 0), 0);
  }

  // ================= REAPERTURA Y ELIMINACION DE CAJA (DESDE REPORTES) =================
  async eliminarApertura(turno: TurnoCajaDTO) {
    if (confirm(`¿Estás seguro de eliminar el historial de caja del ${this.formatFechaLegible(this.toIsoDate(turno.fechaApertura))}? Esta acción no se puede deshacer.`)) {
      const idOFecha = turno.id || turno.fechaApertura;
      const exito = await this.ventaService.eliminarTurno(idOFecha);
      
      if (exito) {
        this.mensajeToast = {
          tipo: 'success',
          texto: 'Historial de caja eliminado exitosamente.'
        };
        this.cargarDatos();
      } else {
        this.mensajeToast = {
          tipo: 'error',
          texto: 'No se pudo eliminar el historial de caja.'
        };
      }
      setTimeout(() => this.mensajeToast = null, 3000);
    }
  }

  abrirModalReapertura(turno?: TurnoCajaDTO) {
    this.turnoAReabrir = turno || this.turnoActual;
    this.motivoReapertura = 'Reanudación de ventas de la jornada';
    this.autorizadoPorReapertura = this.authService.getUserDisplayName() || 'Supervisor de Farmacia';
    this.showReabrirModal = true;
  }

  confirmarReaperturaCaja() {
    if (!this.turnoAReabrir) return;

    const idOFecha = this.turnoAReabrir.id || this.turnoAReabrir.fechaApertura;
    const turnoReabierto = this.ventaService.reabrirTurnoPorIdOFecha(
      idOFecha,
      this.motivoReapertura,
      this.autorizadoPorReapertura
    );

    if (turnoReabierto) {
      this.showReabrirModal = false;
      this.mensajeToast = {
        tipo: 'success',
        texto: `✅ Caja del ${this.formatFechaLegible(this.toIsoDate(turnoReabierto.fechaApertura))} reabierta exitosamente. El POS ya puede seguir emitiendo comprobantes.`
      };
      // Recargar datos y refrescar estado de turnos
      this.cargarDatos();
    } else {
      this.mensajeToast = {
        tipo: 'error',
        texto: 'No se pudo reabrir la caja seleccionada.'
      };
    }
  }

  // ================= MODALES Y ACCIONES COMPARTIDAS =================
  verDetalle(ticket: TicketVentaDTO) {
    this.ticketSeleccionado = ticket;
    this.showDetalleModal = true;
  }

  abrirModalCorregirPago(ticket: TicketVentaDTO) {
    this.ticketACorregir = ticket;
    this.nuevoMetodoPago = ticket.metodo.includes('Efectivo') ? 'Yape' : 'Efectivo';
    this.referenciaPago = ticket.desglose?.[0]?.referencia || '';
    this.showCorregirPagoModal = true;
  }

  confirmarCorreccionPago() {
    if (!this.ticketACorregir) return;
    const ticketId = this.ticketACorregir.id;
    const anterior = this.ticketACorregir.metodo;

    this.ventaService.corregirMetodoPago(ticketId, this.nuevoMetodoPago, this.referenciaPago).subscribe(ok => {
      if (ok) {
        this.mensajeToast = {
          tipo: 'success',
          texto: `✅ Comprobante ${ticketId} corregido de "${anterior}" a "${this.nuevoMetodoPago}".`
        };
        setTimeout(() => this.mensajeToast = null, 5000);
        this.showCorregirPagoModal = false;
        this.ticketACorregir = null;
        this.cargarDatos();
      }
    });
  }

  imprimirReporte() {
    window.print();
  }

  // Helpers de Formato
  toIsoDate(d: Date | string): string {
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-CA');
    } catch {
      return '';
    }
  }

  getDiaSemana(fechaStr: string): string {
    try {
      const [y, m, d] = fechaStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      return dias[dt.getDay()];
    } catch {
      return '';
    }
  }

  formatFechaLegible(fechaStr: string): string {
    try {
      const [y, m, d] = fechaStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return fechaStr;
    }
  }

  get listaSedes(): string[] {
    return this.authService.getSedes().map(s => s.nombre);
  }
}
