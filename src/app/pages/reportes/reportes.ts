import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VentaService, TicketVentaDTO, TurnoCajaDTO } from '../../core/services/venta.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.html'
})
export class Reportes implements OnInit {
  public ventaService = inject(VentaService);
  public authService = inject(AuthService);

  turnoActual: TurnoCajaDTO | null = null;
  historialTurnos: TurnoCajaDTO[] = [];
  ventas: TicketVentaDTO[] = [];
  ventasFiltradas: TicketVentaDTO[] = [];

  // Filtros de Fecha con Calendario
  fechaSeleccionada: string = new Date().toISOString().split('T')[0];
  modoFecha: 'CALENDARIO' | 'TODOS' = 'CALENDARIO';

  // Filtros de Tabla
  busqueda = '';
  filtroMetodo = 'TODOS';
  filtroEstado = 'TODOS';
  filtroSede = 'TODAS';

  get listaSedes(): string[] {
    const set = new Set<string>();
    this.authService.getSedes().forEach(s => {
      if (s.nombre) set.add(s.nombre);
    });
    this.ventas.forEach(v => {
      if (v.sede) set.add(v.sede);
    });
    return Array.from(set);
  }
  
  // Paginación
  paginaActual = 1;
  itemsPorPagina = 10;

  // Modal Detalle Ticket
  showDetalleModal = false;
  ticketSeleccionado: TicketVentaDTO | null = null;

  // Modal Corregir Método de Pago
  showCorregirPagoModal = false;
  ticketACorregir: TicketVentaDTO | null = null;
  nuevoMetodoPago = 'Yape';
  referenciaPago = '';
  mensajeToast: { tipo: 'success' | 'warning' | 'error'; texto: string } | null = null;

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    this.turnoActual = this.ventaService.getTurnoActual();
    this.historialTurnos = this.ventaService.getHistorialTurnos();
    
    // Deduplicar garantizado
    const mapa = new Map<string, TicketVentaDTO>();
    this.ventaService.ventas.forEach(v => {
      if (v && v.id && !mapa.has(v.id)) {
        mapa.set(v.id, v);
      }
    });
    this.ventas = Array.from(mapa.values());
    this.aplicarFiltros();
  }

  /**
   * Determina si el turno aperturado corresponde a la fecha de hoy.
   * Si no fue abierto hoy, el card no debe mostrarse conforme a requerimiento.
   */
  get esTurnoDeHoy(): boolean {
    if (!this.turnoActual || !this.turnoActual.fechaApertura) return false;
    const vFecha = new Date(this.turnoActual.fechaApertura).toISOString().split('T')[0];
    const hoyStr = new Date().toISOString().split('T')[0];
    return vFecha === hoyStr;
  }

  aplicarFiltros() {
    let list = [...this.ventas];

    // Filtro por fecha mediante Calendario o Todo
    if (this.modoFecha === 'CALENDARIO' && this.fechaSeleccionada) {
      list = list.filter(v => {
        const vFecha = new Date(v.fecha).toISOString().split('T')[0];
        return vFecha === this.fechaSeleccionada;
      });
    }

    // Filtro por método
    if (this.filtroMetodo !== 'TODOS') {
      const f = this.filtroMetodo.toLowerCase();
      list = list.filter(v => {
        if (f === 'mixto') {
          return v.metodo.toLowerCase().includes('mixto') || (v.desglose && v.desglose.length > 1);
        }
        if (f === 'yape') {
          return v.metodo.toLowerCase() === 'yape' || v.desglose?.some(d => d.metodo.toLowerCase() === 'yape');
        }
        if (f === 'plin') {
          return v.metodo.toLowerCase() === 'plin' || v.desglose?.some(d => d.metodo.toLowerCase() === 'plin');
        }
        return v.metodo.toLowerCase().includes(f) || v.desglose?.some(d => d.metodo.toLowerCase().includes(f));
      });
    }

    // Filtro por estado
    if (this.filtroEstado !== 'TODOS') {
      list = list.filter(v => v.estado === this.filtroEstado);
    }

    // Filtro por Sede
    if (this.filtroSede !== 'TODAS') {
      list = list.filter(v => (v.sede || 'Sede Cajamarca Central') === this.filtroSede || v.sede?.toLowerCase() === this.filtroSede.toLowerCase());
    }

    // Buscador
    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase();
      list = list.filter(v =>
        v.id.toLowerCase().includes(q) ||
        v.cliente.toLowerCase().includes(q) ||
        v.dni.includes(q) ||
        (v.sede && v.sede.toLowerCase().includes(q))
      );
    }

    this.ventasFiltradas = list;
    this.paginaActual = 1;
  }

  seleccionarHoy() {
    this.modoFecha = 'CALENDARIO';
    this.fechaSeleccionada = new Date().toISOString().split('T')[0];
    this.aplicarFiltros();
  }

  seleccionarAyer() {
    this.modoFecha = 'CALENDARIO';
    const d = new Date();
    d.setDate(d.getDate() - 1);
    this.fechaSeleccionada = d.toISOString().split('T')[0];
    this.aplicarFiltros();
  }

  seleccionarTodoHistorico() {
    this.modoFecha = 'TODOS';
    this.aplicarFiltros();
  }

  // KPIs dinámicos
  get totalVentasHoy(): number {
    return this.ventasFiltradas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => sum + v.total, 0);
  }

  get totalEfectivo(): number {
    return this.ventasFiltradas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const ef = v.desglose?.find(d => d.metodo.toLowerCase() === 'efectivo');
        return sum + (ef ? ef.monto : (v.metodo.toLowerCase() === 'efectivo' ? v.total : 0));
      }, 0);
  }

  get totalYape(): number {
    return this.ventasFiltradas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const yp = v.desglose?.find(d => d.metodo.toLowerCase() === 'yape' || (d.metodo.includes('Yape') && !d.metodo.includes('Plin')));
        if (yp) return sum + yp.monto;
        if (v.metodo.toLowerCase() === 'yape' || v.metodo === 'Yape / Plin') return sum + v.total;
        return sum;
      }, 0);
  }

  get totalPlin(): number {
    return this.ventasFiltradas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const pl = v.desglose?.find(d => d.metodo.toLowerCase() === 'plin' || (d.metodo.includes('Plin') && !d.metodo.includes('Yape')));
        if (pl) return sum + pl.monto;
        if (v.metodo.toLowerCase() === 'plin') return sum + v.total;
        return sum;
      }, 0);
  }

  get totalTarjeta(): number {
    return this.ventasFiltradas
      .filter(v => v.estado === 'EMITIDO')
      .reduce((sum, v) => {
        const tj = v.desglose?.find(d => d.metodo.toLowerCase().includes('tarjeta'));
        return sum + (tj ? tj.monto : (v.metodo.toLowerCase().includes('tarjeta') ? v.total : 0));
      }, 0);
  }

  get totalTicketsEmitidos(): number {
    return this.ventasFiltradas.filter(v => v.estado === 'EMITIDO').length;
  }

  get totalTicketsAnulados(): number {
    return this.ventasFiltradas.filter(v => v.estado === 'ANULADO').length;
  }

  get ticketPromedio(): number {
    const emitidos = this.totalTicketsEmitidos;
    return emitidos > 0 ? Number((this.totalVentasHoy / emitidos).toFixed(2)) : 0;
  }

  get ventasPaginadas(): TicketVentaDTO[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.ventasFiltradas.slice(inicio, inicio + this.itemsPorPagina);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.ventasFiltradas.length / this.itemsPorPagina));
  }

  cambiarPagina(p: number) {
    if (p >= 1 && p <= this.totalPaginas) {
      this.paginaActual = p;
    }
  }

  limpiarFiltros() {
    this.busqueda = '';
    this.filtroMetodo = 'TODOS';
    this.filtroEstado = 'TODOS';
    this.filtroSede = 'TODAS';
    this.modoFecha = 'CALENDARIO';
    this.fechaSeleccionada = new Date().toISOString().split('T')[0];
    this.aplicarFiltros();
  }

  verDetalle(ticket: TicketVentaDTO) {
    this.ticketSeleccionado = ticket;
    this.showDetalleModal = true;
  }

  // --- CORRECCIÓN DE MÉTODO DE PAGO (SOLUCIÓN AL ERROR DEL CAJERO) ---
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
          texto: `✅ Comprobante ${ticketId} actualizado exitosamente: método corregido de "${anterior}" a "${this.nuevoMetodoPago}".`
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
}
