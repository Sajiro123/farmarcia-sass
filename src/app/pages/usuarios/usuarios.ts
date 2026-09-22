import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, UsuarioNegocioDTO, PerfilDTO, AccionDTO } from './user.service';
import { AuthService } from '../../core/services/auth.service';
import { SedeService, SedeDTO } from '../../core/services/sede.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html'
})
export class Usuarios implements OnInit {
  public authService = inject(AuthService);
  private userService = inject(UserService);
  private sedeService = inject(SedeService);
  private cdr = inject(ChangeDetectorRef);

  usuarios: UsuarioNegocioDTO[] = [];
  perfiles: PerfilDTO[] = [];
  acciones: AccionDTO[] = [];
  sedes: SedeDTO[] = [];

  filtroRol = 'TODOS';
  busqueda = '';
  cargando = false;
  guardando = false;

  // Toast Notificaciones
  mensajeToast: { tipo: 'success' | 'error' | 'info'; texto: string } | null = null;

  // Modal Crear / Editar
  showModal = false;
  modoEdicion = false;
  tabModal: 'persona' | 'cuenta' = 'persona';
  
  usuarioEnEdicion: UsuarioNegocioDTO = this.getUsuarioVacio();
  passwordInput = '';
  mostrarPins: { [key: string]: boolean } = {};

  // Modal Eliminar
  showDeleteModal = false;
  usuarioAEliminar: UsuarioNegocioDTO | null = null;
  eliminando = false;

  // Modal Permisos / Matriz RBAC
  showPermisosModal = false;
  usuarioSeleccionadoPermisos: UsuarioNegocioDTO | null = null;
  permisosSeleccionados = new Set<string>();
  guardandoPermisos = false;

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    this.cargando = true;
    this.cdr.markForCheck();

    this.userService.listarUsuarios().subscribe({
      next: (data) => {
        this.usuarios = data ? [...data] : [];
        this.cargando = false;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al listar usuarios:', err);
        this.cargando = false;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    });

    this.userService.listarPerfiles().subscribe({
      next: (data) => {
        this.perfiles = data;
        this.cdr.markForCheck();
      }
    });

    this.userService.listarAcciones().subscribe({
      next: (data) => {
        this.acciones = data;
        this.cdr.markForCheck();
      }
    });

    this.sedeService.listarSedes().subscribe({
      next: (data) => {
        this.sedes = data || [];
        this.cdr.markForCheck();
      }
    });
  }

  mostrarAlerta(tipo: 'success' | 'error' | 'info', texto: string) {
    this.mensajeToast = { tipo, texto };
    this.cdr.markForCheck();
    setTimeout(() => {
      if (this.mensajeToast?.texto === texto) {
        this.mensajeToast = null;
        this.cdr.markForCheck();
      }
    }, 3500);
  }

  get usuariosFiltrados(): UsuarioNegocioDTO[] {
    return this.usuarios.filter(u => {
      let matchRol = true;
      if (this.filtroRol === 'PERSONAL') {
        matchRol = !u.tieneUsuario;
      } else if (this.filtroRol === 'CON_CUENTA') {
        matchRol = !!u.tieneUsuario;
      } else if (this.filtroRol !== 'TODOS') {
        matchRol = u.tieneUsuario === true && u.perfilCodigo === this.filtroRol;
      }

      const q = this.busqueda.toLowerCase().trim();
      const matchTexto = !q || 
        (u.nombreCompleto && u.nombreCompleto.toLowerCase().includes(q)) ||
        (u.nombres && u.nombres.toLowerCase().includes(q)) ||
        (u.apellidos && u.apellidos.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.numeroDocumento && u.numeroDocumento.includes(q)) ||
        (u.nroColegiatura && u.nroColegiatura.toLowerCase().includes(q)) ||
        (u.sedeNombre && u.sedeNombre.toLowerCase().includes(q));
      return matchRol && matchTexto;
    });
  }

  get totalPersonal(): number {
    return this.usuarios.filter(u => !u.tieneUsuario).length;
  }

  get totalConCuenta(): number {
    return this.usuarios.filter(u => u.tieneUsuario).length;
  }

  get totalAdmins(): number {
    return this.usuarios.filter(u => u.tieneUsuario && u.perfilCodigo === 'ADMIN_NEGOCIO').length;
  }

  get totalQuimicos(): number {
    return this.usuarios.filter(u => u.tieneUsuario && u.perfilCodigo === 'QUIMICO_FARMACEUTICO').length;
  }

  get totalCajeros(): number {
    return this.usuarios.filter(u => u.tieneUsuario && u.perfilCodigo === 'CAJERO_VENDEDOR').length;
  }

  getUsuarioVacio(): UsuarioNegocioDTO {
    const sedeDef = this.sedes[0] || { id: '11111111-1111-1111-1111-111111111111', nombre: 'Sede Cajamarca Central' };
    return {
      tieneUsuario: false,
      estaActivo: true,
      tipoDocumento: 'DNI',
      numeroDocumento: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      direccion: '',
      nroColegiatura: '',
      email: '',
      password: '',
      pinSeguridad: '1234',
      perfilCodigo: 'CAJERO_VENDEDOR',
      sedeId: sedeDef.id,
      sedeNombre: sedeDef.nombre
    };
  }

  abrirModalNuevo() {
    this.modoEdicion = false;
    this.usuarioEnEdicion = this.getUsuarioVacio();
    this.passwordInput = '';
    this.tabModal = 'persona';
    this.showModal = true;
    this.cdr.markForCheck();
  }

  abrirModalEditar(usuario: UsuarioNegocioDTO) {
    this.modoEdicion = true;
    const sId = usuario.sedeId || this.sedes[0]?.id || '11111111-1111-1111-1111-111111111111';
    const sNombre = usuario.sedeNombre || this.sedes.find(s => s.id === sId)?.nombre || 'Sede Cajamarca Central';
    this.usuarioEnEdicion = { 
      ...usuario,
      tipoDocumento: usuario.tipoDocumento || 'DNI',
      pinSeguridad: usuario.pinSeguridad || '1234',
      sedeId: sId,
      sedeNombre: sNombre
    };
    this.passwordInput = '';
    this.tabModal = 'persona';
    this.showModal = true;
    this.cdr.markForCheck();
  }

  onSedeChange() {
    const seleccionada = this.sedes.find(s => s.id === this.usuarioEnEdicion.sedeId);
    if (seleccionada) {
      this.usuarioEnEdicion.sedeNombre = seleccionada.nombre;
    }
  }

  obtenerNombreSede(usuario: UsuarioNegocioDTO): string {
    if (usuario.sedeNombre) return usuario.sedeNombre;
    if (usuario.sedeId) {
      const s = this.sedes.find(item => item.id === usuario.sedeId);
      if (s) return s.nombre;
    }
    return 'Sede Cajamarca Central';
  }

  toggleMostrarPin(id?: string) {
    if (!id) return;
    this.mostrarPins[id] = !this.mostrarPins[id];
    this.cdr.markForCheck();
  }

  guardarUsuario() {
    const nombres = this.usuarioEnEdicion.nombres?.trim();
    const apellidos = this.usuarioEnEdicion.apellidos?.trim();

    if (!nombres || !apellidos) {
      this.mostrarAlerta('error', 'Por favor complete los campos obligatorios: Nombres y Apellidos.');
      return;
    }

    this.guardando = true;
    this.cdr.markForCheck();

    if (!this.usuarioEnEdicion.id) {
      // REGISTRAR PERSONAL EN NÓMINA (Farmacia crea su propio personal)
      this.usuarioEnEdicion.tieneUsuario = false;
      this.userService.crearPersonal(this.usuarioEnEdicion).subscribe({
        next: () => {
          this.guardando = false;
          this.showModal = false;
          this.mostrarAlerta('success', `Personal ${nombres} ${apellidos} registrado exitosamente en la nómina.`);
          this.cargarDatos();
        },
        error: (err) => {
          console.error('Error al registrar personal:', err);
          this.guardando = false;
          this.mostrarAlerta('error', 'Ocurrió un error al registrar el personal.');
          this.cdr.markForCheck();
        }
      });
    } else {
      // ACTUALIZAR DATOS DE PERSONAL O USUARIO
      if (this.passwordInput) {
        this.usuarioEnEdicion.password = this.passwordInput;
      }
      this.userService.actualizarUsuario(this.usuarioEnEdicion.id, this.usuarioEnEdicion).subscribe({
        next: () => {
          this.guardando = false;
          this.showModal = false;
          this.mostrarAlerta('success', 'Datos del colaborador actualizados exitosamente.');
          this.cargarDatos();
        },
        error: (err) => {
          console.error('Error al actualizar datos:', err);
          this.guardando = false;
          this.mostrarAlerta('error', 'Ocurrió un error al actualizar los datos del colaborador.');
          this.cdr.markForCheck();
        }
      });
    }
  }

  confirmarEliminar(usuario: UsuarioNegocioDTO) {
    this.usuarioAEliminar = usuario;
    this.showDeleteModal = true;
    this.cdr.markForCheck();
  }

  ejecutarEliminacion() {
    if (!this.usuarioAEliminar || !this.usuarioAEliminar.id) return;
    const idAEliminar = this.usuarioAEliminar.id;
    const nombre = this.usuarioAEliminar.nombreCompleto || this.usuarioAEliminar.email || 'Colaborador';
    this.eliminando = true;
    this.cdr.markForCheck();

    this.userService.eliminarUsuario(idAEliminar).subscribe({
      next: () => {
        this.eliminando = false;
        this.showDeleteModal = false;
        this.usuarios = this.usuarios.filter(u => u.id !== idAEliminar);
        this.mostrarAlerta('success', `Colaborador ${nombre} eliminado exitosamente de la base de datos.`);
        this.usuarioAEliminar = null;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
        this.cargarDatos();
      },
      error: (err) => {
        console.error('Error al eliminar usuario:', err);
        this.eliminando = false;
        this.showDeleteModal = false;
        this.mostrarAlerta('error', 'No se pudo eliminar el colaborador de la base de datos.');
        this.cdr.markForCheck();
      }
    });
  }

  toggleEstadoUsuario(usuario: UsuarioNegocioDTO) {
    if (!usuario.id) return;
    const nuevoEstado = !usuario.estaActivo;
    this.userService.cambiarEstado(usuario.id, nuevoEstado).subscribe({
      next: () => {
        usuario.estaActivo = nuevoEstado;
        this.mostrarAlerta('info', `Usuario ${usuario.email} marcado como ${nuevoEstado ? 'ACTIVO' : 'INACTIVO'}.`);
        this.cdr.markForCheck();
      }
    });
  }

  get accionesAgrupadas(): { modulo: string; titulo: string; icono: string; color: string; acciones: AccionDTO[] }[] {
    const ordenModulos = ['POS', 'INVENTARIO', 'COMPRAS', 'DASHBOARD', 'SEGURIDAD'];
    const metaModulos: Record<string, { titulo: string; icono: string; color: string }> = {
      'POS': {
        titulo: 'Punto de Venta (POS) & Caja',
        icono: 'pi-shopping-cart',
        color: 'emerald'
      },
      'INVENTARIO': {
        titulo: 'Inventario, Lotes & DIGEMID (FEFO)',
        icono: 'pi-box',
        color: 'purple'
      },
      'COMPRAS': {
        titulo: 'Compras & Cuentas por Pagar (CxP)',
        icono: 'pi-truck',
        color: 'blue'
      },
      'DASHBOARD': {
        titulo: 'Finanzas, Reportes & Rentabilidad',
        icono: 'pi-chart-line',
        color: 'amber'
      },
      'SEGURIDAD': {
        titulo: 'Seguridad, Usuarios & Roles',
        icono: 'pi-shield',
        color: 'indigo'
      }
    };

    const agrupado: Record<string, AccionDTO[]> = {};
    for (const acc of this.acciones) {
      const mod = acc.modulo || 'OTROS';
      if (!agrupado[mod]) agrupado[mod] = [];
      agrupado[mod].push(acc);
    }

    const resultado: { modulo: string; titulo: string; icono: string; color: string; acciones: AccionDTO[] }[] = [];

    // Primero los módulos conocidos en orden
    for (const m of ordenModulos) {
      if (agrupado[m] && agrupado[m].length > 0) {
        resultado.push({
          modulo: m,
          titulo: metaModulos[m].titulo,
          icono: metaModulos[m].icono,
          color: metaModulos[m].color,
          acciones: agrupado[m]
        });
      }
    }

    // Luego otros módulos si existiesen
    for (const m of Object.keys(agrupado)) {
      if (!ordenModulos.includes(m)) {
        resultado.push({
          modulo: m,
          titulo: `Módulo: ${m}`,
          icono: 'pi-folder',
          color: 'slate',
          acciones: agrupado[m]
        });
      }
    }

    return resultado;
  }

  verPermisos(usuario: UsuarioNegocioDTO) {
    this.usuarioSeleccionadoPermisos = usuario;
    this.permisosSeleccionados = new Set<string>(usuario.acciones || []);
    this.showPermisosModal = true;
    this.cdr.markForCheck();
  }

  tienePermiso(codigoAccion: string): boolean {
    return this.permisosSeleccionados.has(codigoAccion);
  }

  togglePermiso(codigoAccion: string) {
    if (this.permisosSeleccionados.has(codigoAccion)) {
      this.permisosSeleccionados.delete(codigoAccion);
    } else {
      this.permisosSeleccionados.add(codigoAccion);
    }
    this.cdr.markForCheck();
  }

  todosHabilitadosEnModulo(acciones: AccionDTO[]): boolean {
    if (!acciones || acciones.length === 0) return false;
    return acciones.every(a => this.permisosSeleccionados.has(a.codigo));
  }

  algunoHabilitadoEnModulo(acciones: AccionDTO[]): boolean {
    if (!acciones || acciones.length === 0) return false;
    return acciones.some(a => this.permisosSeleccionados.has(a.codigo));
  }

  toggleModulo(acciones: AccionDTO[]) {
    const todos = this.todosHabilitadosEnModulo(acciones);
    if (todos) {
      acciones.forEach(a => this.permisosSeleccionados.delete(a.codigo));
    } else {
      acciones.forEach(a => this.permisosSeleccionados.add(a.codigo));
    }
    this.cdr.markForCheck();
  }

  marcarTodos(habilitar: boolean) {
    if (habilitar) {
      this.acciones.forEach(a => this.permisosSeleccionados.add(a.codigo));
    } else {
      this.permisosSeleccionados.clear();
    }
    this.cdr.markForCheck();
  }

  restablecerAPerfil() {
    if (!this.usuarioSeleccionadoPermisos?.id) return;
    this.guardandoPermisos = true;
    this.cdr.markForCheck();

    this.userService.actualizarAcciones(this.usuarioSeleccionadoPermisos.id, [], true).subscribe({
      next: (res) => {
        this.guardandoPermisos = false;
        const resData = res?.data;
        const nuevasAcciones = resData?.acciones || [];
        if (this.usuarioSeleccionadoPermisos) {
          this.usuarioSeleccionadoPermisos.acciones = nuevasAcciones;
          this.usuarioSeleccionadoPermisos.tienePermisosPersonalizados = false;
          this.permisosSeleccionados = new Set<string>(nuevasAcciones);
        }
        this.mostrarAlerta('success', 'Permisos restablecidos a la configuración base del perfil.');
        this.cargarDatos();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al restablecer permisos:', err);
        this.guardandoPermisos = false;
        this.mostrarAlerta('error', 'No se pudieron restablecer los permisos por defecto.');
        this.cdr.markForCheck();
      }
    });
  }

  guardarPermisos() {
    if (!this.usuarioSeleccionadoPermisos?.id) return;
    this.guardandoPermisos = true;
    this.cdr.markForCheck();

    const accionesArray = Array.from(this.permisosSeleccionados);

    this.userService.actualizarAcciones(this.usuarioSeleccionadoPermisos.id, accionesArray, false).subscribe({
      next: (res) => {
        this.guardandoPermisos = false;
        const resData = res?.data;
        const accionesFinales = resData?.acciones || accionesArray;
        if (this.usuarioSeleccionadoPermisos) {
          this.usuarioSeleccionadoPermisos.acciones = accionesFinales;
          this.usuarioSeleccionadoPermisos.tienePermisosPersonalizados = true;
        }
        this.mostrarAlerta('success', 'Permisos actualizados y guardados correctamente en Master DB.');
        this.showPermisosModal = false;
        this.cargarDatos();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al guardar permisos:', err);
        this.guardandoPermisos = false;
        this.mostrarAlerta('error', 'Ocurrió un error al guardar los permisos en Master API.');
        this.cdr.markForCheck();
      }
    });
  }
}
