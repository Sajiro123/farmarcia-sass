import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

export interface LoteItem {
  id: number;
  lote: string;
  producto: string;
  principioActivo: string;
  laboratorio: string;
  stock: number;
  vencimiento: string;
  dias: number;
  pasillo: string;
  estante: string;
  nivel: string;
  gaveta: string;
  registroSanitario: string;
  temperatura: string; // T° Ambiente / Refrigerado
}

export interface ActaBaja {
  id: string;
  fecha: Date;
  responsable: string;
  cmpQuimico: string;
  motivo: string;
  observaciones: string;
  loteId: number;
  producto: string;
  lote: string;
  cantidadBaja: number;
  costoTotalPerdida: number;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.html'
})
export class Inventory implements OnInit {
  public authService = inject(AuthService);

  filtroEstado = 'TODOS';
  busqueda = '';

  lotesFefo: LoteItem[] = [
    { id: 1, lote: 'LT-VENC-01', producto: 'Amoxicilina 500mg', principioActivo: 'Amoxicilina', laboratorio: 'Portugal', stock: 80, vencimiento: '2024-05-10', dias: -104, pasillo: 'P1', estante: 'E3', nivel: 'N2', gaveta: 'G1', registroSanitario: 'EE-04829', temperatura: 'Ambiente' },
    { id: 2, lote: 'LT-CRIT-99', producto: 'Ibuprofeno 400mg', principioActivo: 'Ibuprofeno', laboratorio: 'Genfar', stock: 15, vencimiento: '2024-09-20', dias: 28, pasillo: 'P1', estante: 'E2', nivel: 'N2', gaveta: 'G4', registroSanitario: 'EE-01928', temperatura: 'Ambiente' },
    { id: 3, lote: 'LT-ALERT-42', producto: 'Amoxicilina + Clavulánico', principioActivo: 'Amoxicilina + Clavulánico', laboratorio: 'Teva', stock: 60, vencimiento: '2025-10-15', dias: 53, pasillo: 'P1', estante: 'E3', nivel: 'N1', gaveta: 'G2', registroSanitario: 'EE-05819', temperatura: 'Ambiente' },
    { id: 4, lote: 'LT-202301', producto: 'Paracetamol 500mg', principioActivo: 'Paracetamol', laboratorio: 'Genfar', stock: 450, vencimiento: '2027-12-01', dias: 830, pasillo: 'P1', estante: 'E2', nivel: 'N1', gaveta: 'G1', registroSanitario: 'EE-09182', temperatura: 'Ambiente' },
    { id: 5, lote: 'LT-B234', producto: 'Aspirina 100mg', principioActivo: 'Ácido Acetilsalicílico', laboratorio: 'Bayer', stock: 200, vencimiento: '2028-01-15', dias: 875, pasillo: 'P2', estante: 'E1', nivel: 'N3', gaveta: 'G2', registroSanitario: 'EE-03912', temperatura: 'Ambiente' },
    { id: 6, lote: 'LT-INSUL-08', producto: 'Insulina NPH 100UI/ml', principioActivo: 'Insulina Humana', laboratorio: 'Lilly', stock: 24, vencimiento: '2026-03-30', dias: 219, pasillo: 'REFRI-01', estante: 'E1', nivel: 'N1', gaveta: 'G1', registroSanitario: 'EE-07182', temperatura: '2°C a 8°C (Cadena Frío)' }
  ];

  // Modal de Acta de Bajas
  showBajaModal = false;
  loteSeleccionadoParaBaja: LoteItem | null = null;
  cantidadBaja = 1;
  motivoBaja = 'Caducidad / Medicamento Vencido';
  motivosDisponibles = [
    'Caducidad / Medicamento Vencido (DIGEMID)',
    'Rotura o Deterioro de Empaque / Frasco',
    'Pérdida de Cadena de Frío',
    'Falla de Calidad / Retiro de Mercado',
    'Merma / Diferencia de Inventario Físico'
  ];
  quimicoResponsable = 'Dra. Elena Ramos';
  cmpQuimico = 'CQFP 14820';
  observacionesBaja = '';

  // Historial de Actas
  actasRegistradas: ActaBaja[] = [
    {
      id: 'ACTA-BAJA-2026-0038',
      fecha: new Date(Date.now() - 86400000 * 5),
      responsable: 'Dra. Elena Ramos',
      cmpQuimico: 'CQFP 14820',
      motivo: 'Caducidad / Medicamento Vencido (DIGEMID)',
      observaciones: 'Retiro del anaquel por fecha de vencimiento cumplida.',
      loteId: 1,
      producto: 'Amoxicilina 500mg',
      lote: 'LT-VENC-01',
      cantidadBaja: 20,
      costoTotalPerdida: 14.00
    }
  ];

  showActaImprimirModal = false;
  actaParaImprimir: ActaBaja | null = null;

  ngOnInit() {
    // Ordenar automáticamente por algoritmo FEFO estricto
    this.ordenarPorFEFO();
  }

  ordenarPorFEFO() {
    this.lotesFefo.sort((a, b) => new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime());
  }

  get lotesFiltrados(): LoteItem[] {
    return this.lotesFefo.filter(item => {
      // Filtro de estado
      const matchEstado = this.filtroEstado === 'TODOS' ||
        (this.filtroEstado === 'VENCIDO' && item.dias < 0) ||
        (this.filtroEstado === 'CRITICO' && item.dias >= 0 && item.dias <= 30) ||
        (this.filtroEstado === 'ALERTA' && item.dias > 30 && item.dias <= 90) ||
        (this.filtroEstado === 'OPTIMO' && item.dias > 90);

      // Filtro de texto
      const q = this.busqueda.toLowerCase().trim();
      const matchTexto = !q || 
        item.producto.toLowerCase().includes(q) ||
        item.lote.toLowerCase().includes(q) ||
        item.principioActivo.toLowerCase().includes(q) ||
        item.laboratorio.toLowerCase().includes(q);

      return matchEstado && matchTexto;
    });
  }

  getBadgeStatus(dias: number) {
    if (dias < 0) return { class: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800', icon: 'pi pi-ban', text: 'VENCIDO (BLOQUEADO)' };
    if (dias <= 30) return { class: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800', icon: 'pi pi-exclamation-triangle', text: 'CRÍTICO (<30 DÍAS)' };
    if (dias <= 90) return { class: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800', icon: 'pi pi-bell', text: 'ALERTA (≤90 DÍAS)' };
    return { class: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800', icon: 'pi pi-shield', text: 'ÓPTIMO (>90 DÍAS)' };
  }

  // --- ACTA DE BAJAS ---
  openBajaModal(item: LoteItem) {
    this.loteSeleccionadoParaBaja = item;
    this.cantidadBaja = item.stock > 0 ? (item.dias < 0 ? item.stock : 1) : 0;
    this.observacionesBaja = '';
    this.showBajaModal = true;
  }

  confirmarActaBaja() {
    if (!this.loteSeleccionadoParaBaja || this.cantidadBaja <= 0 || this.cantidadBaja > this.loteSeleccionadoParaBaja.stock) {
      alert('Ingresa una cantidad válida a dar de baja.');
      return;
    }

    // 1. Descontar de stock
    this.loteSeleccionadoParaBaja.stock -= this.cantidadBaja;

    // 2. Crear Acta Oficial de Baja
    const nuevaActa: ActaBaja = {
      id: 'ACTA-BAJA-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      fecha: new Date(),
      responsable: this.quimicoResponsable,
      cmpQuimico: this.cmpQuimico,
      motivo: this.motivoBaja,
      observaciones: this.observacionesBaja,
      loteId: this.loteSeleccionadoParaBaja.id,
      producto: this.loteSeleccionadoParaBaja.producto,
      lote: this.loteSeleccionadoParaBaja.lote,
      cantidadBaja: this.cantidadBaja,
      costoTotalPerdida: this.cantidadBaja * 0.50
    };

    this.actasRegistradas.unshift(nuevaActa);
    this.showBajaModal = false;
    this.actaParaImprimir = nuevaActa;
    this.showActaImprimirModal = true;
  }

  imprimirActa() {
    window.print();
  }
}
