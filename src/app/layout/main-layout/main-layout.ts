import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { Sede } from '../../core/models/auth.model';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss']
})
export class MainLayout {
  public authService = inject(AuthService);
  public themeService = inject(ThemeService);
  private router = inject(Router);

  sidebarCollapsed = false;
  mobileMenuOpen = false;
  currentRoute = '';

  // Modal Selector de Sucursales (Multi-Sede)
  showSedesModal = false;

  constructor() {
    this.currentRoute = this.router.url;
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentRoute = event.urlAfterRedirects || event.url;
      this.mobileMenuOpen = false;
    });
  }

  get breadcrumbs(): { section: string; title: string } {
    const url = this.currentRoute;
    if (url.includes('/pos')) {
      return { section: 'Operaciones', title: 'Punto de Venta POS' };
    }
    if (url.includes('/productos')) {
      return { section: 'Inventario', title: 'Catálogo DIGEMID' };
    }
    if (url.includes('/inventario')) {
      return { section: 'Inventario', title: 'Control de Lotes & FEFO' };
    }
    if (url.includes('/reportes')) {
      return { section: 'Auditoría', title: 'Reportes de Ventas & Caja' };
    }
    if (url.includes('/clientes')) {
      return { section: 'Fidelización', title: 'Base de Datos de Clientes' };
    }
    return { section: 'Dashboards', title: 'Resumen General' };
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  abrirModalSedes() {
    if (this.authService.activeRole() === 'ADMIN') {
      this.showSedesModal = true;
    }
  }

  cambiarSede(sede: Sede) {
    if (this.authService.activeRole() !== 'ADMIN') {
      return;
    }
    this.authService.setSedeActiva(sede);
    this.showSedesModal = false;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
