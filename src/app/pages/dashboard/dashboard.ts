import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService, ProductoRentableDTO, MedioPagoDTO, CategoriaVentaDTO } from '../../core/services/dashboard.service';

export interface KpiFarmaceutico {
  label: string;
  valor: string;
  cambio: string;
  positivo: boolean;
  icono: string;
  color: string;
  detalle: string;
}

export type ProductoRentable = ProductoRentableDTO;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  public authService = inject(AuthService);
  private dashboardService = inject(DashboardService);

  kpis: KpiFarmaceutico[] = [
    {
      label: 'Ticket Promedio',
      valor: 'S/ 0.00',
      cambio: 'En tiempo real',
      positivo: true,
      icono: 'pi pi-shopping-bag',
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50',
      detalle: '0 clientes atendidos hoy'
    },
    {
      label: 'Ventas Totales (Hoy)',
      valor: 'S/ 0.00',
      cambio: 'Sede en vivo',
      positivo: true,
      icono: 'pi pi-chart-line',
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50',
      detalle: 'Ventas validadas en Supabase'
    },
    {
      label: 'Índice de Merma (Vencimiento)',
      valor: '0.0%',
      cambio: 'Meta: <2%',
      positivo: true,
      icono: 'pi pi-shield',
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50',
      detalle: 'Control FEFO estricto activo'
    },
    {
      label: 'Rotación de Inventario',
      valor: '21 días',
      cambio: 'Alta rotación de stock',
      positivo: true,
      icono: 'pi pi-sync',
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50',
      detalle: 'Catálogo sincronizado'
    }
  ];

  topRentables: ProductoRentableDTO[] = [];
  mediosPagoDistribucion: MedioPagoDTO[] = [];
  ventasPorCategoria: CategoriaVentaDTO[] = [];

  ngOnInit() {
    this.cargarMetricas();
  }

  cargarMetricas() {
    const sedeId = this.authService.activeSede()?.id;

    // 1. KPIs
    this.dashboardService.getKpis(sedeId).subscribe(data => {
      if (data) {
        this.kpis[0].valor = `S/ ${data.ticketPromedio.toFixed(2)}`;
        this.kpis[0].detalle = `${data.ticketsEmitidos} ticket${data.ticketsEmitidos === 1 ? '' : 's'} emitido${data.ticketsEmitidos === 1 ? '' : 's'} hoy`;
        this.kpis[1].valor = `S/ ${data.ventasHoy.toFixed(2)}`;
        this.kpis[1].detalle = `Total ventas del día en ${this.authService.activeSede()?.nombre || 'Sede Central'}`;
        this.kpis[2].valor = `${data.mermaPorcentaje}%`;
      }
    });

    // 2. Top Rentables
    this.dashboardService.getTopRentables(sedeId).subscribe(data => {
      this.topRentables = data;
    });

    // 3. Medios de pago
    this.dashboardService.getMediosPago(sedeId).subscribe(data => {
      this.mediosPagoDistribucion = data;
    });

    // 4. Ventas por categoría
    this.dashboardService.getVentasPorCategoria(sedeId).subscribe(data => {
      this.ventasPorCategoria = data;
    });
  }
}
