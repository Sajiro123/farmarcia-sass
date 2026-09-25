import { Routes } from '@angular/router';
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

// Simple guard para proteger las rutas
const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.token) {
    return true;
  }
  
  return router.parseUrl('/login');
};

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { 
    path: '', 
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Dashboard },
      { path: 'pos', component: Pos },
      { path: 'productos', component: Products },
      { path: 'productos/nuevo', component: Products },
      { path: 'productos/editar/:id', component: Products },
      { path: 'products', redirectTo: 'productos' },
      { path: 'products/nuevo', redirectTo: 'productos/nuevo' },
      { path: 'inventario', component: Inventory },
      { path: 'inventario/nuevo', component: Inventory },
      { path: 'inventario/editar/:id', component: Inventory },
      { path: 'inventory', redirectTo: 'inventario' },
      { path: 'inventory/nuevo', redirectTo: 'inventario/nuevo' },
      { path: 'inventory/editar/:id', redirectTo: 'inventario/editar/:id' },
      { path: 'clientes', component: Customers },
      { path: 'compras', component: Compras },
      { path: 'usuarios', component: Usuarios },
      { path: 'reportes', component: Reportes }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
