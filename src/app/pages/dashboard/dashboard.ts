import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

export interface KpiFarmaceutico {
  label: string;
  valor: string;
  cambio: string;
  positivo: boolean;
  icono: string;
  color: string;
  detalle: string;
}

export interface ProductoRentable {
  nombre: string;
  principioActivo: string;
  laboratorio: string;
  unidadesVendidas: number;
  ingresoTotal: number;
  costoTotal: number;
  gananciaNeta: number;
  margenPorcentaje: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  public authService = inject(AuthService);

  kpis: KpiFarmaceutico[] = [
    {
      label: 'Ticket Promedio',
      valor: 'S/ 24.80',
      cambio: '+8.4% vs mes anterior',
      positivo: true,
      icono: 'pi pi-shopping-bag',
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50',
      detalle: '142 clientes atendidos hoy'
    },
    {
      label: 'Ventas Totales (Hoy)',
      valor: 'S/ 3,521.60',
      cambio: '+12.5% vs ayer',
      positivo: true,
      icono: 'pi pi-chart-line',
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50',
      detalle: 'Utilidad Neta: S/ 1,214.00'
    },
    {
      label: 'Índice de Merma (Vencimiento)',
      valor: '0.85%',
      cambio: '-0.3% (Meta: <2%)',
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
      detalle: 'Disponibilidad de catálogo: 96%'
    }
  ];

  topRentables: ProductoRentable[] = [
    {
      nombre: 'Paracetamol 500mg (Genérico)',
      principioActivo: 'Paracetamol',
      laboratorio: 'Genfar',
      unidadesVendidas: 420,
      ingresoTotal: 210.00,
      costoTotal: 105.00,
      gananciaNeta: 105.00,
      margenPorcentaje: 50.0
    },
    {
      nombre: 'Panadol Antigripal NF',
      principioActivo: 'Paracetamol + Clorfenamina',
      laboratorio: 'GSK',
      unidadesVendidas: 180,
      ingresoTotal: 225.00,
      costoTotal: 135.00,
      gananciaNeta: 90.00,
      margenPorcentaje: 40.0
    },
    {
      nombre: 'Amoxicilina + Clavulánico 500/125mg',
      principioActivo: 'Amoxicilina + Clavulánico',
      laboratorio: 'Portugal',
      unidadesVendidas: 45,
      ingresoTotal: 315.00,
      costoTotal: 198.00,
      gananciaNeta: 117.00,
      margenPorcentaje: 37.1
    },
    {
      nombre: 'Vitamina C 1g Efervescente',
      principioActivo: 'Ácido Ascórbico',
      laboratorio: 'Bayer Redoxon',
      unidadesVendidas: 38,
      ingresoTotal: 68.40,
      costoTotal: 42.00,
      gananciaNeta: 26.40,
      margenPorcentaje: 38.6
    }
  ];

  mediosPagoDistribucion = [
    { metodo: 'Yape / Plin', porcentaje: 48, monto: 1690.30, color: 'bg-purple-500' },
    { metodo: 'Efectivo Contado', porcentaje: 32, monto: 1126.90, color: 'bg-emerald-500' },
    { metodo: 'Tarjetas (POS)', porcentaje: 20, monto: 704.40, color: 'bg-blue-500' }
  ];

  ventasPorCategoria = [
    { cat: 'Analgésicos y Antiinflamatorios', porcentaje: 35, valor: 'S/ 1,232.50' },
    { cat: 'Antibióticos y Antivirales', porcentaje: 25, valor: 'S/ 880.40' },
    { cat: 'Venta Libre (OTC) y Gripe', porcentaje: 22, valor: 'S/ 774.70' },
    { cat: 'Cuidado Personal & Higiene', porcentaje: 18, valor: 'S/ 634.00' }
  ];

  ngOnInit() {}
}
