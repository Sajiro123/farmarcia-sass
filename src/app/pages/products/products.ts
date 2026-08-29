import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.html'
})
export class Products {
  searchQuery = '';
  
  productos = [
    { id: 1, digemid: 'EN-01234', nombreComercial: 'Panadol Forte', principioActivo: 'Paracetamol', concentracion: '1g', formaFarma: 'Tableta', laboratorio: 'GSK', receta: false },
    { id: 2, digemid: 'EN-45678', nombreComercial: 'Amoxil', principioActivo: 'Amoxicilina', concentracion: '500mg', formaFarma: 'Cápsula', laboratorio: 'GSK', receta: true },
    { id: 3, digemid: 'EN-89012', nombreComercial: 'Advil', principioActivo: 'Ibuprofeno', concentracion: '400mg', formaFarma: 'Tableta Recubierta', laboratorio: 'Pfizer', receta: false },
    { id: 4, digemid: 'EN-34567', nombreComercial: 'Clonazepam', principioActivo: 'Clonazepam', concentracion: '2mg', formaFarma: 'Tableta', laboratorio: 'Genfar', receta: true },
    { id: 5, digemid: 'EN-90123', nombreComercial: 'Aspirina', principioActivo: 'Ácido Acetilsalicílico', concentracion: '100mg', formaFarma: 'Tableta', laboratorio: 'Bayer', receta: false }
  ];

  filteredProducts = [...this.productos];

  filterProducts() {
    if (!this.searchQuery) {
      this.filteredProducts = [...this.productos];
      return;
    }
    const q = this.searchQuery.toLowerCase();
    this.filteredProducts = this.productos.filter(p => 
      p.nombreComercial.toLowerCase().includes(q) || 
      p.principioActivo.toLowerCase().includes(q) ||
      p.digemid.toLowerCase().includes(q)
    );
  }
}
