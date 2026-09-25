import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService, CustomerPuntos } from '../../core/services/customer.service';
import { VentaService } from '../../core/services/venta.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.html'
})
export class Customers implements OnInit {
  private customerService = inject(CustomerService);
  private ventaService = inject(VentaService);
  private authService = inject(AuthService);

  clientes: CustomerPuntos[] = [];
  clientesFiltrados: CustomerPuntos[] = [];

  busqueda = '';
  ordenarPor: 'PUNTOS_DESC' | 'PUNTOS_ASC' | 'NOMBRE_ASC' = 'PUNTOS_DESC';

  // Filtro por Sede (Sedes independientes)
  filtroSede = 'TODAS';
  listaSedes: string[] = [];

  // Paginación
  paginaActual = 1;
  itemsPorPagina = 10;
  
  // KPI
  totalClientes = 0;
  totalPuntosEmitidos = 0;
  mejoresClientes = 0;

  // Modal Historial
  showHistorialModal = false;
  clienteSeleccionado: CustomerPuntos | null = null;
  historialVentas: any[] = [];

  // Modal Edición / Creación de Cliente
  showCustomerModal = false;
  modoModal: 'NUEVO' | 'EDITAR' = 'EDITAR';
  clienteFormId = '';
  clienteFormNombre = '';
  clienteFormCelular = '';
  clienteFormEmail = '';
  clienteFormDireccion = '';
  clienteFormFechaNacimiento = ''; // Opcional
  clienteFormPuntos = 0;
  clienteFormSede = 'Sede Cajamarca Central';
  errorFormulario = '';

  // Notificaciones Toast
  mensajeToast: { tipo: 'success' | 'warning' | 'error'; texto: string } | null = null;

  mostrarToast(tipo: 'success' | 'warning' | 'error', texto: string) {
    this.mensajeToast = { tipo, texto };
    setTimeout(() => {
      if (this.mensajeToast?.texto === texto) {
        this.mensajeToast = null;
      }
    }, 5000);
  }

  ngOnInit() {
    this.cargarSedes();
    const sedeActiva = this.authService.activeSede();
    if (sedeActiva && sedeActiva.nombre) {
      this.filtroSede = sedeActiva.nombre;
      this.clienteFormSede = sedeActiva.nombre;
    }
    this.cargarDatos();
  }

  cargarSedes() {
    const set = new Set<string>();
    this.authService.getSedes().forEach(s => {
      if (s.nombre) set.add(s.nombre);
    });
    this.listaSedes = Array.from(set);
    if (this.listaSedes.length === 0) {
      this.listaSedes = ['Sede Cajamarca Central', 'Sede Baños del Inca (Cajamarca 2)'];
    }
  }

  cargarDatos() {
    this.clientes = this.customerService.getAllCustomers();
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    let result = [...this.clientes];
    
    // Filtro por Sede (Sedes independientes)
    if (this.filtroSede !== 'TODAS') {
      result = result.filter(c => 
        c.sedeNombre === this.filtroSede ||
        c.ultimaSede === this.filtroSede ||
        c.sedesCompradas?.includes(this.filtroSede)
      );
    }

    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase();
      result = result.filter(c => 
        c.nombre.toLowerCase().includes(q) || 
        c.id.includes(q) ||
        (c.celular && c.celular.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.ultimaSede && c.ultimaSede.toLowerCase().includes(q)) ||
        (c.sedeNombre && c.sedeNombre.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      if (this.ordenarPor === 'PUNTOS_DESC') return b.puntosAcumulados - a.puntosAcumulados;
      if (this.ordenarPor === 'PUNTOS_ASC') return a.puntosAcumulados - b.puntosAcumulados;
      if (this.ordenarPor === 'NOMBRE_ASC') return a.nombre.localeCompare(b.nombre);
      return 0;
    });

    this.clientesFiltrados = result;
    this.calcularKPIs();
  }

  calcularKPIs() {
    this.totalClientes = this.clientesFiltrados.length;
    this.totalPuntosEmitidos = this.clientesFiltrados.reduce((sum, c) => sum + c.puntosAcumulados, 0);
    this.mejoresClientes = this.clientesFiltrados.filter(c => c.puntosAcumulados >= 50).length;
  }

  get clientesPaginados() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.clientesFiltrados.slice(inicio, inicio + this.itemsPorPagina);
  }

  get totalPaginas() {
    return Math.max(1, Math.ceil(this.clientesFiltrados.length / this.itemsPorPagina));
  }

  cambiarPagina(p: number) {
    if (p >= 1 && p <= this.totalPaginas) {
      this.paginaActual = p;
    }
  }

  limpiarFiltros() {
    this.busqueda = '';
    this.ordenarPor = 'PUNTOS_DESC';
    this.filtroSede = 'TODAS';
    this.aplicarFiltros();
  }

  verHistorial(cliente: CustomerPuntos) {
    this.clienteSeleccionado = cliente;
    const list = this.ventaService.ventas.filter(v => v.dni === cliente.id);
    const mapa = new Map<string, any>();
    list.forEach(v => {
      if (v && v.id && !mapa.has(v.id)) {
        mapa.set(v.id, {
          ...v,
          sede: v.sede || cliente.ultimaSede || cliente.sedeNombre || 'Sede Cajamarca Central'
        });
      }
    });
    this.historialVentas = Array.from(mapa.values());
    this.showHistorialModal = true;
  }

  abrirModalNuevo() {
    this.modoModal = 'NUEVO';
    this.clienteFormId = '';
    this.clienteFormNombre = '';
    this.clienteFormCelular = '';
    this.clienteFormEmail = '';
    this.clienteFormDireccion = '';
    this.clienteFormFechaNacimiento = '';
    this.clienteFormPuntos = 0;
    this.clienteFormSede = (this.filtroSede !== 'TODAS' ? this.filtroSede : (this.authService.activeSede()?.nombre || 'Sede Cajamarca Central'));
    this.errorFormulario = '';
    this.showCustomerModal = true;
  }

  abrirModalEditar(c: CustomerPuntos) {
    this.modoModal = 'EDITAR';
    this.clienteFormId = c.id;
    this.clienteFormNombre = c.nombre;
    this.clienteFormCelular = c.celular || '';
    this.clienteFormEmail = c.email || '';
    this.clienteFormDireccion = c.direccion || '';
    this.clienteFormFechaNacimiento = c.fechaNacimiento || '';
    this.clienteFormPuntos = c.puntosAcumulados;
    this.clienteFormSede = c.ultimaSede || c.sedeNombre || this.authService.activeSede()?.nombre || 'Sede Cajamarca Central';
    this.errorFormulario = '';
    this.showCustomerModal = true;
  }

  calcularEdad(fechaStr?: string): number | null {
    if (!fechaStr) return null;
    const hoy = new Date();
    const cumple = new Date(fechaStr);
    if (isNaN(cumple.getTime())) return null;
    let edad = hoy.getFullYear() - cumple.getFullYear();
    const m = hoy.getMonth() - cumple.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
      edad--;
    }
    return edad >= 0 ? edad : null;
  }

  guardarCliente() {
    this.errorFormulario = '';
    const id = this.clienteFormId ? this.clienteFormId.trim() : '';
    const nombre = this.clienteFormNombre ? this.clienteFormNombre.trim() : '';

    if (!id) {
      this.errorFormulario = 'Ingresa el número de documento (DNI o RUC) del cliente.';
      return;
    }
    if (!nombre) {
      this.errorFormulario = 'Ingresa el nombre completo o razón social del cliente.';
      return;
    }

    const clienteActualizado: CustomerPuntos = {
      id,
      nombre,
      celular: this.clienteFormCelular?.trim() || undefined,
      email: this.clienteFormEmail?.trim() || undefined,
      direccion: this.clienteFormDireccion?.trim() || undefined,
      fechaNacimiento: this.clienteFormFechaNacimiento ? this.clienteFormFechaNacimiento.trim() : undefined,
      puntosAcumulados: Number(this.clienteFormPuntos) || 0,
      sedeNombre: this.clienteFormSede,
      ultimaSede: this.clienteFormSede,
      sedesCompradas: [this.clienteFormSede]
    };

    this.customerService.addOrUpdateCustomer(clienteActualizado);
    this.mostrarToast('success', this.modoModal === 'NUEVO'
      ? `✅ Cliente "${nombre}" registrado exitosamente en ${this.clienteFormSede}.`
      : `✅ Información del cliente "${nombre}" actualizada exitosamente.`);

    this.showCustomerModal = false;
    this.cargarDatos();
  }
}
