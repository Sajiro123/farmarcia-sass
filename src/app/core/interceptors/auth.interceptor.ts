import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  
  const token = authService.token;
  const tenantId = authService.tenantId;
  
  let authReq = req;
  
  const headers: any = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  
  if (Object.keys(headers).length > 0) {
    authReq = req.clone({
      setHeaders: headers
    });
  }
  
  return next(authReq);
};
