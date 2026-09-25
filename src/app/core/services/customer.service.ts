import { Injectable } from '@angular/core';

export interface CustomerPuntos {
  id: string; // DNI, RUC o identificador
  nombre: string;
  email?: string;
  celular?: string;
  direccion?: string;
  fechaNacimiento?: string; // Formato YYYY-MM-DD (No obligatorio)
  puntosAcumulados: number;
  sedeId?: string;
  sedeNombre?: string;
  sedesCompradas?: string[]; // Lista de sedes donde ha realizado compras
  ultimaSede?: string;
  ultimaFechaCompra?: string;
  comprasTotales?: number;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private customers: CustomerPuntos[] = [];

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('medicare_customers_puntos');
      if (saved) {
        try {
          this.customers = JSON.parse(saved);
        } catch (e) {
          this.customers = [];
        }
      }
    }
  }

  getCustomer(id: string): CustomerPuntos | undefined {
    return this.customers.find(c => c.id === id);
  }

  getAllCustomers(): CustomerPuntos[] {
    return this.customers;
  }

  addOrUpdateCustomer(c: CustomerPuntos) {
    const idx = this.customers.findIndex(x => x.id === c.id);
    if (idx > -1) {
      const prev = this.customers[idx];
      const sedesSet = new Set<string>(prev.sedesCompradas || []);
      if (prev.sedeNombre) sedesSet.add(prev.sedeNombre);
      if (prev.ultimaSede) sedesSet.add(prev.ultimaSede);
      if (c.sedeNombre) sedesSet.add(c.sedeNombre);
      if (c.ultimaSede) sedesSet.add(c.ultimaSede);
      if (c.sedesCompradas) c.sedesCompradas.forEach(s => sedesSet.add(s));

      this.customers[idx] = {
        ...prev,
        ...c,
        sedesCompradas: Array.from(sedesSet),
        ultimaSede: c.ultimaSede || c.sedeNombre || prev.ultimaSede || prev.sedeNombre,
        sedeNombre: c.sedeNombre || prev.sedeNombre,
        sedeId: c.sedeId || prev.sedeId
      };
    } else {
      const sedesSet = new Set<string>(c.sedesCompradas || []);
      if (c.sedeNombre) sedesSet.add(c.sedeNombre);
      if (c.ultimaSede) sedesSet.add(c.ultimaSede);
      this.customers.push({
        ...c,
        sedesCompradas: Array.from(sedesSet),
        ultimaSede: c.ultimaSede || c.sedeNombre
      });
    }
    this.save();
  }

  registrarCompraCliente(id: string, sedeNombre: string, montoGasto: number, sedeId?: string) {
    const c = this.getCustomer(id);
    if (c) {
      const puntosGanados = Math.floor(montoGasto / 10);
      c.puntosAcumulados += (puntosGanados > 0 ? puntosGanados : 0);
      c.comprasTotales = (c.comprasTotales || 0) + 1;
      c.ultimaSede = sedeNombre;
      c.ultimaFechaCompra = new Date().toISOString();
      if (sedeId) c.sedeId = sedeId;
      const sedesSet = new Set<string>(c.sedesCompradas || []);
      sedesSet.add(sedeNombre);
      c.sedesCompradas = Array.from(sedesSet);
      this.save();
    }
  }

  addPuntos(id: string, montoGasto: number) {
    // 1 punto por cada 10 soles
    const puntosGanados = Math.floor(montoGasto / 10);
    if (puntosGanados > 0) {
      const c = this.getCustomer(id);
      if (c) {
        c.puntosAcumulados += puntosGanados;
        this.save();
      }
    }
  }

  private save() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('medicare_customers_puntos', JSON.stringify(this.customers));
    }
  }
}
