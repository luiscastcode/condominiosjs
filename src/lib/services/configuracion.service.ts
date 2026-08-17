// src/lib/services/configuracion.service.ts
import { supabase } from '../supabase/client';
import type { Configuracion, CanonHistorial } from '../../types';

export const configuracionService = {
  // Obtener configuración
  async getConfiguracion(): Promise<Configuracion | null> {
    const { data, error } = await supabase
      .from('configuracion')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching configuracion:', error);
      return null;
    }

    return data;
  },

  // Actualizar configuración general
  async updateConfiguracion(config: Partial<Configuracion>): Promise<Configuracion> {
    const existing = await this.getConfiguracion();
    
    if (!existing) {
      const { data, error } = await supabase
        .from('configuracion')
        .insert([config])
        .select()
        .single();

      if (error) {
        console.error('Error creating configuracion:', error);
        throw error;
      }

      return data;
    }

    const { data, error } = await supabase
      .from('configuracion')
      .update(config)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating configuracion:', error);
      throw error;
    }

    return data;
  },

  // ============ CANON MENSUAL ============

  // Obtener canon actual
  async getCanonActual(): Promise<number> {
    const config = await this.getConfiguracion();
    return config?.canon_actual || config?.cuota_mensual || 8;
  },

  // Obtener historial de cambios de canon
  async getHistorialCanon(): Promise<CanonHistorial[]> {
    const { data, error } = await supabase
      .from('canon_historial')
      .select('*')
      .order('fecha_inicio', { ascending: false });

    if (error) {
      console.error('Error fetching historial canon:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener canon para una fecha específica - CORREGIDO
  async getCanonPorFecha(fecha: string): Promise<number> {
    try {
      // Si la fecha es solo "YYYY-MM", convertir a "YYYY-MM-DD"
      let fechaCompleta = fecha;
      if (fecha && fecha.match(/^\d{4}-\d{2}$/)) {
        fechaCompleta = `${fecha}-01`; // Usar el primer día del mes
      }
      
      // Si la fecha es "YYYY-MM-DD", usarla tal cual
      // Si no es un formato válido, usar la fecha actual
      if (!fechaCompleta.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn(`Formato de fecha inválido: ${fecha}, usando fecha actual`);
        fechaCompleta = new Date().toISOString().split('T')[0];
      }

      const { data, error } = await supabase
        .from('canon_historial')
        .select('canon_usd')
        .lte('fecha_inicio', fechaCompleta)
        .or(`fecha_fin.is.null,fecha_fin.gte.${fechaCompleta}`)
        .order('fecha_inicio', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching canon por fecha:', error);
        return 8;
      }

      return data?.canon_usd || 8;
    } catch (error) {
      console.error('Error en getCanonPorFecha:', error);
      return 8;
    }
  },



// Actualizar canon mensual
async actualizarCanon(
  nuevoCanon: number, 
  fechaInicio: string,
  creado_por?: string
): Promise<CanonHistorial> {
  if (nuevoCanon <= 0) {
    throw new Error('El canon debe ser mayor a 0');
  }

  // ✅ Validar que la fecha sea válida
  const fecha = new Date(fechaInicio);
  if (isNaN(fecha.getTime())) {
    throw new Error('Fecha de inicio inválida');
  }

  // ✅ Formatear fecha a YYYY-MM-DD para la base de datos
  const fechaStr = fechaInicio; // Ya viene en formato YYYY-MM-DD del input date

  try {
    // 1. Desactivar el canon actual (poner fecha_fin = día anterior a la nueva fecha)
    const fechaFin = new Date(fecha);
    fechaFin.setDate(fechaFin.getDate() - 1);
    const fechaFinStr = fechaFin.toISOString().split('T')[0];

    const { error: deactivateError } = await supabase
      .from('canon_historial')
      .update({ 
        activo: false,
        fecha_fin: fechaFinStr
      })
      .eq('activo', true);

    if (deactivateError) {
      console.error('Error desactivando canon anterior:', deactivateError);
      throw deactivateError;
    }

    // 2. Crear nuevo canon
    const { data, error } = await supabase
      .from('canon_historial')
      .insert([{
        canon_usd: nuevoCanon,
        fecha_inicio: fechaStr,
        activo: true,
        creado_por: creado_por || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creando nuevo canon:', error);
      throw error;
    }

    // 3. Actualizar canon_actual en configuracion
    await this.updateConfiguracion({ canon_actual: nuevoCanon });

    return data;
  } catch (error) {
    console.error('Error en actualizarCanon:', error);
    throw error;
  }
},
  // ============ FECHA DE INICIO ============

  async getFechaInicioOperaciones(): Promise<string> {
    const config = await this.getConfiguracion();
    return config?.fecha_inicio_operaciones || '2024-01-01';
  },

  async setFechaInicioOperaciones(fecha: string): Promise<Configuracion> {
    return await this.updateConfiguracion({ fecha_inicio_operaciones: fecha });
  },

  // ============ TASA DE CAMBIO ============

  async getTasaCambio(): Promise<number> {
    const config = await this.getConfiguracion();
    return config?.tasa_cambio || 36.50;
  },

  // ============ DÍA DE COBRO ============

  async getDiaCobro(): Promise<number> {
    const config = await this.getConfiguracion();
    return config?.dia_cobro || 10;
  }
};