import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeng/themes/lara';
import { definePreset } from '@primeng/themes';

// Custom Medicare Palette using the exact purple requested
const MedicarePreset = definePreset(Lara, {
  semantic: {
    primary: {
      50: '#F4ECF7',
      100: '#E8DAEF',
      200: '#D2B4DE',
      300: '#BB8FCE',
      400: '#A569BD',
      500: '#8E44AD', // Púrpura Principal
      600: '#7D3C98',
      700: '#6C3483',
      800: '#5B2C6F',
      900: '#4A235A',
      950: '#341240'
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          inverseColor: '#ffffff',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}'
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.700}',
          focusColor: '{primary.800}'
        }
      },
      dark: {
        primary: {
          color: '{primary.400}',
          inverseColor: '{surface.900}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}'
        },
        highlight: {
          background: 'rgba(142, 68, 173, 0.16)', // primary with opacity
          focusBackground: 'rgba(142, 68, 173, 0.24)',
          color: '{primary.100}',
          focusColor: '{primary.50}'
        }
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: MedicarePreset,
        options: {
          darkModeSelector: '.dark'
        }
      },
      ripple: true
    })
  ]
};
