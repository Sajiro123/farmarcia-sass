import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
    if (url.includes('/uikit/input') || url.includes('/inputs')) {
      return { section: 'UI Kit', title: 'Input' };
    }
    if (url.includes('/formlayout')) {
      return { section: 'UI Kit', title: 'Form Layout' };
    }
    if (url.includes('/pos')) {
      return { section: 'Operaciones', title: 'Punto de Venta POS' };
    }
    if (url.includes('/productos')) {
      return { section: 'Inventario', title: 'Catálogo DIGEMID' };
    }
    if (url.includes('/inventario')) {
      return { section: 'Inventario', title: 'Control de Lotes & FEFO' };
    }
    return { section: 'Dashboards', title: 'Resumen General' };
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
