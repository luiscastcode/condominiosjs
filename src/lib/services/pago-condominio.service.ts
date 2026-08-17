// src/lib/services/pago-condominio.service.ts
import { supabase } from '../supabase/client';
import { configuracionService } from './configuracion.service';

export const pagoCondominioService = {
  /**
   * 🔄 Determina el estado de un mes basado en el monto pagado
   */
  determinarEstadoMes(pagado: number, canon: number): 'completo' | 'parcial' | 'pendiente' {
    if (pagado === 0) return 'pendiente';
    if (pagado >= 14.50) return 'completo';
    if (pagado > 0 && pagado < 14.50) return 'parcial';
    return 'pendiente';
  },

  /**
   * 🔄 Verifica si un mes es futuro (aún no ha llegado)
   */
  esMesFuturo(mesKey: string): boolean {
    const hoy = new Date();
    const [year, month] = mesKey.split('-').map(Number);
    
    if (year > hoy.getFullYear()) return true;
    if (year === hoy.getFullYear() && month > hoy.getMonth() + 1) return true;
    return false;
  },

  /**
   * 🔄 Función para redondear la deuda restante
   * Si la deuda es menor a $0.50, se considera pagada
   */
  redondearDeuda(deuda: number): number {
    if (deuda <= 0.50) return 0;
    return deuda;
  },

  /**
   * Obtiene los meses con su estado para un propietario
   * ✅ CORREGIDO: Aplica FIFO estricto desde cero
   */
  async getMesesMorosos(propietarioId: string): Promise<any[]> {
    try {
      console.log(`🔍 Obteniendo meses para propietario: ${propietarioId}`);

      const fechaInicio = await configuracionService.getFechaInicioOperaciones();
      const [yearInicio, monthInicio] = fechaInicio.split('-').map(Number);

      const hoy = new Date();
      const yearActual = hoy.getFullYear();
      const mesActual = hoy.getMonth() + 1;

      // Generar lista de TODOS los meses del año (Enero a Diciembre)
      const mesesLista: string[] = [];
      
      let mesInicioMes = 1;
      let añoInicioMes = yearInicio;
      
      if (yearInicio === yearActual) {
        mesInicioMes = monthInicio;
      }

      let año = añoInicioMes;
      let mes = mesInicioMes;
      
      while (año < yearActual || (año === yearActual && mes <= 12)) {
        mesesLista.push(`${año}-${String(mes).padStart(2, '0')}`);
        mes++;
        if (mes > 12) {
          mes = 1;
          año++;
          if (año > yearActual) break;
        }
      }

      // Obtener TODOS los pagos del propietario
      const { data: pagos, error } = await supabase
        .from('pagos')
        .select('*')
        .eq('propietario_id', propietarioId);

      if (error) {
        console.error('Error fetching pagos:', error);
        throw error;
      }

      console.log(`📋 Total pagos encontrados: ${pagos?.length || 0}`);

      // ✅ PASO 1: Extraer TODOS los abonos de TODOS los pagos
      const todosLosAbonos: any[] = [];
      
      pagos?.forEach(pago => {
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
          pago.desglose_pagos.forEach((item: any) => {
            const monto = item.monto_usd || 0;
            if (monto > 0) {
              todosLosAbonos.push({
                mes: item.mes,
                monto_usd: monto,
                monto_bs: item.monto_bs || 0,
                tasa_cambio: item.tasa_cambio || pago.tasa_cambio || 0,
                fecha_recibo: item.fecha_recibo || pago.fecha_pago || pago.created_at,
                estado: item.estado || 'completo',
                pago_id: pago.id
              });
            }
          });
        } else if (pago.mes && pago.monto_usd > 0) {
          todosLosAbonos.push({
            mes: pago.mes,
            monto_usd: pago.monto_usd,
            monto_bs: pago.monto_bs || 0,
            tasa_cambio: pago.tasa_cambio || 0,
            fecha_recibo: pago.fecha_pago || pago.created_at,
            estado: 'completo',
            pago_id: pago.id
          });
        }
      });

      // ✅ PASO 2: ORDENAR abonos por mes (FIFO - más antiguo primero)
      todosLosAbonos.sort((a, b) => a.mes.localeCompare(b.mes));

      console.log(`📋 Total abonos encontrados: ${todosLosAbonos.length}`);
      todosLosAbonos.forEach(abono => {
        console.log(`  - ${abono.mes}: $${abono.monto_usd.toFixed(2)}`);
      });

      // ✅ PASO 3: Inicializar meses con canon
      const mesesConCanon: { [key: string]: number } = {};
      for (const mesKey of mesesLista) {
        const canon = await configuracionService.getCanonPorFecha(mesKey);
        mesesConCanon[mesKey] = canon;
      }

      // ✅ PASO 4: Aplicar FIFO - distribuir abonos en orden estricto
      const pagosPorMes: { [key: string]: number } = {};
      let montoRestante = 0;
      let mesActualIndex = 0;
      const mesesKeys = Object.keys(mesesConCanon).sort();

      for (const abono of todosLosAbonos) {
        let montoAbono = abono.monto_usd;
        
        // Buscar el primer mes con deuda (comenzando desde donde quedamos)
        while (montoAbono > 0 && mesActualIndex < mesesKeys.length) {
          const mesKey = mesesKeys[mesActualIndex];
          const canon = mesesConCanon[mesKey];
          const pagadoActual = pagosPorMes[mesKey] || 0;
          const deudaRestante = Math.max(0, canon - pagadoActual);
          
          if (deudaRestante <= 0) {
            // Este mes ya está pagado, pasar al siguiente
            mesActualIndex++;
            continue;
          }
          
          const montoAplicar = Math.min(montoAbono, deudaRestante);
          pagosPorMes[mesKey] = (pagosPorMes[mesKey] || 0) + montoAplicar;
          montoAbono -= montoAplicar;
          
          console.log(`  🔄 Aplicando $${montoAplicar.toFixed(2)} a ${mesKey} (restante: $${montoAbono.toFixed(2)})`);
          
          if (montoAbono > 0.001) {
            // Si sobró dinero, pasar al siguiente mes
            mesActualIndex++;
          }
        }
        
        // Si sobró dinero después de todos los meses, va a saldo a favor
        if (montoAbono > 0) {
          console.log(`💰 Sobrante del abono: $${montoAbono.toFixed(2)} (saldo a favor)`);
        }
      }

      // ✅ PASO 5: Construir el resultado
      const mesesMorosos = [];

      for (const mesKey of mesesKeys) {
        const canon = mesesConCanon[mesKey];
        const esFuturo = this.esMesFuturo(mesKey);
        const pagado = pagosPorMes[mesKey] || 0;
        const deuda = Math.max(0, canon - pagado);
        const deudaRedondeada = this.redondearDeuda(deuda);
        
        let estado = 'pendiente';
        let pagadoMostrar = pagado;
        let deudaRestante = deudaRedondeada;

        if (esFuturo && pagado === 0) {
          estado = 'futuro';
          deudaRestante = 0;
          pagadoMostrar = 0;
        } else if (esFuturo && pagado > 0) {
          estado = this.determinarEstadoMes(pagado, canon);
          if (estado === 'completo') deudaRestante = 0;
        } else {
          estado = this.determinarEstadoMes(pagado, canon);
          if (estado === 'completo') deudaRestante = 0;
        }

        console.log(`📊 Mes ${mesKey}: Pagado=${pagadoMostrar.toFixed(2)}, Deuda=${deudaRestante.toFixed(2)}, Estado=${estado}`);

        mesesMorosos.push({
          mes: mesKey,
          canon: canon,
          pagado_usd: pagadoMostrar,
          pagado_usd_original: pagado,
          deuda_restante_usd: deudaRestante,
          estado: estado,
          es_futuro: esFuturo,
          abonos: todosLosAbonos.filter(a => a.mes === mesKey)
        });
      }

      const resultado = mesesMorosos.sort((a, b) => a.mes.localeCompare(b.mes));
      
      console.log(`✅ Total meses procesados: ${resultado.length}`);
      console.log(`✅ Meses con deuda: ${resultado.filter(m => m.deuda_restante_usd > 0).length}`);
      
      return resultado;

    } catch (error) {
      console.error('Error getting meses:', error);
      throw error;
    }
  },

  /**
   * Distribuye un pago de condominio entre los meses usando FIFO
   */
  async distribuirPagoCondominio(
    propietarioId: string,
    pagoId: string,
    monto_bs: number,
    tasa_cambio: number,
    fecha_pago: string
  ) {
    try {
      console.log('📤 Distribuyendo pago...');
      console.log(`💰 Monto Bs: ${monto_bs}, Tasa: ${tasa_cambio}, Fecha recibo: ${fecha_pago}`);

      // 1. Obtener TODOS los meses del año
      const mesesMorosos = await this.getMesesMorosos(propietarioId);
      
      // ✅ Filtrar meses que tienen deuda
      const mesesConDeuda = mesesMorosos.filter(m => m.deuda_restante_usd > 0);
      
      if (mesesConDeuda.length === 0) {
        throw new Error('No hay meses con deuda para distribuir');
      }

      console.log(`📋 Meses con deuda (FIFO): ${mesesConDeuda.length}`);
      mesesConDeuda.forEach(m => {
        console.log(`  - ${m.mes}: $${m.deuda_restante_usd.toFixed(2)} (${m.es_futuro ? 'futuro' : 'vencido'})`);
      });

      // 2. Calcular el monto en USD
      const monto_usd = monto_bs / tasa_cambio;
      let montoRestante = monto_usd;
      
      // 3. Distribuir el pago entre los meses con deuda (FIFO - orden estricto)
      const distribucion: any[] = [];
      let mesesCubiertos = 0;
      let sobranteUsd = 0;
      let sobranteBs = 0;

      for (const deuda of mesesConDeuda) {
        if (montoRestante <= 0.001) break;

        const deudaRestante = deuda.deuda_restante_usd;
        const montoAplicar = Math.min(montoRestante, deudaRestante);
        
        if (montoAplicar > 0.001) {
          const montoBsAplicar = montoAplicar * tasa_cambio;
          
          const nuevaDeudaRestante = Math.max(0, deudaRestante - montoAplicar);
          const nuevoTotalPagado = deuda.canon - nuevaDeudaRestante;
          let estado = this.determinarEstadoMes(nuevoTotalPagado, deuda.canon);
          
          if (estado === 'completo' || nuevaDeudaRestante <= 0.001) {
            estado = 'completo';
            mesesCubiertos++;
          }

          distribucion.push({
            mes: deuda.mes,
            monto_usd_asignado: montoAplicar,
            monto_bs_asignado: montoBsAplicar,
            estado: estado,
            deuda_restante_usd: estado === 'completo' ? 0 : nuevaDeudaRestante,
            canon_mensual: deuda.canon,
            abono_restante_usd: 0,
            es_futuro: deuda.es_futuro || false
          });
          
          montoRestante -= montoAplicar;
          
          console.log(`✅ Mes ${deuda.mes}: aplicado $${montoAplicar.toFixed(2)} (${estado}) - Restante: $${montoRestante.toFixed(2)}`);
        }
      }

      // ✅ Si aún sobra dinero, buscar meses futuros sin deuda para pagos adelantados
      if (montoRestante > 0.001) {
        const mesesFuturosDisponibles = mesesMorosos.filter(m => 
          m.es_futuro && m.pagado_usd === 0
        );
        
        console.log(`📋 Meses futuros disponibles para adelanto: ${mesesFuturosDisponibles.length}`);
        
        for (const mesFuturo of mesesFuturosDisponibles) {
          if (montoRestante <= 0.001) break;
          
          const canon = mesFuturo.canon;
          const montoAplicar = Math.min(montoRestante, canon);
          
          if (montoAplicar > 0.001) {
            const montoBsAplicar = montoAplicar * tasa_cambio;
            
            let estado = this.determinarEstadoMes(montoAplicar, canon);
            let deudaRestante = 0;
            
            if (estado === 'completo') {
              deudaRestante = 0;
              mesesCubiertos++;
            } else {
              deudaRestante = canon - montoAplicar;
            }
            
            distribucion.push({
              mes: mesFuturo.mes,
              monto_usd_asignado: montoAplicar,
              monto_bs_asignado: montoBsAplicar,
              estado: estado,
              deuda_restante_usd: deudaRestante,
              canon_mensual: canon,
              abono_restante_usd: 0,
              es_futuro: true
            });
            
            montoRestante -= montoAplicar;
            
            console.log(`✅ Mes futuro ${mesFuturo.mes}: aplicado $${montoAplicar.toFixed(2)} (${estado}) - Restante: $${montoRestante.toFixed(2)}`);
          }
        }

        if (montoRestante > 0.001) {
          sobranteUsd = montoRestante;
          sobranteBs = montoRestante * tasa_cambio;
          console.log(`💰 Sobrante: $${sobranteUsd.toFixed(2)} (Bs ${sobranteBs.toFixed(2)})`);
        }
      }

      // 4. Construir el desglose de pagos
      const desglosePagos = distribucion.map(item => ({
        mes: item.mes,
        monto_usd: item.monto_usd_asignado,
        monto_bs: item.monto_bs_asignado,
        tasa_cambio: tasa_cambio,
        fecha_recibo: fecha_pago,
        estado: item.estado,
        tipo: 'canon',
        deuda_restante: item.deuda_restante_usd,
        es_futuro: item.es_futuro || false
      }));

      console.log(`📋 Desglose generado (${desglosePagos.length} abonos):`);
      desglosePagos.forEach(item => {
        console.log(`  - ${item.mes}: $${item.monto_usd.toFixed(2)} (${item.estado}) ${item.es_futuro ? '(adelantado)' : ''}`);
      });

      // 5. Actualizar el pago con el desglose
      const { error: updateError } = await supabase
        .from('pagos')
        .update({
          desglose_pagos: desglosePagos,
          distribuido: true,
          monto_usd: monto_usd,
          tasa_cambio: tasa_cambio,
          fecha_pago: fecha_pago
        })
        .eq('id', pagoId);

      if (updateError) {
        console.error('❌ Error actualizando pago:', updateError);
        throw updateError;
      }

      console.log('✅ Pago distribuido correctamente');

      const totalAsignadoUsd = distribucion.reduce((sum, item) => sum + item.monto_usd_asignado, 0);
      const totalAsignadoBs = totalAsignadoUsd * tasa_cambio;

      return {
        distribucion,
        mesesCubiertos,
        sobranteUsd,
        sobranteBs,
        totalAsignadoUsd,
        totalAsignadoBs,
        desglose: desglosePagos
      };

    } catch (error) {
      console.error('❌ Error distribuyendo pago:', error);
      throw error;
    }
  },

  /**
   * Obtiene el resumen de deudas de un propietario
   */
  async getResumenDeudas(propietarioId: string): Promise<{
    totalDeudaUsd: number;
    mesesMorosos: number;
    meses: any[];
  }> {
    try {
      const mesesMorosos = await this.getMesesMorosos(propietarioId);
      
      const mesesConDeuda = mesesMorosos.filter(m => m.deuda_restante_usd > 0);
      const totalDeudaUsd = mesesConDeuda.reduce((sum, m) => sum + m.deuda_restante_usd, 0);
      
      return {
        totalDeudaUsd: totalDeudaUsd,
        mesesMorosos: mesesConDeuda.length,
        meses: mesesMorosos
      };
    } catch (error) {
      console.error('Error getting resumen deudas:', error);
      throw error;
    }
  },

  /**
   * Verifica si un pago ya fue distribuido
   */
  async isPagoDistribuido(pagoId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('pagos')
        .select('distribuido, desglose_pagos')
        .eq('id', pagoId)
        .single();

      if (error) {
        console.error('Error checking pago distribuido:', error);
        return false;
      }

      return data?.distribuido === true || 
             (data?.desglose_pagos && Array.isArray(data.desglose_pagos) && data.desglose_pagos.length > 0);
    } catch (error) {
      console.error('Error checking pago distribuido:', error);
      return false;
    }
  },

  /**
   * Revertir distribución de un pago
   */
  async revertirDistribucion(pagoId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('pagos')
        .update({
          desglose_pagos: null,
          distribuido: false
        })
        .eq('id', pagoId);

      if (error) {
        console.error('Error revertiendo distribucion:', error);
        throw error;
      }

      console.log('✅ Distribución revertida');
    } catch (error) {
      console.error('Error revertiendo distribucion:', error);
      throw error;
    }
  },

  /**
   * Obtiene el historial de pagos distribuidos de un propietario
   */
  async getHistorialDistribuciones(propietarioId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('pagos')
        .select('*')
        .eq('propietario_id', propietarioId)
        .eq('distribuido', true)
        .not('desglose_pagos', 'is', null)
        .order('fecha_pago', { ascending: false });

      if (error) {
        console.error('Error getting historial distribuciones:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error getting historial distribuciones:', error);
      throw error;
    }
  }
};