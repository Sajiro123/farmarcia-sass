import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface UploadResult {
  url: string;
  nombreArchivo?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private supabaseService = inject(SupabaseService);

  private readonly supabaseUrl = environment.supabaseUrl;
  private readonly supabaseAnonKey = environment.supabaseAnonKey;
  public readonly bucketName = 'productos';

  /**
   * Valida que el archivo sea una imagen válida y no supere los 5 MB
   */
  validarArchivo(file: File): { valido: boolean; error?: string } {
    const tiposPermitidos = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!tiposPermitidos.includes(file.type)) {
      return {
        valido: false,
        error: 'Formato no soportado. Por favor sube una imagen PNG, JPG, WEBP o SVG.'
      };
    }

    const maxBytes = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxBytes) {
      return {
        valido: false,
        error: 'El archivo excede el límite de 5 MB permitido.'
      };
    }

    return { valido: true };
  }

  /**
   * Sube una imagen directamente al bucket 'productos' de Supabase Storage
   * Retorna la URL pública accesible por CDN
   */
  async subirImagenProducto(file: File, productoId?: string): Promise<UploadResult> {
    const validacion = this.validarArchivo(file);
    if (!validacion.valido) {
      return { url: '', error: validacion.error };
    }

    const extension = file.name.split('.').pop() || 'png';
    const cleanId = (productoId || 'prod').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `${cleanId}_${Date.now()}.${extension}`;

    try {
      const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${fileName}`;
      const authKey = this.supabaseAnonKey;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'apikey': authKey,
          'Authorization': `Bearer ${authKey}`,
          'Content-Type': file.type,
          'x-upsert': 'true'
        },
        body: file
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        console.warn('⚠️ Error al subir a Supabase Storage, usando fallback local Base64:', errJson);
        const base64 = await this.convertirABase64(file);
        return {
          url: base64,
          nombreArchivo: fileName,
          error: undefined
        };
      }

      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${fileName}`;
      return {
        url: publicUrl,
        nombreArchivo: fileName
      };
    } catch (err: any) {
      console.warn('⚠️ Excepción de red en Supabase Storage, usando fallback Base64:', err);
      const base64 = await this.convertirABase64(file);
      return {
        url: base64,
        nombreArchivo: fileName,
        error: undefined
      };
    }
  }

  /**
   * Convierte un archivo a Data URL Base64 para vista previa o fallback offline
   */
  convertirABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Genera un enlace fotográfico / gráfico representativo para medicamentos
   */
  obtenerImagenPorDefecto(nombre: string, categoria?: string): string {
    const n = (nombre || '').toLowerCase();
    
    // Paracetamol
    if (n.includes('paracetamol')) {
      return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80';
    }
    // Amoxicilina
    if (n.includes('amoxicilina')) {
      return 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&auto=format&fit=crop&q=80';
    }
    // Clonazepam / Controlado
    if (n.includes('clonazepam') || n.includes('alprazolam')) {
      return 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=400&auto=format&fit=crop&q=80';
    }
    // Panadol / Antigripal
    if (n.includes('panadol') || n.includes('antigripal')) {
      return 'https://images.unsplash.com/photo-1550572017-ed24c138f28c?w=400&auto=format&fit=crop&q=80';
    }
    // Ibuprofeno / Doloral
    if (n.includes('ibuprofeno') || n.includes('doloral')) {
      return 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&auto=format&fit=crop&q=80';
    }
    // Vitamina C / Redoxon
    if (n.includes('vitamina') || n.includes('redoxon')) {
      return 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=400&auto=format&fit=crop&q=80';
    }
    // Perfumería / Cuidado Personal
    if (categoria && (categoria.includes('Perfume') || categoria.includes('Personal'))) {
      return 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=400&auto=format&fit=crop&q=80';
    }
    // Genérico Farmacia
    return 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400&auto=format&fit=crop&q=80';
  }
}
