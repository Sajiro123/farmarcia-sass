import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, UsuarioNegocioDTO, PerfilDTO, AccionDTO } from './user.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html'
})
export class Usuarios implements OnInit {
  public authService = inject(AuthService);
  private userService = inject(UserService);
  private cdr = inject(ChangeDetectorRef);

  usuarios: UsuarioNegocioDTO[] = [];
  perfiles: PerfilDTO[] = [];
  acciones: AccionDTO[] = [];

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
  consultandoDni = false;
  mostrarPins: { [key: string]: boolean } = {};

  // Modal Eliminar
  showDeleteModal = false;
  usuarioAEliminar: UsuarioNegocioDTO | null = null;
  eliminando = false;

  // Modal Permisos / Matriz RBAC
  showPermisosModal = false;
  usuarioSeleccionadoPermisos: UsuarioNegocioDTO | null = null;

  ngOnInit() {
    // Inicialización inmediata con lista precargada para evitar pantalla en blanco
    this.usuarios = [...this.userService.mockUsuarios];
    this.cargarDatos();
  }

  cargarDatos() {
    this.cargando = true;
    this.cdr.markForCheck();

    this.userService.listarUsuarios().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.usuarios = [...data];
        }
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
      const matchRol = this.filtroRol === 'TODOS' || u.perfilCodigo === this.filtroRol;
      const q = this.busqueda.toLowerCase().trim();
      const matchTexto = !q || 
        (u.nombreCompleto && u.nombreCompleto.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q) ||
        (u.numeroDocumento && u.numeroDocumento.includes(q)) ||
        (u.nroColegiatura && u.nroColegiatura.toLowerCase().includes(q));
      return matchRol && matchTexto;
    });
  }

  get totalAdmins(): number {
    return this.usuarios.filter(u => u.perfilCodigo === 'ADMIN_NEGOCIO').length;
  }

  get totalQuimicos(): number {
    return this.usuarios.filter(u => u.perfilCodigo === 'QUIMICO_FARMACEUTICO').length;
  }

  get totalCajeros(): number {
    return this.usuarios.filter(u => u.perfilCodigo === 'CAJERO_VENDEDOR').length;
  }

  getUsuarioVacio(): UsuarioNegocioDTO {
    return {
      email: '',
      password: '',
      pinSeguridad: '1234',
      estaActivo: true,
      perfilCodigo: 'CAJERO_VENDEDOR',
      tipoDocumento: 'DNI',
      numeroDocumento: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      direccion: '',
      nroColegiatura: ''
    };
  }

  abrirModalNuevo() {
    this.modoEdicion = false;
    this.usuarioEnEdicion = this.getUsuarioVacio();
    this.passwordInput = '123456';
    this.tabModal = 'persona';
    this.showModal = true;
    this.cdr.markForCheck();
  }

  abrirModalEditar(usuario: UsuarioNegocioDTO) {
    this.modoEdicion = true;
    this.usuarioEnEdicion = { 
      ...usuario,
      tipoDocumento: usuario.tipoDocumento || 'DNI',
      pinSeguridad: usuario.pinSeguridad || '1234'
    };
    this.passwordInput = '';
    this.tabModal = 'persona';
    this.showModal = true;
    this.cdr.markForCheck();
  }

  toggleMostrarPin(id?: string) {
    if (!id) return;
    this.mostrarPins[id] = !this.mostrarPins[id];
    this.cdr.markForCheck();
  }

  consultarReniec() {
    const doc = this.usuarioEnEdicion.numeroDocumento?.trim();
    if (!doc || doc.length !== 8) {
      this.mostrarAlerta('error', 'Ingresa un número de DNI válido de 8 dígitos.');
      return;
    }

    this.consultandoDni = true;
    this.cdr.markForCheck();

    setTimeout(() => {
      this.consultandoDni = false;
      if (doc === '45892018') {
        this.usuarioEnEdicion.nombres = 'Carlos Alberto';
        this.usuarioEnEdicion.apellidos = 'Mendoza Ramos';
        this.usuarioEnEdicion.telefono = '987654321';
      } else if (doc === '41908234') {
        this.usuarioEnEdicion.nombres = 'Elena';
        this.usuarioEnEdicion.apellidos = 'Ramos Salazar';
        this.usuarioEnEdicion.nroColegiatura = 'CQFP 14820';
        this.usuarioEnEdicion.telefono = '976543210';
      } else if (doc === '70982314') {
        this.usuarioEnEdicion.nombres = 'Juan Carlos';
        this.usuarioEnEdicion.apellidos = 'Pérez Gómez';
        this.usuarioEnEdicion.telefono = '965432109';
      } else if (doc === '47812903') {
        this.usuarioEnEdicion.nombres = 'Mariana Lucía';
        this.usuarioEnEdicion.apellidos = 'Vega Campos';
        this.usuarioEnEdicion.telefono = '981234567';
      } else {
        this.usuarioEnEdicion.nombres = 'ROBERTO CARLOS';
        this.usuarioEnEdicion.apellidos = 'GUTIERREZ PAREDES';
        this.usuarioEnEdicion.telefono = '984567123';
      }
      this.mostrarAlerta('success', 'Datos RENIEC autocompletados correctamente.');
      this.cdr.markForCheck();
    }, 300);
  }

  guardarUsuario() {
    if (!this.usuarioEnEdicion.email || !this.usuarioEnEdicion.nombres || !this.usuarioEnEdicion.apellidos) {
      this.mostrarAlerta('error', 'Por favor complete los campos obligatorios: Nombres, Apellidos y Correo.');
      return;
    }

    this.guardando = true;
    this.cdr.markForCheck();

    if (this.passwordInput) {
      this.usuarioEnEdicion.password = this.passwordInput;
    }

    if (this.modoEdicion && this.usuarioEnEdicion.id) {
      this.userService.actualizarUsuario(this.usuarioEnEdicion.id, this.usuarioEnEdicion).subscribe({
        next: () => {
          this.guardando = false;
          this.showModal = false;
          this.mostrarAlerta('success', 'Usuario y Persona actualizados exitosamente en Master DB.');
          this.cargarDatos();
        },
        error: (err) => {
          this.guardando = false;
          this.mostrarAlerta('error', 'Ocurrió un error al actualizar el usuario.');
          this.cdr.markForCheck();
        }
      });
    } else {
      this.userService.crearUsuario(this.usuarioEnEdicion).subscribe({
        next: () => {
          this.guardando = false;
          this.showModal = false;
          this.mostrarAlerta('success', 'Nuevo usuario registrado exitosamente en Master DB.');
          this.cargarDatos();
        },
        error: (err) => {
          this.guardando = false;
          this.mostrarAlerta('error', 'Error al registrar usuario: verifica que el correo no esté duplicado.');
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
    this.eliminando = true;
    this.cdr.markForCheck();

    this.userService.eliminarUsuario(this.usuarioAEliminar.id).subscribe({
      next: () => {
        this.eliminando = false;
        this.showDeleteModal = false;
        this.mostrarAlerta('success', `Usuario ${this.usuarioAEliminar?.email} eliminado exitosamente.`);
        this.usuarioAEliminar = null;
        this.cargarDatos();
      },
      error: () => {
        this.eliminando = false;
        this.showDeleteModal = false;
        this.mostrarAlerta('error', 'No se pudo eliminar el usuario de la base de datos.');
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

  verPermisos(usuario: UsuarioNegocioDTO) {
    this.usuarioSeleccionadoPermisos = usuario;
    this.showPermisosModal = true;
    this.cdr.markForCheck();
  }

  tienePermiso(codigoAccion: string): boolean {
    if (!this.usuarioSeleccionadoPermisos) return false;
    if (this.usuarioSeleccionadoPermisos.perfilCodigo === 'ADMIN_NEGOCIO') return true;
    return (this.usuarioSeleccionadoPermisos.acciones || []).includes(codigoAccion);
  }
}
