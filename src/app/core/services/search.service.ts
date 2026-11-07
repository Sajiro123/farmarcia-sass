import { Injectable } from '@angular/core';
import Fuse, { IFuseOptions } from 'fuse.js';

@Injectable({
  providedIn: 'root'
})
export class SearchService {

  /**
   * Normaliza un texto eliminando tildes, diacríticos y espacios sobrantes
   */
  normalize(text: any): string {
    if (text === null || text === undefined) return '';
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Búsqueda híbrida de alta precisión y tolerancia a fallos:
   * 1. Coincidencia exacta de Código de Barras / SKU.
   * 2. Búsqueda multi-término independiente del orden (ej: "shampoo oll" -> "HERBAL ARGAN OLL OFF MOROCCO SHAMPOO 1L").
   * 3. Búsqueda difusa (Fuzzy Search) con Fuse.js para tolerancia a faltas ortográficas o errores de tipeo.
   *
   * @param list Colección de elementos
   * @param query Término de búsqueda
   * @param keys Claves/propiedades donde buscar
   * @param weights Ponderaciones opcionales para las claves
   */
  search<T>(
    list: T[],
    query: string | null | undefined,
    keys: string[],
    weights: Record<string, number> = {}
  ): T[] {
    if (!list || list.length === 0) return [];
    if (!query || !query.trim()) return list;

    const rawQuery = query.trim();
    const normalizedQuery = this.normalize(rawQuery);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) return list;

    // 1. Prioridad: Coincidencia exacta en código de barras o SKU
    const exactMatch = list.find(item => {
      return keys.some(k => {
        const val = (item as any)[k];
        if (!val) return false;
        const strVal = val.toString().trim();
        return strVal === rawQuery || strVal.toLowerCase() === rawQuery.toLowerCase();
      });
    });

    // 2. Búsqueda Multi-Token independiente del orden y sin acentos
    const tokenMatches: { item: T; score: number }[] = [];

    for (const item of list) {
      const fieldValues = keys.map(k => this.normalize((item as any)[k]));
      const combinedText = fieldValues.join(' ');

      // Todos los tokens deben encontrarse en el texto consolidado
      const allTokensFound = tokens.every(token => combinedText.includes(token));

      if (allTokensFound) {
        let score = 0;
        tokens.forEach(token => {
          // Ponderar campos principales (ej. nombre o nombreComercial)
          const primaryField = fieldValues[0] || '';
          if (primaryField.includes(token)) {
            score += 15;
            if (primaryField.startsWith(token)) score += 10;
          }
          // Ponderar coincidencias de palabras completas
          if (combinedText.includes(` ${token} `) || combinedText.startsWith(`${token} `) || combinedText.endsWith(` ${token}`)) {
            score += 8;
          }
        });
        tokenMatches.push({ item, score });
      }
    }

    if (tokenMatches.length > 0) {
      tokenMatches.sort((a, b) => b.score - a.score);
      const results = tokenMatches.map(m => m.item);
      if (exactMatch && !results.includes(exactMatch)) {
        results.unshift(exactMatch);
      }
      return results;
    }

    // 3. Respaldo: Fuse.js (Fuzzy Search tolerante a errores de escritura / typos)
    try {
      const fuseKeys = keys.map(k => ({
        name: k,
        weight: weights[k] || (k.toLowerCase().includes('nombre') || k.toLowerCase().includes('producto') ? 2 : 1)
      }));

      const fuseOptions: IFuseOptions<T> = {
        keys: fuseKeys,
        threshold: 0.45,
        ignoreLocation: true,
        minMatchCharLength: 2,
        shouldSort: true
      };

      const fuse = new Fuse(list, fuseOptions);

      // Si la consulta tiene múltiples palabras y no hubo coincidencia exacta de tokens,
      // buscar por cada token difuso y hallar la intersección
      if (tokens.length > 1) {
        const tokenResultSets = tokens.map(token => {
          return new Set(fuse.search(token).map(r => r.item));
        });

        const intersection = list.filter(item => {
          return tokenResultSets.every(set => set.has(item));
        });

        if (intersection.length > 0) {
          return intersection;
        }
      }

      // Búsqueda difusa global con la consulta completa
      const fuseResults = fuse.search(rawQuery).map(r => r.item);
      if (fuseResults.length > 0) {
        return fuseResults;
      }
    } catch (e) {
      console.warn('Aviso en búsqueda difusa Fuse:', e);
    }

    return [];
  }
}

