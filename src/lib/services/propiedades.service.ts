// src/lib/services/propiedades.service.ts
import { supabase } from '../supabase/client';
import type { Propiedad, Torre } from '../../types';

export const propiedadesService = {
  // ============ MÉTODO PARA PÚBLICO (sin autenticación) ============
  
  // Obtener todas las propiedades para la página pública
  async getAllPublic(): Promise<Propiedad[]> {
    console.log('🔍 Obteniendo propiedades (público)...');
    
    const { data, error } = await supabase
      .from('propiedades')
      .select('*, torres(*)')
      .order('nombre');

    if (error) {
      console.error('❌ Error fetching propiedades (público):', error);
      throw error;
    }

    console.log(`✅ ${data?.length || 0} propiedades encontradas (público)`);
    return data || [];
  },

  // ============ MÉTODOS PARA ADMIN (con autenticación) ============
  
  // Obtener todas las propiedades (admin)
  async getAll(): Promise<Propiedad[]> {
    console.log('🔍 Obteniendo propiedades (admin)...');
    
    const { data, error } = await supabase
      .from('propiedades')
      .select('*, torres(*)')
      .order('nombre');

    if (error) {
      console.error('❌ Error fetching propiedades (admin):', error);
      throw error;
    }

    console.log(`✅ ${data?.length || 0} propiedades encontradas (admin)`);
    return data || [];
  },

  // Obtener propiedad por ID
  async getById(id: string): Promise<Propiedad | null> {
    const { data, error } = await supabase
      .from('propiedades')
      .select('*, torres(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching propiedad:', error);
      throw error;
    }

    return data;
  },

  // Crear nueva propiedad
  async create(propiedad: Omit<Propiedad, 'id' | 'created_at' | 'updated_at' | 'torres'>): Promise<Propiedad> {
    const { data, error } = await supabase
      .from('propiedades')
      .insert([propiedad])
      .select()
      .single();

    if (error) {
      console.error('Error creating propiedad:', error);
      throw error;
    }

    return data;
  },

  // Actualizar propiedad
  async update(id: string, propiedad: Partial<Propiedad>): Promise<Propiedad> {
    const { data, error } = await supabase
      .from('propiedades')
      .update(propiedad)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating propiedad:', error);
      throw error;
    }

    return data;
  },

  // Eliminar propiedad
  async delete(id: string): Promise<void> {
    const { data: propiedad, error: checkError } = await supabase
      .from('propiedades')
      .select('id, nombre')
      .eq('id', id)
      .single();

    if (checkError) {
      console.error('❌ Error verificando propiedad:', checkError);
      throw new Error('Propiedad no encontrada');
    }

    const { error: deleteError } = await supabase
      .from('propiedades')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('❌ Error eliminando propiedad:', deleteError);
      throw deleteError;
    }
  },

  // ============ TORRES ============

  // Obtener torres de una propiedad
  async getTorres(propiedadId: string): Promise<Torre[]> {
    const { data, error } = await supabase
      .from('torres')
      .select('*')
      .eq('propiedad_id', propiedadId)
      .order('nombre');

    if (error) {
      console.error('Error fetching torres:', error);
      throw error;
    }

    return data || [];
  },

  // Crear torre
  async createTorre(torre: Omit<Torre, 'id' | 'created_at' | 'updated_at'>): Promise<Torre> {
    const { data, error } = await supabase
      .from('torres')
      .insert([torre])
      .select()
      .single();

    if (error) {
      console.error('Error creating torre:', error);
      throw error;
    }

    return data;
  },

  // Eliminar torre
  async deleteTorre(id: string): Promise<void> {
    const { error } = await supabase
      .from('torres')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error eliminando torre:', error);
      throw error;
    }
  },

  // ============ PROPIETARIOS POR PROPIEDAD ============

  // Obtener propietarios de una propiedad
  async getPropietariosByPropiedad(propiedadId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('propietarios')
      .select(`
        *,
        torre:torres(
          id,
          nombre,
          numero_pisos
        ),
        propiedad:propiedades(
          id,
          nombre,
          ciudad,
          estado
        )
      `)
      .eq('propiedad_id', propiedadId)
      .order('nombre');

    if (error) {
      console.error('Error fetching propietarios by propiedad:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener estadísticas de una propiedad
  async getEstadisticasPropiedad(propiedadId: string, mes: string): Promise<{
    totalPropietarios: number;
    alDia: number;
    morosos: number;
    ingresos: number;
    parciales: number;
  }> {
    const propietarios = await this.getPropietariosByPropiedad(propiedadId);
    
    const { data: pagos, error } = await supabase
      .from('pagos')
      .select('estado, monto_usd')
      .eq('propiedad_id', propiedadId)
      .eq('mes', mes);

    if (error) {
      console.error('Error fetching pagos for propiedad:', error);
      throw error;
    }

    const totalPropietarios = propietarios.length;
    const completos = pagos?.filter(p => p.estado === 'completo').length || 0;
    const parciales = pagos?.filter(p => p.estado === 'parcial').length || 0;
    const morosos = totalPropietarios - (completos + parciales);
    const ingresos = pagos?.reduce((sum, p) => sum + (p.monto_usd || 0), 0) || 0;

    return {
      totalPropietarios,
      alDia: completos,
      morosos,
      ingresos,
      parciales
    };
  },

  // Obtener propiedad por defecto
  async getDefaultPropiedad(): Promise<Propiedad | null> {
    const { data, error } = await supabase
      .from('propiedades')
      .select('*, torres(*)')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching default propiedad:', error);
      return null;
    }

    return data;
  },

  // Buscar propiedades
  async search(query: string): Promise<Propiedad[]> {
    const { data, error } = await supabase
      .from('propiedades')
      .select('*, torres(*)')
      .or(`nombre.ilike.%${query}%,ciudad.ilike.%${query}%,estado.ilike.%${query}%`)
      .order('nombre');

    if (error) {
      console.error('Error searching propiedades:', error);
      throw error;
    }

    return data || [];
  }
};