// src/lib/services/propietarios.service.ts
import { supabase } from '../supabase/client';
import type { Propietario } from '../../types';

export const propietariosService = {
  // ============ CRUD BÁSICO ============

  // Obtener todos los propietarios
  async getAll(): Promise<Propietario[]> {
    const { data, error } = await supabase
      .from('propietarios')
      .select(`
        *,
        propiedad:propiedades(
          id,
          nombre,
          ciudad,
          estado,
          tiene_torres
        ),
        torre:torres(
          id,
          nombre,
          numero_pisos
        )
      `)
      .order('nombre');

    if (error) {
      console.error('Error fetching propietarios:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener propietarios por propiedad
  async getByPropiedad(propiedadId: string): Promise<Propietario[]> {
    const { data, error } = await supabase
      .from('propietarios')
      .select(`
        *,
        propiedad:propiedades(
          id,
          nombre,
          ciudad,
          estado
        ),
        torre:torres(
          id,
          nombre,
          numero_pisos
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

  // Obtener un propietario por ID
  async getById(id: string): Promise<Propietario | null> {
    const { data, error } = await supabase
      .from('propietarios')
      .select(`
        *,
        propiedad:propiedades(
          id,
          nombre,
          ciudad,
          estado,
          banco_nombre,
        banco_cuenta,
        banco_tipo_cuenta,
        banco_cedula_rif,
        telefono_contacto,
        email_contacto,
        horario_atencion,
          tiene_torres
        ),
        torre:torres(
          id,
          nombre,
          numero_pisos
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching propietario:', error);
      throw error;
    }

    return data;
  },

  // Obtener propietario por apartamento
  async getByApartamento(apartamento: string): Promise<Propietario | null> {
    const { data, error } = await supabase
      .from('propietarios')
      .select('*')
      .eq('apartamento', apartamento)
      .single();

    if (error) {
      console.error('Error fetching propietario by apartamento:', error);
      return null;
    }

    return data;
  },

  // Crear nuevo propietario
  async create(propietario: Omit<Propietario, 'id' | 'created_at' | 'updated_at'>): Promise<Propietario> {
    if (propietario.apartamento && propietario.apartamento.length > 50) {
      throw new Error('El apartamento no puede tener más de 50 caracteres');
    }

    if (!propietario.nombre || !propietario.email || !propietario.propiedad_id) {
      throw new Error('Nombre, email y propiedad son obligatorios');
    }

    const dataToInsert = {
      ...propietario,
      wallet_bs: 0,
      wallet_usd: 0
    };

    const { data, error } = await supabase
      .from('propietarios')
      .insert([dataToInsert])
      .select()
      .single();

    if (error) {
      console.error('Error creating propietario:', error);
      throw error;
    }

    return data;
  },

  // Actualizar propietario
  async update(id: string, propietario: Partial<Propietario>): Promise<Propietario> {
    if (propietario.apartamento && propietario.apartamento.length > 50) {
      throw new Error('El apartamento no puede tener más de 50 caracteres');
    }

    const { data, error } = await supabase
      .from('propietarios')
      .update(propietario)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating propietario:', error);
      throw error;
    }

    return data;
  },

  // Eliminar propietario
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('propietarios')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting propietario:', error);
      throw error;
    }
  },

  // ============ BÚSQUEDA Y FILTROS ============

  async search(query: string): Promise<Propietario[]> {
    const { data, error } = await supabase
      .from('propietarios')
      .select(`
        *,
        propiedad:propiedades(
          id,
          nombre,
          ciudad,
          estado
        ),
        torre:torres(
          id,
          nombre
        )
      `)
      .or(`nombre.ilike.%${query}%,apartamento.ilike.%${query}%,email.ilike.%${query}%,telefono.ilike.%${query}%`)
      .order('nombre');

    if (error) {
      console.error('Error searching propietarios:', error);
      throw error;
    }

    return data || [];
  },

  async searchByPropiedad(query: string, propiedadId: string): Promise<Propietario[]> {
    const { data, error } = await supabase
      .from('propietarios')
      .select(`
        *,
        propiedad:propiedades(
          id,
          nombre,
          ciudad,
          estado
        ),
        torre:torres(
          id,
          nombre
        )
      `)
      .eq('propiedad_id', propiedadId)
      .or(`nombre.ilike.%${query}%,apartamento.ilike.%${query}%,email.ilike.%${query}%`)
      .order('nombre');

    if (error) {
      console.error('Error searching propietarios by propiedad:', error);
      throw error;
    }

    return data || [];
  },

  // ============ ESTADOS DE PAGO ============

  async getMorosos(mes: string): Promise<Propietario[]> {
    const { data: propietarios, error: propError } = await supabase
      .from('propietarios')
      .select('*');

    if (propError) {
      console.error('Error fetching propietarios:', propError);
      throw propError;
    }

    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select('propietario_id, estado')
      .eq('mes', mes);

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      throw pagoError;
    }

    const propietariosConPago = new Set(
      pagos
        .filter(p => p.estado === 'completo')
        .map(p => p.propietario_id)
    );

    return propietarios.filter(p => !propietariosConPago.has(p.id));
  },

  async getAlDia(mes: string): Promise<Propietario[]> {
    const { data: propietarios, error: propError } = await supabase
      .from('propietarios')
      .select('*');

    if (propError) {
      console.error('Error fetching propietarios:', propError);
      throw propError;
    }

    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select('propietario_id, estado')
      .eq('mes', mes);

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      throw pagoError;
    }

    const propietariosConPago = new Set(
      pagos
        .filter(p => p.estado === 'completo')
        .map(p => p.propietario_id)
    );

    return propietarios.filter(p => propietariosConPago.has(p.id));
  },

  async getParciales(mes: string): Promise<Propietario[]> {
    const { data: propietarios, error: propError } = await supabase
      .from('propietarios')
      .select('*');

    if (propError) {
      console.error('Error fetching propietarios:', propError);
      throw propError;
    }

    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select('propietario_id, estado')
      .eq('mes', mes);

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      throw pagoError;
    }

    const propietariosConPagoParcial = new Set(
      pagos
        .filter(p => p.estado === 'parcial')
        .map(p => p.propietario_id)
    );

    return propietarios.filter(p => propietariosConPagoParcial.has(p.id));
  },

  // ============ ESTADÍSTICAS ============

  async getResumenPagos(mes: string): Promise<{
    total: number;
    alDia: number;
    morosos: number;
    parciales: number;
    sinRegistrar: number;
  }> {
    const propietarios = await this.getAll();
    const alDia = await this.getAlDia(mes);
    const morosos = await this.getMorosos(mes);
    const parciales = await this.getParciales(mes);
    const conPago = new Set([
      ...alDia.map(p => p.id),
      ...morosos.map(p => p.id),
      ...parciales.map(p => p.id)
    ]);
    const sinRegistrar = propietarios.filter(p => !conPago.has(p.id));

    return {
      total: propietarios.length,
      alDia: alDia.length,
      morosos: morosos.length,
      parciales: parciales.length,
      sinRegistrar: sinRegistrar.length
    };
  },

  // ============ WALLET ============

  // Obtener saldo de wallet de un propietario
  async getWallet(propietarioId: string): Promise<{ wallet_bs: number; wallet_usd: number }> {
    const { data, error } = await supabase
      .from('propietarios')
      .select('wallet_bs, wallet_usd')
      .eq('id', propietarioId)
      .single();

    if (error) {
      console.error('Error fetching wallet:', error);
      throw error;
    }

    return {
      wallet_bs: data?.wallet_bs || 0,
      wallet_usd: data?.wallet_usd || 0
    };
  },

  // Recargar wallet de un propietario - CORREGIDO
  async recargarWallet(
    propietarioId: string, 
    monto_bs: number, 
    tasa_cambio: number,
    forma_pago?: string,
    banco_origen?: string,
    numero_referencia?: string,
    fecha_recibo?: string // Agregar este parámetro
  ): Promise<{ wallet_bs: number; wallet_usd: number }> {
    if (monto_bs <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    if (tasa_cambio <= 0) {
      throw new Error('La tasa de cambio debe ser mayor a 0');
    }

    const monto_usd = monto_bs / tasa_cambio;
    console.log(`💰 Recargando wallet: Bs ${monto_bs} = $${monto_usd.toFixed(2)} (tasa: ${tasa_cambio})`);

    // 1. Obtener wallet actual
    const walletActual = await this.getWallet(propietarioId);
    console.log(`📊 Wallet actual: Bs ${walletActual.wallet_bs.toFixed(2)}, $${walletActual.wallet_usd.toFixed(2)}`);
    
    const nuevoWalletBs = walletActual.wallet_bs + monto_bs;
    const nuevoWalletUsd = walletActual.wallet_usd + monto_usd;
    console.log(`📊 Nuevo wallet: Bs ${nuevoWalletBs.toFixed(2)}, $${nuevoWalletUsd.toFixed(2)}`);

    // 2. Actualizar wallet del propietario
    const { data: propietario, error: updateError } = await supabase
      .from('propietarios')
      .update({
        wallet_bs: nuevoWalletBs,
        wallet_usd: nuevoWalletUsd,
        ultima_recarga: new Date().toISOString().split('T')[0]
      })
      .eq('id', propietarioId)
      .select('wallet_bs, wallet_usd')
      .single();

    if (updateError) {
      console.error('❌ Error recargando wallet:', updateError);
      throw updateError;
    }

    console.log(`✅ Wallet actualizada: Bs ${propietario?.wallet_bs?.toFixed(2)}, $${propietario?.wallet_usd?.toFixed(2)}`);

    // 3. Registrar la recarga en el historial
    if (forma_pago) {
      const { error: recargaError } = await supabase
        .from('recargas_wallet')
        .insert([{
          propietario_id: propietarioId,
          monto_bs: monto_bs,
          monto_usd: monto_usd,
          tasa_cambio: tasa_cambio,
          forma_pago: forma_pago || 'transferencia',
          banco_origen: banco_origen || null,
          banco_destino: null,
          numero_referencia: numero_referencia || null,
          fecha_recarga: new Date().toISOString().split('T')[0],
          fecha_recibo: fecha_recibo || new Date().toISOString().split('T')[0]
        }]);

      if (recargaError) {
        console.error('❌ Error registrando recarga:', recargaError);
      } else {
        console.log('✅ Recarga registrada en historial');
      }
    }

    return {
      wallet_bs: propietario?.wallet_bs || 0,
      wallet_usd: propietario?.wallet_usd || 0
    };
  },

  // Descontar de wallet para un pago - CORREGIDO
  async descontarWallet(
    propietarioId: string,
    monto_usd: number,
    tasa_cambio: number
  ): Promise<{ wallet_bs: number; wallet_usd: number }> {
    if (monto_usd <= 0) {
      throw new Error('El monto a descontar debe ser mayor a 0');
    }

    const monto_bs = monto_usd * tasa_cambio;
    console.log(`💳 Descontando de wallet: $${monto_usd.toFixed(2)} = Bs ${monto_bs.toFixed(2)}`);
    
    // Verificar que tenga suficiente saldo
    const wallet = await this.getWallet(propietarioId);
    console.log(`📊 Wallet actual: Bs ${wallet.wallet_bs.toFixed(2)}, $${wallet.wallet_usd.toFixed(2)}`);
    
    if (wallet.wallet_usd < monto_usd) {
      throw new Error(`Saldo insuficiente. Disponible: $${wallet.wallet_usd.toFixed(2)}, Necesario: $${monto_usd.toFixed(2)}`);
    }

    const nuevoWalletBs = wallet.wallet_bs - monto_bs;
    const nuevoWalletUsd = wallet.wallet_usd - monto_usd;
    console.log(`📊 Nuevo wallet: Bs ${nuevoWalletBs.toFixed(2)}, $${nuevoWalletUsd.toFixed(2)}`);

    // Descontar de wallet
    const { data, error } = await supabase
      .from('propietarios')
      .update({
        wallet_bs: nuevoWalletBs,
        wallet_usd: nuevoWalletUsd
      })
      .eq('id', propietarioId)
      .select('wallet_bs, wallet_usd')
      .single();

    if (error) {
      console.error('❌ Error descontando wallet:', error);
      throw error;
    }

    console.log(`✅ Wallet descontada: Bs ${data?.wallet_bs?.toFixed(2)}, $${data?.wallet_usd?.toFixed(2)}`);

    return {
      wallet_bs: data?.wallet_bs || 0,
      wallet_usd: data?.wallet_usd || 0
    };
  },

  // Obtener historial de recargas de un propietario
  async getHistorialRecargas(propietarioId: string, limit: number = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('recargas_wallet')
      .select('*')
      .eq('propietario_id', propietarioId)
      .order('fecha_recarga', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching historial recargas:', error);
      throw error;
    }

    return data || [];
  },

  // ============ VALIDACIONES ============

  async existeEmail(email: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('propietarios')
      .select('id')
      .eq('email', email);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking email:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  },

  async existeApartamento(apartamento: string, propiedadId: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('propietarios')
      .select('id')
      .eq('apartamento', apartamento)
      .eq('propiedad_id', propiedadId);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking apartamento:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  }
};