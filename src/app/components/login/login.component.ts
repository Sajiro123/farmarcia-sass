import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

interface CarouselSlide {
  image: string;
  title: string;
  description: string;
  badge: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  showPassword = false;
  isLoading = false;
  submitFeedback: { success: boolean; message: string } | null = null;

  // Carousel Configuration
  currentSlide = 0;
  private autoPlayInterval: any;
  private intervalDuration = 5000; // 5 seconds

  slides: CarouselSlide[] = [
    {
      image: '/assets/images/carousel-1.jpg',
      badge: 'Control de Stock Inteligente',
      title: 'Inventario en Tiempo Real',
      description: 'Monitorea medicamentos, alertas de vencimiento y realiza pedidos inteligentes de forma automatizada.'
    },
    {
      image: '/assets/images/carousel-2.jpg',
      badge: 'Atención Profesional',
      title: 'Recetas y Facturación Rápida',
      description: 'Emite facturas electrónicas y gestiona recetas digitales en segundos con nuestra interfaz ágil.'
    },
    {
      image: '/assets/images/carousel-3.jpg',
      badge: 'Analítica Avanzada',
      title: 'Reportes y Rendimiento de Ventas',
      description: 'Visualiza gráficos en tiempo real del rendimiento de tu farmacia y toma decisiones basadas en datos.'
    }
  ];

  branches = [
    { id: 'principal', name: 'Sede Principal (Lima)' },
    { id: 'norte', name: 'Sucursal Norte' },
    { id: 'sur', name: 'Sucursal Sur' },
    { id: 'express', name: 'Medicare Express (Delivery)' }
  ];

  constructor(private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      branch: ['principal', [Validators.required]],
      rememberMe: [false]
    });
  }

  ngOnInit(): void {
    this.startAutoPlay();
  }

  ngOnDestroy(): void {
    this.stopAutoPlay();
  }

  // Carousel Controls
  startAutoPlay(): void {
    this.stopAutoPlay();
    this.autoPlayInterval = setInterval(() => {
      this.nextSlide();
    }, this.intervalDuration);
  }

  stopAutoPlay(): void {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }
  }

  nextSlide(): void {
    this.currentSlide = (this.currentSlide + 1) % this.slides.length;
  }

  prevSlide(): void {
    this.currentSlide = (this.currentSlide - 1 + this.slides.length) % this.slides.length;
  }

  goToSlide(index: number): void {
    this.currentSlide = index;
    this.startAutoPlay(); // Restart timer
  }

  // Actions
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.submitFeedback = null;

    // Simulate API Call
    setTimeout(() => {
      this.isLoading = false;
      const email = this.loginForm.value.email;
      
      // Simulating a successful login
      this.submitFeedback = {
        success: true,
        message: `¡Bienvenido de nuevo! Iniciando sesión en la sede seleccionada...`
      };
      
      console.log('Login exitoso:', this.loginForm.value);
    }, 2000);
  }
}
