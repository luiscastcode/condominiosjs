// src/lib/services/dolarapi.service.ts

export interface TasaDolarAPI {
  fuente: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fecha: string;
}

export interface TasaDolarActual {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string; // Formato: "2026-07-31T00:00:00-04:00"
}

export const dolarapiService = {
  // Obtener tasa de cambio del día actual (Oficial)
  async getTasaActualOficial(): Promise<TasaDolarActual | null> {
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!response.ok) {
        throw new Error('Error al obtener tasa actual');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching tasa actual oficial:', error);
      return null;
    }
  },

  // Obtener la tasa del día en formato estándar (solo para información)
  async getTasaDiaFormateada(): Promise<{
    moneda: string;
    promedio: number;
    fecha: string;
    fechaFormateada: string;
  } | null> {
    try {
      const data = await this.getTasaActualOficial();
      if (!data) return null;
      
      // Formatear fecha a estándar español (dd/mm/yyyy - hh:mm)
      const fecha = new Date(data.fechaActualizacion);
      const fechaFormateada = fecha.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        moneda: data.moneda,
        promedio: data.promedio,
        fecha: data.fechaActualizacion,
        fechaFormateada: fechaFormateada
      };
    } catch (error) {
      console.error('Error formateando tasa del día:', error);
      return null;
    }
  },

  // Obtener todas las tasas históricas
  async getTasasHistoricas(): Promise<TasaDolarAPI[]> {
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/historicos/dolares/oficial');
      if (!response.ok) {
        throw new Error('Error al obtener tasas históricas');
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        console.error('La respuesta no es un array:', data);
        return [];
      }
      return data;
    } catch (error) {
      console.error('Error fetching tasas historicas:', error);
      return [];
    }
  },

  // Obtener tasa para una fecha específica (usa histórico)
  async getTasaPorFecha(fecha: string): Promise<TasaDolarAPI | null> {
    try {
      const historicas = await this.getTasasHistoricas();
      if (!historicas || historicas.length === 0) {
        console.warn('No hay tasas históricas disponibles');
        return null;
      }
      
      const fechaObj = new Date(fecha);
      fechaObj.setHours(0, 0, 0, 0);
      
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      // Si la fecha es hoy o futura, usar la más reciente
      if (fechaObj >= hoy) {
        const ultima = historicas[historicas.length - 1];
        return ultima || null;
      }
      
      // Buscar la tasa más cercana anterior a la fecha
      let tasaEncontrada: TasaDolarAPI | null = null;
      
      for (const tasa of historicas) {
        const fechaTasa = new Date(tasa.fecha);
        fechaTasa.setHours(0, 0, 0, 0);
        
        if (fechaTasa <= fechaObj) {
          tasaEncontrada = tasa;
        } else {
          break;
        }
      }
      
      if (!tasaEncontrada && historicas.length > 0) {
        tasaEncontrada = historicas[0];
        console.log(`⚠️ No se encontró tasa para ${fecha}, usando la más antigua: ${tasaEncontrada.fecha}`);
      }
      
      return tasaEncontrada;
    } catch (error) {
      console.error('Error fetching tasa por fecha:', error);
      return null;
    }
  },

  // Obtener la tasa más reciente (del histórico)
  async getTasaActual(): Promise<TasaDolarAPI | null> {
    try {
      const historicas = await this.getTasasHistoricas();
      if (!historicas || historicas.length === 0) {
        console.warn('No hay tasas históricas disponibles');
        return null;
      }
      return historicas[historicas.length - 1];
    } catch (error) {
      console.error('Error fetching tasa actual:', error);
      return null;
    }
  }
};