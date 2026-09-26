import { Component, OnInit, inject, effect, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import {
  DashboardService,
  DashboardResumen,
  ProductoRentableDTO,
  ProductoVendidoDTO,
  MedioPagoDTO,
  CategoriaVentaDTO
} from '../../core/services/dashboard.service';

export interface KpiFarmaceutico {
  label: string;
  valor: string;
  cambio: string;
  positivo: boolean;
  icono: string;
  color: string;
  detalle: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  public authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    // Sincronizar automáticamente cuando el usuario cambia de sede en la cabecera
    effect(() => {
      const sede = this.authService.activeSede();
      if (sede) {
        this.sedeFiltroId = sede.id;
        this.cargarMetricas();
      }
    });
  }

  // Estado de carga
  cargando = false;

  // Filtros de Sede
  sedeFiltroId = this.authService.activeSede()?.id || 'TODAS';

  get sedesDisponibles() {
    return this.authService.getSedes();
  }

  // Filtro de Fechas
  filtroFechaModo: 'HOY' | 'AYER' | 'SEMANA' | 'MES' | 'PERSONALIZADO' | 'TODOS' = 'HOY';
  fechaSeleccionada: string = new Date().toISOString().split('T')[0];
  fechaInicio: string = new Date().toISOString().split('T')[0];
  fechaFin: string = new Date().toISOString().split('T')[0];

  // Filtros de búsqueda en la tabla de productos vendidos
  busquedaProductoVendido = '';
  filtroCategoriaVendido = 'TODAS';

  // Datos consolidados del Dashboard
  resumen: DashboardResumen = {
    totalVentas: 0,
    totalEfectivo: 0,
    totalYape: 0,
    totalPlin: 0,
    totalTarjeta: 0,
    totalOtros: 0,
    totalGananciaNeta: 0,
    margenNetoGlobal: 0,
    ticketsEmitidos: 0,
    ticketPromedio: 0,
    unidadesVendidasTotal: 0,
    mediosPago: [],
    topRentables: [],
    productosVendidos: [],
    ventasPorCategoria: []
  };

  ngOnInit() {
    this.setModoFecha('HOY');
  }

  setModoFecha(modo: 'HOY' | 'AYER' | 'SEMANA' | 'MES' | 'PERSONALIZADO' | 'TODOS') {
    this.filtroFechaModo = modo;
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    if (modo === 'HOY') {
      this.fechaInicio = hoyStr;
      this.fechaFin = hoyStr;
      this.fechaSeleccionada = hoyStr;
    } else if (modo === 'AYER') {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const ayerStr = ayer.toISOString().split('T')[0];
      this.fechaInicio = ayerStr;
      this.fechaFin = ayerStr;
      this.fechaSeleccionada = ayerStr;
    } else if (modo === 'SEMANA') {
      const hace7Dias = new Date();
      hace7Dias.setDate(hace7Dias.getDate() - 6);
      this.fechaInicio = hace7Dias.toISOString().split('T')[0];
      this.fechaFin = hoyStr;
    } else if (modo === 'MES') {
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      this.fechaInicio = inicioMes.toISOString().split('T')[0];
      this.fechaFin = hoyStr;
    } else if (modo === 'TODOS') {
      this.fechaInicio = 'TODOS';
      this.fechaFin = 'TODOS';
    }

    this.cargarMetricas();
  }

  onFechaChange() {
    if (this.fechaSeleccionada) {
      this.filtroFechaModo = 'PERSONALIZADO';
      this.fechaInicio = this.fechaSeleccionada;
      this.fechaFin = this.fechaSeleccionada;
      this.cargarMetricas();
    }
  }

  onSedeChange(sedeId: string) {
    this.sedeFiltroId = sedeId;
    this.cargarMetricas();
  }

  cargarMetricas() {
    this.cargando = true;
    const targetSede = this.sedeFiltroId === 'TODAS' ? undefined : this.sedeFiltroId;

    this.dashboardService.getDashboardCompleto(this.fechaInicio, this.fechaFin, targetSede).subscribe({
      next: (data) => {
        this.resumen = data;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al cargar métricas del dashboard:', err);
        this.cargando = false;
        this.cdr.markForCheck();
      }
    });
  }

  // Filtrado reactivo de productos vendidos en el día/periodo
  get productosVendidosFiltrados(): ProductoVendidoDTO[] {
    let list = this.resumen.productosVendidos || [];

    if (this.filtroCategoriaVendido !== 'TODAS') {
      list = list.filter(p => p.categoria === this.filtroCategoriaVendido);
    }

    if (this.busquedaProductoVendido.trim()) {
      const q = this.busquedaProductoVendido.toLowerCase().trim();
      list = list.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.generico && p.generico.toLowerCase().includes(q)) ||
        (p.laboratorio && p.laboratorio.toLowerCase().includes(q)) ||
        (p.categoria && p.categoria.toLowerCase().includes(q))
      );
    }

    return list;
  }

  get categoriasDisponibles(): string[] {
    const set = new Set<string>();
    (this.resumen.productosVendidos || []).forEach(p => {
      if (p.categoria) set.add(p.categoria);
    });
    return Array.from(set).sort();
  }

  get totalesProductosFiltrados() {
    const list = this.productosVendidosFiltrados;
    const unidades = list.reduce((sum, p) => sum + p.cantidadTotal, 0);
    const ingreso = list.reduce((sum, p) => sum + p.ingresoTotal, 0);
    const ganancia = list.reduce((sum, p) => sum + p.gananciaNeta, 0);
    const margen = ingreso > 0 ? (ganancia / ingreso) * 100 : 0;

    return {
      unidades,
      ingreso: Number(ingreso.toFixed(2)),
      ganancia: Number(ganancia.toFixed(2)),
      margen: Number(margen.toFixed(1))
    };
  }

  get labelPeriodoActivo(): string {
    if (this.filtroFechaModo === 'HOY') return `Hoy (${this.fechaInicio})`;
    if (this.filtroFechaModo === 'AYER') return `Ayer (${this.fechaInicio})`;
    if (this.filtroFechaModo === 'SEMANA') return `Últimos 7 días (${this.fechaInicio} al ${this.fechaFin})`;
    if (this.filtroFechaModo === 'MES') return `Este Mes (${this.fechaInicio} al ${this.fechaFin})`;
    if (this.filtroFechaModo === 'TODOS') return 'Histórico Consolidado (Todas las fechas)';
    return `Fecha: ${this.fechaSeleccionada}`;
  }
}
