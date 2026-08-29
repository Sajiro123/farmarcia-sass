import { Component, OnInit, inject } from '@angular/core';
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

  usuarios: UsuarioNegocioDTO[] = [];
  perfiles: PerfilDTO[] = [];
  acciones: AccionDTO[] = [];

  filtroRol = 'TODOS';
  busqueda = '';
  cargando = false;

  // Modal Crear / Editar
  showModal = false;
  modoEdicion = false;
  tabModal: 'persona' | 'cuenta' = 'persona';
  
  usuarioEnEdicion: UsuarioNegocioDTO = this.getUsuarioVacio();
  passwordInput = '';
  consultandoDni = false;

  // Modal Permisos / Matriz RBAC
  showPermisosModal = false;
  usuarioSeleccionadoPermisos: UsuarioNegocioDTO | null = null;

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    this.cargando = true;
    this.userService.listarUsuarios().subscribe({
      next: (data) => {
        this.usuarios = data;
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
      }
    });

    this.userService.listarPerfiles().subscribe({
      next: (data) => this.perfiles = data
    });

    this.userService.listarAcciones().subscribe({
      next: (data) => this.acciones = data
    });
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
  }

  abrirModalEditar(usuario: UsuarioNegocioDTO) {
    this.modoEdicion = true;
    this.usuarioEnEdicion = { ...usuario };
    this.passwordInput = '';
    this.tabModal = 'persona';
    this.showModal = true;
  }

  consultarReniec() {
    if (!this.usuarioEnEdicion.numeroDocumento || this.usuarioEnEdicion.numeroDocumento.length !== 8) {
      alert('Ingresa un número de DNI válido de 8 dígitos.');
      return;
    }

    this.consultandoDni = true;
    setTimeout(() => {
      this.consultandoDni = false;
      if (this.usuarioEnEdicion.numeroDocumento === '45892018') {
        this.usuarioEnEdicion.nombres = 'Carlos Alberto';
        this.usuarioEnEdicion.apellidos = 'Mendoza Ramos';
      } else if (this.usuarioEnEdicion.numeroDocumento === '41908234') {
        this.usuarioEnEdicion.nombres = 'Elena';
        this.usuarioEnEdicion.apellidos = 'Ramos Salazar';
        this.usuarioEnEdicion.nroColegiatura = 'CQFP 14820';
      } else {
        this.usuarioEnEdicion.nombres = 'ROBERTO CARLOS';
        this.usuarioEnEdicion.apellidos = 'GUTIERREZ PAREDES';
      }
    }, 400);
  }

  guardarUsuario() {
    if (!this.usuarioEnEdicion.email || !this.usuarioEnEdicion.nombres || !this.usuarioEnEdicion.apellidos) {
      alert('Por favor complete los campos obligatorios (Nombres, Apellidos y Correo).');
      return;
    }

    if (this.passwordInput) {
      this.usuarioEnEdicion.password = this.passwordInput;
    }

    if (this.modoEdicion && this.usuarioEnEdicion.id) {
      this.userService.actualizarUsuario(this.usuarioEnEdicion.id, this.usuarioEnEdicion).subscribe({
        next: () => {
          alert('✅ Usuario actualizado exitosamente en la base de datos Master.');
          this.showModal = false;
          this.cargarDatos();
        }
      });
    } else {
      this.userService.crearUsuario(this.usuarioEnEdicion).subscribe({
        next: () => {
          alert('✅ Usuario registrado exitosamente en la base de datos Master.');
          this.showModal = false;
          this.cargarDatos();
        }
      });
    }
  }

  toggleEstadoUsuario(usuario: UsuarioNegocioDTO) {
    if (!usuario.id) return;
    const nuevoEstado = !usuario.estaActivo;
    this.userService.cambiarEstado(usuario.id, nuevoEstado).subscribe({
      next: () => {
        usuario.estaActivo = nuevoEstado;
      }
    });
  }

  verPermisos(usuario: UsuarioNegocioDTO) {
    this.usuarioSeleccionadoPermisos = usuario;
    this.showPermisosModal = true;
  }

  tienePermiso(codigoAccion: string): boolean {
    if (!this.usuarioSeleccionadoPermisos) return false;
    if (this.usuarioSeleccionadoPermisos.perfilCodigo === 'ADMIN_NEGOCIO') return true;
    return (this.usuarioSeleccionadoPermisos.acciones || []).includes(codigoAccion);
  }
}
