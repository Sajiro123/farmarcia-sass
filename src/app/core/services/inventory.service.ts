import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, of } from 'rxjs';

export interface LoteItem {
  id: string | number;
  productoId: string; // Vínculo al catálogo maestro
  tipoProducto?: 'MEDICAMENTO' | 'PERFUME';
  lote: string;
  producto: string; // Nombre del producto (desnormalizado para visualización rápida)
  principioActivo: string;
  laboratorio: string;
  stock: number;
  vencimiento: string; // ISO date string YYYY-MM-DD o 'No expira'
  dias: number; // Días para vencer (negativo = vencido, 99999 = no expira)
  pasillo?: string;
  estante?: string;
  nivel?: string;
  gaveta?: string;
  registroSanitario?: string;
  temperatura?: string;
  costoUnitario?: number;
  fechaIngreso?: string;

  // Específicos para Perfumes y Fragancias
  concentracionFragancia?: string; // EDP, EDT, EDC, Parfum, Body Mist
  volumenMl?: number; // 30, 50, 100, etc.
  batchCode?: string; // Código de lote de fábrica para autenticidad
  destinoUnidad?: 'VENTA' | 'TESTER'; // Venta sellada vs Probador
  genero?: string; // Hombre, Mujer, Unisex, Infantil
  familiaOlfativa?: string; // Floral, Amaderada, Cítrica, etc.
}

export interface ActaBaja {
  id: string;
  fecha: Date;
  responsable: string;
  cmpQuimico?: string;
  motivo: string;
  observaciones?: string;
  loteId: string | number;
  productoId?: string; // Vínculo al catálogo
  producto: string;
  lote: string;
  cantidadBaja: number;
  costoTotalPerdida: number;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private supabase = inject(SupabaseService);

  private readonly STORAGE_KEY_LOTES = 'medicare_inventario_lotes_v1';
  private readonly STORAGE_KEY_ACTAS = 'medicare_inventario_actas_v1';

  private lotesInventario: LoteItem[] = this.cargarLotesStorage();
  private actasBaja: ActaBaja[] = this.cargarActasStorage();

  // ==========================================
  // PERSISTENCIA EN LOCALSTORAGE
  // ==========================================

  private getLotesSemilla(): LoteItem[] {
    return [
      { id: 'lote-001', productoId: 'cat-001', lote: 'LT-PAR-251', producto: 'Paracetamol 500mg', principioActivo: 'Paracetamol', laboratorio: 'Genérico', stock: 458, vencimiento: '2025-12-31', dias: 90, pasillo: 'P1', estante: 'E1', nivel: 'N1', registroSanitario: 'EE-04821', costoUnitario: 0.15 },
      { id: 'lote-002', productoId: 'cat-002', lote: 'LT-AMX-252', producto: 'Amoxicilina + Ac. Clavulánico 500/125mg', principioActivo: 'Amoxicilina + Clavulánico', laboratorio: 'Portugal', stock: 68, vencimiento: '2025-08-31', dias: 60, pasillo: 'P1', estante: 'E2', nivel: 'N2', registroSanitario: 'EE-09123', costoUnitario: 0.40 },
      { id: 'lote-003', productoId: 'cat-003', lote: 'LT-CLZ-261', producto: 'Clonazepam 2mg (Controlado)', principioActivo: 'Clonazepam', laboratorio: 'Sandoz', stock: 96, vencimiento: '2026-04-30', dias: 220, pasillo: 'P3', estante: 'E1', nivel: 'N1', registroSanitario: 'EE-01145', costoUnitario: 0.80 },
      { id: 'lote-004', productoId: 'cat-004', lote: 'LT-PAN-254', producto: 'Panadol Antigripal NF', principioActivo: 'Paracetamol + Clorfenamina + Fenilefrina', laboratorio: 'GSK GlaxoSmithKline', stock: 218, vencimiento: '2025-11-30', dias: 85, pasillo: 'P1', estante: 'E1', nivel: 'N2', registroSanitario: 'EN-02391', costoUnitario: 0.45 },
      { id: 'lote-005', productoId: 'cat-005', lote: 'LT-IBU-249', producto: 'Ibuprofeno 400mg', principioActivo: 'Ibuprofeno', laboratorio: 'Genérico', stock: 9, vencimiento: '2024-11-30', dias: 30, pasillo: 'P1', estante: 'E3', nivel: 'N1', registroSanitario: 'EE-07812', costoUnitario: 0.20 },
      { id: 'lote-006', productoId: 'cat-006', lote: 'LT-VIT-262', producto: 'Vitamina C 1g Efervescente', principioActivo: 'Ácido Ascórbico', laboratorio: 'Bayer Redoxon', stock: 34, vencimiento: '2026-05-31', dias: 250, pasillo: 'P2', estante: 'E1', nivel: 'N3', registroSanitario: 'EN-08819', costoUnitario: 0.90 },
      { id: 'lote-007', productoId: 'cat-007', lote: 'LT-GEN-253', producto: 'Amoxicilina Genfar 500mg', principioActivo: 'Amoxicilina', laboratorio: 'Genfar', stock: 125, vencimiento: '2025-09-30', dias: 75, pasillo: 'P1', estante: 'E2', nivel: 'N1', registroSanitario: 'EE-03419', costoUnitario: 0.60 },
      { id: 'lote-008', productoId: 'cat-008', lote: 'LT-DOL-263', producto: 'Doloral 400mg', principioActivo: 'Ibuprofeno', laboratorio: 'Laboratorios Bagó', stock: 52, vencimiento: '2026-06-30', dias: 280, pasillo: 'P1', estante: 'E3', nivel: 'N2', registroSanitario: 'EN-06512', costoUnitario: 0.35 },
      { id: 'lote-009', productoId: 'cat-009', tipoProducto: 'PERFUME', lote: 'BATCH-8921', producto: 'Sauvage Dior Eau de Parfum', principioActivo: 'Christian Dior', laboratorio: 'Christian Dior', stock: 16, vencimiento: 'No expira', dias: 99999, concentracionFragancia: 'Eau de Parfum (EDP)', volumenMl: 100, batchCode: '38U400', destinoUnidad: 'VENTA', genero: 'Hombre', familiaOlfativa: 'Amaderada', costoUnitario: 310.00 },
      { id: 'lote-010', productoId: 'cat-010', tipoProducto: 'PERFUME', lote: 'BATCH-5120', producto: 'Good Girl Carolina Herrera EDP', principioActivo: 'Carolina Herrera', laboratorio: 'Carolina Herrera', stock: 4, vencimiento: 'No expira', dias: 99999, concentracionFragancia: 'Eau de Parfum (EDP)', volumenMl: 80, batchCode: '2103A', destinoUnidad: 'TESTER', genero: 'Mujer', familiaOlfativa: 'Oriental / Ámbar', costoUnitario: 260.00 }
    ];
  }

  private cargarLotesStorage(): LoteItem[] {
    try {
      const guardado = localStorage.getItem(this.STORAGE_KEY_LOTES);
      if (guardado) {
        const parsed = JSON.parse(guardado);
        if (parsed && parsed.length > 0) return parsed;
      }
      const iniciales = this.getLotesSemilla();
      localStorage.setItem(this.STORAGE_KEY_LOTES, JSON.stringify(iniciales));
      return iniciales;
    } catch {
      return this.getLotesSemilla();
    }
  }

  private persistirLotes(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_LOTES, JSON.stringify(this.lotesInventario));
    } catch (e) {
      console.error('Error persistiendo lotes en storage:', e);
    }
  }

  private cargarActasStorage(): ActaBaja[] {
    try {
      const guardado = localStorage.getItem(this.STORAGE_KEY_ACTAS);
      return guardado ? JSON.parse(guardado) : [];
    } catch {
      return [];
    }
  }

  private persistirActas(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_ACTAS, JSON.stringify(this.actasBaja));
    } catch (e) {
      console.error('Error persistiendo actas en storage:', e);
    }
  }

  // ==========================================
  // GESTIÓN DE LOTES DE INVENTARIO
  // ==========================================

  /**
   * Listar todos los lotes ordenados por FEFO (First Expired, First Out)
   */
  listarLotesFefo(): Observable<LoteItem[]> {
    if (!this.lotesInventario || this.lotesInventario.length === 0) {
      this.lotesInventario = this.cargarLotesStorage();
    }
    // Recalcular días para vencer
    const now = new Date().getTime();
    this.lotesInventario.forEach(lote => {
      const vtoDate = new Date(lote.vencimiento).getTime();
      lote.dias = Math.round((vtoDate - now) / (1000 * 3600 * 24));
    });
    // Ordenar FEFO: primero los que vencen antes
    const sorted = [...this.lotesInventario].sort((a, b) =>
      new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime()
    );
    return of(sorted);
  }

  /**
   * Obtener lotes de un producto específico (para POS y vista detalle)
   */
  getLotesPorProducto(productoId: string): Observable<LoteItem[]> {
    if (!this.lotesInventario || this.lotesInventario.length === 0) {
      this.lotesInventario = this.cargarLotesStorage();
    }
    const now = new Date().getTime();
    const lotesProd = this.lotesInventario
      .filter(l => l.productoId === productoId && l.stock > 0)
      .map(l => {
        const vtoDate = new Date(l.vencimiento).getTime();
        return { ...l, dias: Math.round((vtoDate - now) / (1000 * 3600 * 24)) };
      })
      .sort((a, b) => new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime());
    return of(lotesProd);
  }

  /**
   * Obtener el stock total disponible de un producto (suma de todos sus lotes con stock > 0 y no vencidos)
   */
  getStockTotalPorProducto(productoId: string): number {
    if (!this.lotesInventario || this.lotesInventario.length === 0) {
      this.lotesInventario = this.cargarLotesStorage();
    }
    const now = new Date().getTime();
    return this.lotesInventario
      .filter(l => {
        if (l.productoId !== productoId || l.stock <= 0) return false;
        const vtoDate = new Date(l.vencimiento).getTime();
        const dias = Math.round((vtoDate - now) / (1000 * 3600 * 24));
        return dias >= 0; // Solo lotes no vencidos
      })
      .reduce((sum, l) => sum + l.stock, 0);
  }

  /**
   * Agregar un nuevo lote al inventario (Ingreso de mercadería)
   */
  agregarLote(lote: LoteItem): Observable<LoteItem> {
    if (!lote.id) {
      lote.id = 'lote-' + Date.now().toString().slice(-8);
    }
    if (!lote.fechaIngreso) {
      lote.fechaIngreso = new Date().toISOString().split('T')[0];
    }
    // Calcular días para vencer
    if (lote.tipoProducto === 'PERFUME' || !lote.vencimiento || lote.vencimiento === 'No expira') {
      lote.dias = 99999;
      lote.vencimiento = 'No expira';
    } else {
      const now = new Date().getTime();
      const vtoDate = new Date(lote.vencimiento).getTime();
      lote.dias = isNaN(vtoDate) ? 99999 : Math.round((vtoDate - now) / (1000 * 3600 * 24));
    }

    this.lotesInventario.push({ ...lote });
    this.persistirLotes();
    return of({ ...lote });
  }

  /**
   * Actualizar un lote existente en el inventario
   */
  actualizarLote(lote: LoteItem): Observable<LoteItem> {
    const idx = this.lotesInventario.findIndex(l => l.id === lote.id);
    if (idx >= 0) {
      if (lote.tipoProducto === 'PERFUME' || !lote.vencimiento || lote.vencimiento === 'No expira') {
        lote.dias = 99999;
        lote.vencimiento = 'No expira';
      } else {
        const now = new Date().getTime();
        const vtoDate = new Date(lote.vencimiento).getTime();
        lote.dias = isNaN(vtoDate) ? 99999 : Math.round((vtoDate - now) / (1000 * 3600 * 24));
      }
      this.lotesInventario[idx] = { ...lote };
      this.persistirLotes();
    }
    return of({ ...lote });
  }

  /**
   * Eliminar un lote del inventario
   */
  eliminarLote(id: string | number): Observable<boolean> {
    this.lotesInventario = this.lotesInventario.filter(l => l.id !== id);
    this.persistirLotes();
    return of(true);
  }

  /**
   * Descontar stock de un lote específico (al realizar una venta)
   */
  descontarStockLote(loteId: string | number, cantidad: number): Observable<boolean> {
    const idx = this.lotesInventario.findIndex(l => l.id === loteId);
    if (idx >= 0 && this.lotesInventario[idx].stock >= cantidad) {
      this.lotesInventario[idx].stock -= cantidad;
      this.persistirLotes();
      return of(true);
    }
    return of(false);
  }

  /**
   * Descontar stock FEFO: descuenta del lote más próximo a vencer primero
   */
  descontarStockFefo(productoId: string, cantidadUnidades: number): Observable<boolean> {
    const now = new Date().getTime();
    const lotesDisponibles = this.lotesInventario
      .filter(l => {
        if (l.productoId !== productoId || l.stock <= 0) return false;
        const vtoDate = new Date(l.vencimiento).getTime();
        return Math.round((vtoDate - now) / (1000 * 3600 * 24)) >= 0;
      })
      .sort((a, b) => new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime());

    let restante = cantidadUnidades;
    for (const lote of lotesDisponibles) {
      if (restante <= 0) break;
      const aTomar = Math.min(lote.stock, restante);
      const idx = this.lotesInventario.findIndex(l => l.id === lote.id);
      if (idx >= 0) {
        this.lotesInventario[idx].stock -= aTomar;
        restante -= aTomar;
      }
    }
    this.persistirLotes();
    return of(restante <= 0);
  }

  /**
   * Reingresar stock (al anular una venta)
   */
  reingresarStock(productoId: string, cantidadUnidades: number): Observable<boolean> {
    // Reingresar al lote más reciente del producto
    const loteProd = this.lotesInventario
      .filter(l => l.productoId === productoId)
      .sort((a, b) => new Date(b.vencimiento).getTime() - new Date(a.vencimiento).getTime());

    if (loteProd.length > 0) {
      const idx = this.lotesInventario.findIndex(l => l.id === loteProd[0].id);
      if (idx >= 0) {
        this.lotesInventario[idx].stock += cantidadUnidades;
        this.persistirLotes();
        return of(true);
      }
    }
    return of(false);
  }

  // ==========================================
  // ACTAS DE BAJA
  // ==========================================

  /**
   * Listar actas de baja registradas
   */
  listarActas(): Observable<ActaBaja[]> {
    if (!this.actasBaja || this.actasBaja.length === 0) {
      this.actasBaja = this.cargarActasStorage();
    }
    return of([...this.actasBaja]);
  }

  /**
   * Registrar Acta de Baja por Vencimiento / Merma
   */
  registrarBajaLote(acta: ActaBaja): Observable<boolean> {
    // Descontar del lote en inventario
    const idx = this.lotesInventario.findIndex(l => l.id == acta.loteId || l.lote == acta.lote);
    if (idx !== -1) {
      this.lotesInventario[idx].stock = Math.max(0, this.lotesInventario[idx].stock - acta.cantidadBaja);
      this.persistirLotes();
    }

    // Registrar acta
    this.actasBaja.unshift(acta);
    this.persistirActas();
    return of(true);
  }
}
