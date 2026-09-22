import { Injectable } from '@angular/core';

export interface CustomerPuntos {
  id: string; // DNI, RUC o identificador
  nombre: string;
  email?: string;
  celular?: string;
  direccion?: string;
  fechaNacimiento?: string; // Formato YYYY-MM-DD (No obligatorio)
  puntosAcumulados: number;
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
      this.customers[idx] = { ...this.customers[idx], ...c };
    } else {
      this.customers.push(c);
    }
    this.save();
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
