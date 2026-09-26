import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { VentaService, TicketVentaDTO, TurnoCajaDTO } from '../../core/services/venta.service';
import { AuthService } from '../../core/services/auth.service';

import { DatePickerModule } from 'primeng/datepicker';

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
  imports: [CommonModule, FormsModule, DatePickerModule],
  templateUrl: './reportes.html'
})
export class Reportes implements OnInit {
  public ventaService = inject(VentaService);
  public authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  // --- NAVEGACIÓN POR PESTAÑAS ---
  tabActiva: 'GENERAL' | 'DETALLADO' | 'APERTURAS' = 'GENERAL';

  // Datos base
  turnoActual: TurnoCajaDTO | null = null;
  historialTurnos: TurnoCajaDTO[] = [];
  ventas: TicketVentaDTO[] = [];

  // ================= 1. PESTAÑA: REPORTE GENERAL =================
  fechaInicioGeneral: string = '';
  fechaFinGeneral: string = '';
  rangoFechasGeneral: (Date | null)[] = [];
  filtroSedeGeneral = 'TODAS';
  reportePorDias: ResumenDiaReporte[] = [];

  // ================= 2. PESTAÑA: REPORTE DETALLADO =================
  fechaDetallada: string = new Date().toISOString().split('T')[0];
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
    return this.authService.activeSede()?.nombre || 'Sede Cajamarca Central';
  }

  obtenerSucursalIdPorNombre(nombreSede: string): string | undefined {
    if (!nombreSede || nombreSede === 'TODAS') return undefined;
    const sedes = this.authService.getSedes();
    const s = sedes.find(x => x.nombre?.toLowerCase() === nombreSede.toLowerCase());
    if (s) return s.id;
    if (nombreSede.toLowerCase().includes('baños')) return '45fca103-2669-48b8-8a1c-7e5380da5e1f';
    return '11111111-1111-1111-1111-111111111111';
  }

  ngOnInit() {
    // Sincronizar reportes con la Sede Activa para mantener información 100% independiente
    const sedeActiva = this.authService.activeSede();
    const nombreSede = sedeActiva?.nombre || 'Sede Cajamarca Central';
    this.filtroSedeGeneral = nombreSede;
    this.filtroSedeDetalle = nombreSede;
    this.filtroSedeApertura = nombreSede;

    // Configurar fechas iniciales del reporte general y aperturas (últimos 14 días a hoy)
    const fin = new Date();
    const ini = new Date();
    ini.setDate(ini.getDate() - 13);
    this.fechaFinGeneral = fin.toISOString().split('T')[0];
    this.fechaInicioGeneral = ini.toISOString().split('T')[0];
    this.fechaFinApertura = fin.toISOString().split('T')[0];
    this.fechaInicioApertura = ini.toISOString().split('T')[0];
    this.rangoFechasGeneral = [ini, fin];
    this.rangoFechasApertura = [ini, fin];

    // Cargar datos iniciales desde memoria local para renderizado instantáneo
    this.turnoActual = this.ventaService.getTurnoActual();
    this.historialTurnos = this.ventaService.getHistorialTurnos();
    this.ventas = [...this.ventaService.ventas];
    this.cargarAperturas();
    this.calcularReporteGeneral();

    // Sincronizar en vivo con Supabase Cloud PostgreSQL
    this.consultarSupabaseGeneral();
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

          // Deduplicar ventas por id
          const mapa = new Map<string, TicketVentaDTO>();
          ventas.forEach(v => {
            if (v && v.id) mapa.set(v.id, v);
          });
          this.ventas = Array.from(mapa.values());

          if (turnos && turnos.length > 0) {
            this.historialTurnos = turnos;
          }
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
            this.ventas.forEach(v => mapa.set(v.id, v));
            ventasDb.forEach(v => mapa.set(v.id, v));
            this.ventas = Array.from(mapa.values());

            this.aplicarFiltrosDetallados();
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.cargandoSupabase = false;
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

            if (turnosDb && turnosDb.length > 0) {
              this.historialTurnos = turnosDb;
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

  cambiarTab(tab: 'GENERAL' | 'DETALLADO' | 'APERTURAS') {
    this.tabActiva = tab;
    if (tab === 'GENERAL') {
      this.consultarSupabaseGeneral();
    } else if (tab === 'DETALLADO') {
      this.consultarSupabaseDetalle();
    } else if (tab === 'APERTURAS') {
      this.consultarSupabaseAperturas();
    }
  }

  // ================= LÓGICA: REPORTE GENERAL =================
  calcularReporteGeneral() {
    const inicioStr = this.fechaInicioGeneral;
    const finStr = this.fechaFinGeneral;

    // Obtener conjunto único de fechas dentro del rango para la sede seleccionada
    const fechasSet = new Set<string>();

    this.ventas.forEach(v => {
      const f = this.toIsoDate(v.fecha);
      const coincideSede = this.filtroSedeGeneral === 'TODAS' || (v.sede || 'Sede Cajamarca Central') === this.filtroSedeGeneral;
      if (coincideSede && (!inicioStr || f >= inicioStr) && (!finStr || f <= finStr)) {
        fechasSet.add(f);
      }
    });

    this.todasLasAperturas.forEach(t => {
      const f = this.toIsoDate(t.fechaApertura);
      const coincideSede = this.filtroSedeGeneral === 'TODAS' || (t.sede || 'Sede Cajamarca Central') === this.filtroSedeGeneral;
      if (coincideSede && (!inicioStr || f >= inicioStr) && (!finStr || f <= finStr)) {
        fechasSet.add(f);
      }
    });

    // Si el rango es válido y no hay datos, incluir al menos la fecha de hoy
    if (fechasSet.size === 0 && inicioStr && finStr) {
      fechasSet.add(new Date().toISOString().split('T')[0]);
    }

    const fechasOrdenadas = Array.from(fechasSet).sort().reverse();

    this.reportePorDias = fechasOrdenadas.map(fechaStr => {
      // Ventas de este día
      let ventasDia = this.ventas.filter(v => this.toIsoDate(v.fecha) === fechaStr);
      if (this.filtroSedeGeneral !== 'TODAS') {
        ventasDia = ventasDia.filter(v => (v.sede || 'Sede Cajamarca Central') === this.filtroSedeGeneral);
      }

      // Turnos de este día filtrados estrictamente por sede
      let turnosDia = this.todasLasAperturas.filter(t => this.toIsoDate(t.fechaApertura) === fechaStr);
      if (this.filtroSedeGeneral !== 'TODAS') {
        turnosDia = turnosDia.filter(t => (t.sede || 'Sede Cajamarca Central') === this.filtroSedeGeneral);
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
        // Si no hay turno registrado explícito, inferir cajero o titular
        setCajeros.add(this.turnoActual?.cajeroActual || 'Carlos Mendoza (Cajero Principal)');
      }
      const cajerosArray = Array.from(setCajeros);
      const cajeroPrincipal = cajerosArray.join(', ');

      // Fondo de apertura de ese día
      let fondo = 0;
      if (turnosDia.length > 0) {
        fondo = turnosDia[0].fondoInicial || 100.00;
      } else {
        fondo = 100.00;
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
      list = list.filter(v => (v.sede || 'Sede Cajamarca Central') === this.filtroSedeDetalle);
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
    this.fechaDetallada = d.toISOString().split('T')[0];
    this.consultarSupabaseDetalle();
  }

  moverFechaDetalle(dias: number) {
    const [y, m, d] = this.fechaDetallada.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dias);
    this.fechaDetallada = dt.toISOString().split('T')[0];
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

    // 1. Si hay turno actual registrado, colocarlo para su fecha y sede
    if (this.turnoActual) {
      const fechaIso = this.toIsoDate(this.turnoActual.fechaApertura);
      const clave = `${fechaIso}_${this.turnoActual.sede || 'Sede Cajamarca Central'}`;
      mapaPorDiaSede.set(clave, this.turnoActual);
    }

    // 2. Agregar turnos históricos, respetando que no haya más de una apertura por fecha y sede
    this.historialTurnos.forEach(t => {
      const fechaIso = this.toIsoDate(t.fechaApertura);
      const clave = `${fechaIso}_${t.sede || 'Sede Cajamarca Central'}`;
      if (!mapaPorDiaSede.has(clave)) {
        mapaPorDiaSede.set(clave, t);
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
      list = list.filter(t => (t.sede || 'Sede Cajamarca Central') === this.filtroSedeApertura);
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

  // ================= REAPERTURA DE CAJA (DESDE REPORTES) =================
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
      return dt.toISOString().split('T')[0];
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
    const set = new Set<string>();
    this.authService.getSedes().forEach(s => {
      if (s.nombre) set.add(s.nombre);
    });
    this.ventas.forEach(v => {
      if (v.sede) set.add(v.sede);
    });
    this.todasLasAperturas.forEach(t => {
      if (t.sede) set.add(t.sede);
    });
    return Array.from(set);
  }
}
