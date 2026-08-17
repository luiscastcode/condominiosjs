// src/lib/services/pagos.service.ts
import { supabase } from '../supabase/client';
import { configuracionService } from './configuracion.service';
import { evaluarPago } from '../utils/monto.utils';
import type { Pago, DesglosePago, TasaCambioHistorial } from '../../types';

export const pagosService = {
  // ============ TASA DE CAMBIO ============

  // Obtener la última tasa de cambio registrada
  async getUltimaTasa(): Promise<number> {
    const { data, error } = await supabase
      .from('tasa_cambio_historial')
      .select('tasa')
      .order('fecha', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching ultima tasa:', error);
      return 36.50;
    }

    return data?.tasa || 36.50;
  },

  // Obtener tasa de cambio actual (la más reciente con todos los datos)
  async getTasaCambioActual(): Promise<TasaCambioHistorial | null> {
    const { data, error } = await supabase
      .from('tasa_cambio_historial')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching tasa cambio:', error);
      throw error;
    }

    return data || null;
  },

  // Guardar nueva tasa de cambio
  async guardarTasaCambio(tasa: number, creado_por?: string): Promise<TasaCambioHistorial> {
    if (tasa <= 0) {
      throw new Error('La tasa debe ser mayor a 0');
    }

    const { data, error } = await supabase
      .from('tasa_cambio_historial')
      .insert([{ 
        tasa, 
        fecha: new Date().toISOString().split('T')[0],
        creado_por: creado_por || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error saving tasa cambio:', error);
      throw error;
    }

    return data;
  },

  // Obtener historial de tasa de cambio
  async getHistorialTasaCambio(limit: number = 30): Promise<TasaCambioHistorial[]> {
    const { data, error } = await supabase
      .from('tasa_cambio_historial')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching historial tasa:', error);
      throw error;
    }

    return data || [];
  },

  // ============ RECARGAS PENDIENTES ============

  // Obtener recargas pendientes de un propietario
  async getRecargasPendientes(propietarioId: string): Promise<any[]> {
    try {
      // Obtener todas las recargas del propietario
      const { data: recargas, error: recargasError } = await supabase
        .from('recargas_wallet')
        .select('*')
        .eq('propietario_id', propietarioId)
        .order('fecha_recibo', { ascending: true });

      if (recargasError) {
        console.error('Error fetching recargas:', recargasError);
        return [];
      }

      if (!recargas || recargas.length === 0) {
        return [];
      }

      // Obtener los desgloses de pagos para saber qué recargas ya fueron usadas
      const { data: pagos, error: pagosError } = await supabase
        .from('pagos')
        .select('desglose_pagos')
        .eq('propietario_id', propietarioId);

      if (pagosError) {
        console.warn('Error verificando pagos:', pagosError);
      }

      // Extraer recargas usadas de los desgloses y calcular montos usados por recarga
      const recargasUsadas: { [key: string]: number } = {};
      if (pagos) {
        pagos.forEach(pago => {
          if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
            pago.desglose_pagos.forEach((item: any) => {
              if (item.recarga_id) {
                recargasUsadas[item.recarga_id] = (recargasUsadas[item.recarga_id] || 0) + (item.monto_bs || 0);
              }
            });
          }
        });
      }

      // Procesar cada recarga
      const recargasProcesadas = recargas.map(recarga => {
        // Calcular monto disponible restando lo ya usado
        const montoUsado = recargasUsadas[recarga.id] || 0;
        const montoOriginal = recarga.monto_bs || 0;
        const montoDisponible = montoOriginal - montoUsado;

        // Determinar estado de distribución
        let estadoDistribucion = recarga.estado_distribucion || 'pendiente';
        if (montoDisponible <= 0) {
          estadoDistribucion = 'completada';
        } else if (montoDisponible < montoOriginal) {
          estadoDistribucion = 'parcial';
        }

        return {
          ...recarga,
          monto_disponible_bs: montoDisponible,
          monto_original: montoOriginal,
          monto_usado: montoUsado,
          estado_distribucion: estadoDistribucion
        };
      });

      // Filtrar solo recargas con monto disponible > 0
      const recargasDisponibles = recargasProcesadas.filter(r => r.monto_disponible_bs > 0);

      return recargasDisponibles;
    } catch (error) {
      console.error('Error en getRecargasPendientes:', error);
      return [];
    }
  },

  // Obtener meses de deuda de un propietario
  async getMesesDeuda(propietarioId: string): Promise<any[]> {
    // Obtener fecha de inicio de operaciones
    const fechaInicio = await configuracionService.getFechaInicioOperaciones();
    const [yearInicio, monthInicio] = fechaInicio.split('-').map(Number);
    
    const hoy = new Date();
    const yearActual = hoy.getFullYear();
    const monthActual = hoy.getMonth() + 1;

    const meses = [];
    let year = yearInicio;
    let month = monthInicio;

    while (year < yearActual || (year === yearActual && month <= monthActual)) {
      const mesKey = `${year}-${String(month).padStart(2, '0')}`;
      meses.push(mesKey);
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    // Obtener pagos existentes para estos meses
    const { data: pagos, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('propietario_id', propietarioId)
      .in('mes', meses);

    if (error) {
      console.error('Error fetching pagos:', error);
      throw error;
    }

    // Procesar cada mes con su deuda
    const resultado = await Promise.all(meses.map(async (mes) => {
      const pago = pagos?.find(p => p.mes === mes);
      const canon = await configuracionService.getCanonPorFecha(mes);
      
      if (pago) {
        // Si hay pago, calcular deuda restante
        const deudaRestante = pago.estado === 'completo' ? 0 : Math.max(0, canon - pago.monto_usd);
        return {
          mes,
          canon,
          deuda_restante_usd: deudaRestante,
          estado: pago.estado,
          monto_pagado_usd: pago.monto_usd || 0,
          monto_pagado_bs: pago.monto_bs || 0,
          abono_restante: pago.abono_restante || 0,
          pago_id: pago.id,
          desglose_pagos: pago.desglose_pagos || []
        };
      } else {
        // Mes sin pago
        return {
          mes,
          canon,
          deuda_restante_usd: canon,
          estado: 'pendiente',
          monto_pagado_usd: 0,
          monto_pagado_bs: 0,
          abono_restante: 0,
          pago_id: null,
          desglose_pagos: []
        };
      }
    }));

    return resultado;
  },

  // ============ DISTRIBUCIÓN DE RECARGAS ============

  // Distribuir una recarga entre meses
  async distribuirRecarga(
    recargaId: string,
    propietarioId: string,
    asignaciones: { mes: string; monto_bs: number }[],
    tasaCambio: number,
    redondeos?: { [mes: string]: boolean } // Nuevo: opciones de redondeo por mes
  ): Promise<{ success: boolean; message: string }> {
    // 1. Verificar recarga
    const { data: recarga, error: recargaError } = await supabase
      .from('recargas_wallet')
      .select('*')
      .eq('id', recargaId)
      .single();

    if (recargaError || !recarga) {
      throw new Error('Recarga no encontrada');
    }

    // Calcular disponibilidad real
    const { data: pagos, error: pagosError } = await supabase
      .from('pagos')
      .select('desglose_pagos')
      .eq('propietario_id', propietarioId);

    if (pagosError) {
      console.error('Error verificando pagos:', pagosError);
    }

    // Calcular monto ya usado de esta recarga
    let montoUsado = 0;
    if (pagos) {
      pagos.forEach(pago => {
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
          pago.desglose_pagos.forEach((item: any) => {
            if (item.recarga_id === recargaId) {
              montoUsado += (item.monto_bs || 0);
            }
          });
        }
      });
    }

    const montoOriginal = recarga.monto_bs || 0;
    const montoDisponible = montoOriginal - montoUsado;

    const totalAsignado = asignaciones.reduce((sum, a) => sum + a.monto_bs, 0);

    if (totalAsignado > montoDisponible) {
      throw new Error(`El total asignado (${totalAsignado} Bs) supera el monto disponible (${montoDisponible} Bs). La recarga original era de ${montoOriginal} Bs y ya se usaron ${montoUsado} Bs.`);
    }

    // 2. Procesar cada asignación con lógica de redondeo
    for (const asignacion of asignaciones) {
      if (asignacion.monto_bs <= 0) continue;
      
      const montoUsd = asignacion.monto_bs / tasaCambio;
      
      // Buscar pago existente para este mes
      const { data: pagoExistente, error: pagoError } = await supabase
        .from('pagos')
        .select('*')
        .eq('propietario_id', propietarioId)
        .eq('mes', asignacion.mes)
        .maybeSingle();

      if (pagoError) {
        console.error('Error buscando pago existente:', pagoError);
        continue;
      }

      // Obtener canon del mes
      const canon = await configuracionService.getCanonPorFecha(asignacion.mes);
      
      // Evaluar si el pago debe redondearse
      const evaluacion = evaluarPago(montoUsd, canon);
      let montoUsdFinal = montoUsd;
      let montoBsFinal = asignacion.monto_bs;
      let redondeoAplicado = false;
      let observacion = '';
      
      // Aplicar lógica de redondeo si el admin lo confirmó
      if (redondeos && redondeos[asignacion.mes] === true && evaluacion.estado === 'PAGADO' && evaluacion.montoRedondeado) {
        montoUsdFinal = evaluacion.montoRedondeado;
        montoBsFinal = evaluacion.montoRedondeado * tasaCambio;
        redondeoAplicado = true;
        observacion = `Redondeo aplicado: $${montoUsd.toFixed(2)} -> $${evaluacion.montoRedondeado.toFixed(2)} (${formatDate(new Date())})`;
      }

      if (pagoExistente) {
        // Actualizar pago existente
        const nuevoMontoUsd = (pagoExistente.monto_usd || 0) + montoUsdFinal;
        const nuevoMontoBs = (pagoExistente.monto_bs || 0) + montoBsFinal;
        
        const deudaRestante = Math.max(0, canon - nuevoMontoUsd);
        
        // Calcular estado y abono restante
        let estado = 'pendiente';
        let abonoRestante = 0;
        
        if (nuevoMontoUsd >= canon) {
          estado = 'completo';
          abonoRestante = nuevoMontoUsd - canon;
        } else if (nuevoMontoUsd > 0) {
          estado = 'parcial';
          abonoRestante = canon - nuevoMontoUsd;
        }
        
        // Actualizar desglose de pagos
        let desglose = pagoExistente.desglose_pagos || [];
        const nuevoDesglose = {
          mes: asignacion.mes,
          monto_usd: montoUsdFinal,
          monto_bs: montoBsFinal,
          tasa_cambio: tasaCambio,
          fecha: new Date().toISOString().split('T')[0],
          recarga_id: recargaId,
          redondeo_aplicado: redondeoAplicado,
          observacion: observacion,
          monto_original_usd: montoUsd, // Guardar el monto original sin redondear
          monto_original_bs: asignacion.monto_bs
        };
        
        desglose.push(nuevoDesglose);
        
        // Actualizar pago
        const { error: updateError } = await supabase
          .from('pagos')
          .update({
            monto_usd: nuevoMontoUsd,
            monto_bs: nuevoMontoBs,
            estado: estado,
            abono_restante: abonoRestante,
            desglose_pagos: desglose,
            fecha_pago: new Date().toISOString().split('T')[0],
            fecha_registro: new Date().toISOString().split('T')[0]
          })
          .eq('id', pagoExistente.id);
        
        if (updateError) {
          console.error('Error actualizando pago:', updateError);
          throw updateError;
        }
      } else {
        // Crear nuevo pago para este mes
        const estado = montoUsdFinal >= canon ? 'completo' : 'parcial';
        const abonoRestante = montoUsdFinal >= canon ? montoUsdFinal - canon : canon - montoUsdFinal;
        
        const { error: insertError } = await supabase
          .from('pagos')
          .insert([{
            propietario_id: propietarioId,
            propiedad_id: recarga.propiedad_id || null,
            monto_usd: montoUsdFinal,
            monto_bs: montoBsFinal,
            tasa_cambio: tasaCambio,
            forma_pago: recarga.forma_pago || 'transferencia',
            banco_origen: recarga.banco_origen || 'No especificado',
            banco_destino: 'No especificado',
            numero_referencia: recarga.numero_referencia || 'N/A',
            fecha_pago: recarga.fecha_recibo || new Date().toISOString().split('T')[0],
            fecha_registro: new Date().toISOString().split('T')[0],
            mes: asignacion.mes,
            estado: estado,
            abono_restante: abonoRestante,
            desglose_pagos: [{
              mes: asignacion.mes,
              monto_usd: montoUsdFinal,
              monto_bs: montoBsFinal,
              tasa_cambio: tasaCambio,
              fecha: recarga.fecha_recibo || new Date().toISOString().split('T')[0],
              recarga_id: recargaId,
              redondeo_aplicado: redondeoAplicado,
              observacion: observacion,
              monto_original_usd: montoUsd,
              monto_original_bs: asignacion.monto_bs
            }]
          }]);

        if (insertError) {
          console.error('Error creando pago:', insertError);
          throw insertError;
        }
      }
    }

    return {
      success: true,
      message: `Distribución exitosa. Total asignado: ${totalAsignado} Bs ($${ (totalAsignado / tasaCambio).toFixed(2) })`
    };
  },

  // ============ REGISTRO DE PAGOS ============

  // Calcular desglose de pago para múltiples meses
  calcularDesglosePago(
    montoTotal: number,
    cuotaMensual: number,
    mesInicio: string,
    mesesAtraso: number = 0
  ): {
    meses: DesglosePago[];
    abonoRestante: number;
    mesesCubiertos: string[];
    totalCubierto: number;
  } {
    const meses: DesglosePago[] = [];
    let montoRestante = montoTotal;
    let abonoRestante = 0;
    const mesesCubiertos: string[] = [];

    const [year, month] = mesInicio.split('-').map(Number);
    const fechaInicio = new Date(year, month - 1, 1);
    const totalMeses = Math.max(mesesAtraso + 1, 1);

    for (let i = 0; i < totalMeses; i++) {
      const fechaMes = new Date(fechaInicio);
      fechaMes.setMonth(fechaMes.getMonth() + i);
      const mesStr = `${fechaMes.getFullYear()}-${String(fechaMes.getMonth() + 1).padStart(2, '0')}`;
      
      if (montoRestante >= cuotaMensual) {
        meses.push({
          mes: mesStr,
          monto_usd: cuotaMensual,
          monto_bs: 0,
          tasa_cambio: 0,
          estado: 'completo',
          abono_restante: 0
        });
        montoRestante -= cuotaMensual;
        mesesCubiertos.push(mesStr);
      } else if (montoRestante > 0) {
        meses.push({
          mes: mesStr,
          monto_usd: montoRestante,
          monto_bs: 0,
          tasa_cambio: 0,
          estado: 'parcial',
          abono_restante: cuotaMensual - montoRestante
        });
        abonoRestante = cuotaMensual - montoRestante;
        mesesCubiertos.push(mesStr);
        montoRestante = 0;
      } else {
        meses.push({
          mes: mesStr,
          monto_usd: 0,
          monto_bs: 0,
          tasa_cambio: 0,
          estado: 'pendiente',
          abono_restante: cuotaMensual
        });
      }
    }

    return {
      meses,
      abonoRestante,
      mesesCubiertos,
      totalCubierto: meses.filter(m => m.estado === 'completo').length
    };
  },

  // Registrar pago simple (sin desglose)
  async create(pago: Omit<Pago, 'id' | 'created_at'>): Promise<Pago> {
    if (pago.monto_usd < 0) {
      throw new Error('El monto no puede ser negativo');
    }

    if (pago.forma_pago !== 'efectivo') {
      if (!pago.banco_origen) {
        throw new Error('Debes especificar el banco de origen');
      }
      if (!pago.numero_referencia) {
        throw new Error('Debes ingresar el número de referencia');
      }
    }

    let tasaCambio = pago.tasa_cambio;
    if (!tasaCambio || tasaCambio === 0) {
      tasaCambio = await this.getUltimaTasa();
      console.log(`💱 Usando tasa automática: Bs ${tasaCambio}`);
    }

    const montoBs = pago.monto_usd * tasaCambio;
    const mes = pago.mes || new Date().toISOString().slice(0, 7);

    const dataToInsert = {
      ...pago,
      mes: mes,
      tasa_cambio: tasaCambio,
      monto_bs: montoBs,
      banco_origen: pago.banco_origen || 'EFECTIVO',
      numero_referencia: pago.numero_referencia || 'EFECTIVO',
      banco_destino: pago.banco_destino || 'No especificado',
     // ✅ Campos nuevos
    distribuido: pago.distribuido !== undefined ? pago.distribuido : false,
    fecha_distribucion: pago.fecha_distribucion || null,
    desglose_pagos: pago.desglose_pagos || null,
    estado: pago.estado || 'pendiente'
    };

    const { data, error } = await supabase
      .from('pagos')
      .insert([dataToInsert])
      .select()
      .single();

    if (error) {
      console.error('Error creating pago:', error);
      throw error;
    }

    return data;
  },

  // Registrar pago con desglose (múltiples meses)
  async registrarPagoConDesglose(
    pagoData: Omit<Pago, 'id' | 'created_at'>,
    desglose: DesglosePago[],
    mesesCubiertos: string[]
  ): Promise<Pago> {
    if (pagoData.monto_usd < 0) {
      throw new Error('El monto no puede ser negativo');
    }

    if (pagoData.forma_pago !== 'efectivo') {
      if (!pagoData.banco_origen) {
        throw new Error('Debes especificar el banco de origen');
      }
      if (!pagoData.numero_referencia) {
        throw new Error('Debes ingresar el número de referencia');
      }
    }

    let tasaCambio = pagoData.tasa_cambio;
    if (!tasaCambio || tasaCambio === 0) {
      tasaCambio = await this.getUltimaTasa();
      console.log(`💱 Usando tasa automática para desglose: Bs ${tasaCambio}`);
    }

    const desgloseConBs = desglose.map(mes => ({
      ...mes,
      monto_bs: mes.monto_usd * tasaCambio,
      tasa_cambio: tasaCambio
    }));

    const montoTotalBs = pagoData.monto_usd * tasaCambio;
    const mes = pagoData.mes || new Date().toISOString().slice(0, 7);

    const dataToInsert = {
      ...pagoData,
      mes: mes,
      tasa_cambio: tasaCambio,
      monto_bs: montoTotalBs,
      banco_origen: pagoData.banco_origen || 'EFECTIVO',
      numero_referencia: pagoData.numero_referencia || 'EFECTIVO',
      banco_destino: pagoData.banco_destino || 'No especificado',
      meses_cubiertos: mesesCubiertos,
      desglose_pagos: desgloseConBs
    };

    const { data, error } = await supabase
      .from('pagos')
      .insert([dataToInsert])
      .select()
      .single();

    if (error) {
      console.error('Error creating pago with desglose:', error);
      throw error;
    }

    return data;
  },

  // Obtener desglose de un pago
  async getDesglosePago(pagoId: string): Promise<DesglosePago[] | null> {
    const { data, error } = await supabase
      .from('pagos')
      .select('desglose_pagos')
      .eq('id', pagoId)
      .single();

    if (error) {
      console.error('Error fetching desglose:', error);
      throw error;
    }

    return data?.desglose_pagos || null;
  },

  // Actualizar pago
  async update(id: string, pago: Partial<Pago>): Promise<Pago> {
    if (pago.forma_pago && pago.forma_pago !== 'efectivo') {
      if (pago.banco_origen === undefined || pago.banco_origen === '') {
        throw new Error('Debes especificar el banco de origen');
      }
      if (pago.numero_referencia === undefined || pago.numero_referencia === '') {
        throw new Error('Debes ingresar el número de referencia');
      }
    }

    const dataToUpdate = {
      ...pago,
      banco_origen: pago.banco_origen || null,
      banco_destino: pago.banco_destino || null,
      numero_referencia: pago.numero_referencia || null,
    };

    const { data, error } = await supabase
      .from('pagos')
      .update(dataToUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating pago:', error);
      throw error;
    }

    return data;
  },

  // Eliminar pago
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('pagos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting pago:', error);
      throw error;
    }
  },

  // ============ CONSULTAS ============

  // Obtener todos los pagos
  async getAll(): Promise<Pago[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select(`
        *,
        propietarios(
          nombre,
          apartamento,
          propiedad_id,
          torre_id,
          wallet_bs,
          wallet_usd
        ),
        propiedades(
          id,
          nombre,
          banco_nombre,
          banco_cuenta
        )
      `)
      .order('fecha_pago', { ascending: false });

    if (error) {
      console.error('Error fetching pagos:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener pagos por mes
  async getByMes(mes: string): Promise<Pago[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select(`
        *,
        propietarios(
          nombre,
          apartamento,
          propiedad_id,
          torre_id,
          wallet_bs,
          wallet_usd
        ),
        propiedades(
          id,
          nombre,
          banco_nombre,
          banco_cuenta
        )
      `)
      .eq('mes', mes)
      .order('fecha_pago', { ascending: false });

    if (error) {
      console.error('Error fetching pagos by mes:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener pagos por mes y propiedad
  async getByMesAndPropiedad(mes: string, propiedadId: string): Promise<Pago[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select(`
        *,
        propietarios(
          nombre,
          apartamento,
          propiedad_id,
          torre_id,
          wallet_bs,
          wallet_usd
        ),
        propiedades(
          id,
          nombre,
          banco_nombre,
          banco_cuenta
        )
      `)
      .eq('mes', mes)
      .eq('propiedad_id', propiedadId)
      .order('fecha_pago', { ascending: false });

    if (error) {
      console.error('Error fetching pagos by mes and propiedad:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener pago por ID
  async getById(id: string): Promise<Pago | null> {
    const { data, error } = await supabase
      .from('pagos')
      .select(`
        *,
        propietarios(
          nombre,
          apartamento,
          propiedad_id,
          torre_id,
          wallet_bs,
          wallet_usd
        ),
        propiedades(
          id,
          nombre,
          banco_nombre,
          banco_cuenta
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching pago:', error);
      throw error;
    }

    return data;
  },

  // Obtener pagos de un propietario
  async getByPropietario(propietarioId: string): Promise<Pago[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('propietario_id', propietarioId)
      .order('fecha_pago', { ascending: false });

    if (error) {
      console.error('Error fetching pagos by propietario:', error);
      throw error;
    }

    return data || [];
  },

  // ============ ESTADÍSTICAS ============

  // Obtener estadísticas de pagos por mes
  async getEstadisticasMes(mes: string): Promise<{
    total: number;
    completos: number;
    parciales: number;
    pendientes: number;
    recaudado: number;
    recaudado_bs: number;
  }> {
    const { data, error } = await supabase
      .from('pagos')
      .select('estado, monto_usd, monto_bs')
      .eq('mes', mes);

    if (error) {
      console.error('Error fetching estadisticas:', error);
      throw error;
    }

    const total = data.length;
    const completos = data.filter(p => p.estado === 'completo').length;
    const parciales = data.filter(p => p.estado === 'parcial').length;
    const pendientes = data.filter(p => p.estado === 'pendiente').length;
    const recaudado = data
      .filter(p => p.estado === 'completo' || p.estado === 'parcial')
      .reduce((sum, p) => sum + p.monto_usd, 0);
    const recaudado_bs = data
      .filter(p => p.estado === 'completo' || p.estado === 'parcial')
      .reduce((sum, p) => sum + p.monto_bs, 0);

    return { total, completos, parciales, pendientes, recaudado, recaudado_bs };
  },

  // Verificar si un propietario pagó en un mes específico
  async verificarPagoMes(propietarioId: string, mes: string): Promise<{
    pagado: boolean;
    monto?: number;
    estado?: string;
    abono_restante?: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('pagos')
        .select('estado, monto_usd, abono_restante')
        .eq('propietario_id', propietarioId)
        .eq('mes', mes);

      if (error) {
        console.error('Error fetching pagos:', error);
        return { pagado: false };
      }

      if (!data || data.length === 0) {
        return { pagado: false };
      }

      const totalMonto = data.reduce((sum, p) => sum + p.monto_usd, 0);
      const todosCompletos = data.every(p => p.estado === 'completo');
      const hayParcial = data.some(p => p.estado === 'parcial');

      let estado = 'pendiente';
      if (todosCompletos) {
        estado = 'completo';
      } else if (hayParcial) {
        estado = 'parcial';
      }

      const ultimoAbono = data.length > 0 ? data[data.length - 1].abono_restante : 0;

      return {
        pagado: estado === 'completo' || (estado === 'parcial' && totalMonto > 0),
        monto: totalMonto,
        estado: estado,
        abono_restante: ultimoAbono
      };
    } catch (error) {
      console.error('Error in verificarPagoMes:', error);
      return { pagado: false };
    }
  },

  // Obtener historial de pagos de un propietario
  async getHistorialPropietario(propietarioId: string, limit: number = 12): Promise<Pago[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('propietario_id', propietarioId)
      .order('fecha_pago', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching historial:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener resumen de pagos por propiedad
  async getResumenPropiedad(propiedadId: string, mes: string): Promise<{
    totalPropietarios: number;
    pagaron: number;
    noPagaron: number;
    parciales: number;
    recaudado: number;
    porcentajeCumplimiento: number;
  }> {
    const { data: propietarios, error: propError } = await supabase
      .from('propietarios')
      .select('id')
      .eq('propiedad_id', propiedadId);

    if (propError) {
      console.error('Error fetching propietarios:', propError);
      throw propError;
    }

    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select('estado, monto_usd')
      .eq('propiedad_id', propiedadId)
      .eq('mes', mes);

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      throw pagoError;
    }

    const totalPropietarios = propietarios.length;
    const pagaron = pagos.filter(p => p.estado === 'completo').length;
    const parciales = pagos.filter(p => p.estado === 'parcial').length;
    const noPagaron = totalPropietarios - pagaron - parciales;
    const recaudado = pagos.reduce((sum, p) => sum + p.monto_usd, 0);
    const porcentajeCumplimiento = totalPropietarios > 0 
      ? ((pagaron + parciales) / totalPropietarios) * 100 
      : 0;

    return {
      totalPropietarios,
      pagaron,
      noPagaron,
      parciales,
      recaudado,
      porcentajeCumplimiento
    };
  },

  // ============ DISTRIBUCIÓN DESDE WALLET (AMORTIZACIÓN - Legacy) ============

  // Distribuir desde wallet a meses con amortización
  // NOTA: Este método se mantiene por compatibilidad pero se recomienda usar distribuirRecarga
  async distribuirDesdeWallet(
    propietarioId: string,
    mesInicio: string,
    tasaCambio: number
  ): Promise<{
    mesesCubiertos: string[];
    desglose: DesglosePago[];
    saldoRestante: { wallet_bs: number; wallet_usd: number };
    totalCubierto: number;
    deudaTotal: { usd: number; bs: number };
    mesesPendientes: number;
  }> {
    console.log(`📊 Iniciando distribución desde wallet para propietario: ${propietarioId}`);
    
    const { data: propietario, error: propError } = await supabase
      .from('propietarios')
      .select('wallet_bs, wallet_usd, cuota_mensual, propiedad_id')
      .eq('id', propietarioId)
      .single();

    if (propError) {
      console.error('Error fetching propietario:', propError);
      throw propError;
    }

    const walletUsd = propietario?.wallet_usd || 0;
    const cuotaMensual = propietario?.cuota_mensual || 150;
    
    console.log(`💰 Saldo wallet: $${walletUsd.toFixed(2)}, Cuota mensual: $${cuotaMensual}`);
    
    if (walletUsd <= 0) {
      throw new Error('No hay saldo disponible en la wallet');
    }

    const fechaActual = new Date();
    const añoActual = fechaActual.getFullYear();
    const mesActual = fechaActual.getMonth() + 1;
    
    const todosLosMeses: string[] = [];
    for (let m = 1; m <= mesActual; m++) {
      todosLosMeses.push(`${añoActual}-${String(m).padStart(2, '0')}`);
    }
    console.log(`📅 Meses a evaluar: ${todosLosMeses.length} meses`);

    const mesesConEstado: { mes: string; pagado: boolean; montoPagado: number; deuda: number }[] = [];
    let deudaTotalUsd = 0;

    for (const mes of todosLosMeses) {
      const verificar = await this.verificarPagoMes(propietarioId, mes);
      const pagado = verificar.pagado || false;
      const montoPagado = verificar.monto || 0;
      const deuda = pagado ? 0 : Math.max(0, cuotaMensual - montoPagado);
      
      mesesConEstado.push({
        mes,
        pagado,
        montoPagado,
        deuda
      });
      
      if (!pagado) {
        deudaTotalUsd += deuda;
        console.log(`   📆 ${mes}: Deuda $${deuda.toFixed(2)} (pagado: $${montoPagado.toFixed(2)})`);
      } else {
        console.log(`   ✅ ${mes}: Pagado ($${montoPagado.toFixed(2)})`);
      }
    }

    const mesesPendientes = mesesConEstado.filter(m => !m.pagado && m.deuda > 0);
    console.log(`📋 Meses pendientes: ${mesesPendientes.length}`);
    
    const deudaTotalBs = deudaTotalUsd * tasaCambio;

    const desglose: DesglosePago[] = [];
    let montoRestante = walletUsd;
    const mesesCubiertos: string[] = [];
    let totalCubierto = 0;

    for (const mes of mesesPendientes) {
      const deudaPendiente = mes.deuda;
      console.log(`🔄 Procesando ${mes.mes}: Deuda $${deudaPendiente.toFixed(2)}, Saldo restante $${montoRestante.toFixed(2)}`);
      
      if (montoRestante >= deudaPendiente) {
        desglose.push({
          mes: mes.mes,
          monto_usd: deudaPendiente,
          monto_bs: deudaPendiente * tasaCambio,
          tasa_cambio: tasaCambio,
          estado: 'completo',
          abono_restante: 0
        });
        montoRestante -= deudaPendiente;
        mesesCubiertos.push(mes.mes);
        totalCubierto++;
        console.log(`   ✅ ${mes.mes}: Pagado completamente`);
      } else if (montoRestante > 0) {
        const nuevaDeuda = deudaPendiente - montoRestante;
        desglose.push({
          mes: mes.mes,
          monto_usd: montoRestante,
          monto_bs: montoRestante * tasaCambio,
          tasa_cambio: tasaCambio,
          estado: 'parcial',
          abono_restante: nuevaDeuda
        });
        mesesCubiertos.push(mes.mes);
        console.log(`   ⚠️ ${mes.mes}: Pago parcial $${montoRestante.toFixed(2)}, queda $${nuevaDeuda.toFixed(2)}`);
        montoRestante = 0;
        break;
      }
    }

    if (montoRestante > 0) {
      const siguienteMes = new Date(fechaActual);
      siguienteMes.setMonth(siguienteMes.getMonth() + 1);
      const mesStr = `${siguienteMes.getFullYear()}-${String(siguienteMes.getMonth() + 1).padStart(2, '0')}`;
      
      desglose.push({
        mes: mesStr,
        monto_usd: 0,
        monto_bs: 0,
        tasa_cambio: tasaCambio,
        estado: 'pendiente',
        abono_restante: montoRestante
      });
      console.log(`📌 Abono para ${mesStr}: $${montoRestante.toFixed(2)}`);
    }

    const mesesAunPendientes = mesesPendientes.filter(mes => {
      const encontrado = desglose.find(d => d.mes === mes.mes);
      return !encontrado || encontrado.estado === 'pendiente' || encontrado.estado === 'parcial';
    });
    console.log(`📊 Meses aún pendientes: ${mesesAunPendientes.length}`);

    const montoDescontado = walletUsd - montoRestante;
    const nuevoWalletUsd = montoRestante;
    const nuevoWalletBs = montoRestante * tasaCambio;
    console.log(`💳 Descontando: $${montoDescontado.toFixed(2)}, Nuevo saldo: $${nuevoWalletUsd.toFixed(2)}`);

    const { data: updatedPropietario, error: updateError } = await supabase
      .from('propietarios')
      .update({
        wallet_bs: nuevoWalletBs,
        wallet_usd: nuevoWalletUsd
      })
      .eq('id', propietarioId)
      .select('wallet_bs, wallet_usd')
      .single();

    if (updateError) {
      console.error('Error actualizando wallet:', updateError);
      throw updateError;
    }

    console.log('✅ Distribución completada');

    return {
      mesesCubiertos,
      desglose,
      saldoRestante: {
        wallet_bs: updatedPropietario?.wallet_bs || 0,
        wallet_usd: updatedPropietario?.wallet_usd || 0
      },
      totalCubierto,
      deudaTotal: {
        usd: deudaTotalUsd,
        bs: deudaTotalBs
      },
      mesesPendientes: mesesAunPendientes.length
    };
  }
};