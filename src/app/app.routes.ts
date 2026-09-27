import { Routes, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { MainLayout } from './layout/main-layout/main-layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { Pos } from './pages/pos/pos';
import { Products } from './pages/products/products';
import { Inventory } from './pages/inventory/inventory';
import { Customers } from './pages/customers/customers';
import { Compras } from './pages/compras/compras';
import { Usuarios } from './pages/usuarios/usuarios';
import { Reportes } from './pages/reportes/reportes';
import { inject } from '@angular/core';
import { AuthService } from './core/services/auth.service';
import { Router } from '@angular/router';

// Guard de Autenticación Principal
const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.token) {
    return true;
  }
  
  return router.parseUrl('/login');
};

// Guard de Autorización por Roles
const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  const role = authService.activeRole();
  const allowedRoles = route.data['roles'] as Array<string>;
  
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redireccionar si no tiene permiso basado en su rol
    return role === 'CAJERO' ? router.parseUrl('/pos') : router.parseUrl('/dashboard');
  }
  
  return true;
};

// Route redirections
const redirectToDashboardOrPos: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.activeRole() === 'CAJERO' ? router.parseUrl('/pos') : router.parseUrl('/dashboard');
};

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { 
    path: '', 
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', children: [], canActivate: [redirectToDashboardOrPos] },
      { path: 'dashboard', component: Dashboard, canActivate: [roleGuard], data: { roles: ['ADMIN', 'QUIMICO'] } },
      { path: 'pos', component: Pos },
      { path: 'productos', component: Products },
      { path: 'productos/nuevo', component: Products },
      { path: 'productos/editar/:id', component: Products },
      { path: 'products', redirectTo: 'productos' },
      { path: 'products/nuevo', redirectTo: 'productos/nuevo' },
      { path: 'products/editar/:id', redirectTo: (route) => `/productos/editar/${route.params['id']}` },
      { path: 'inventario', component: Inventory },
      { path: 'inventario/nuevo', component: Inventory },
      { path: 'inventario/editar/:id', component: Inventory },
      { path: 'inventory', redirectTo: 'inventario' },
      { path: 'inventory/nuevo', redirectTo: 'inventario/nuevo' },
      { path: 'inventory/editar/:id', redirectTo: (route) => `/inventario/editar/${route.params['id']}` },
      { path: 'clientes', component: Customers },
      { path: 'compras', component: Compras, canActivate: [roleGuard], data: { roles: ['ADMIN', 'QUIMICO'] } },
      { path: 'usuarios', component: Usuarios, canActivate: [roleGuard], data: { roles: ['ADMIN'] } },
      { path: 'reportes', component: Reportes, canActivate: [roleGuard], data: { roles: ['ADMIN', 'QUIMICO'] } }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
