// src/lib/services/estado-pagos.service.ts
import { supabase } from '../supabase/client';
import { configuracionService } from './configuracion.service';
import type { EstadoPagoMensual } from '../../types';

export const estadoPagosService = {
  // Obtener estado de pagos mes por mes para todos los propietarios
  async getEstadoPagosMensual(propiedadId?: string): Promise<EstadoPagoMensual[]> {
    // 1. Obtener fecha de inicio de operaciones
    const fechaInicio = await configuracionService.getFechaInicioOperaciones();
    const [yearInicio, monthInicio] = fechaInicio.split('-').map(Number);
    
    // 2. Obtener todos los propietarios
    let query = supabase
      .from('propietarios')
      .select(`
        id,
        nombre,
        apartamento,
        cuota_mensual,
        propiedad_id,
        propiedades(nombre)
      `);

    if (propiedadId) {
      query = query.eq('propiedad_id', propiedadId);
    }

    const { data: propietarios, error: propError } = await query;

    if (propError) {
      console.error('Error fetching propietarios:', propError);
      throw propError;
    }

    // 3. Generar lista de meses desde la fecha de inicio hasta el mes actual
    const fechaActual = new Date();
    const añoActual = fechaActual.getFullYear();
    const mesActual = fechaActual.getMonth() + 1;
    
    const mesesLista: string[] = [];
    let año = yearInicio;
    let mes = monthInicio;
    
    while (año < añoActual || (año === añoActual && mes <= mesActual)) {
      mesesLista.push(`${año}-${String(mes).padStart(2, '0')}`);
      mes++;
      if (mes > 12) {
        mes = 1;
        año++;
      }
    }

    // 4. Obtener todos los pagos del periodo
    const mesInicio = mesesLista[0];
    const mesFin = mesesLista[mesesLista.length - 1];

    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select(`
        *,
        desglose_pagos
      `)
      .gte('mes', mesInicio)
      .lte('mes', mesFin)
      .order('mes', { ascending: true });

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      throw pagoError;
    }

    // 5. Procesar datos por propietario
    const resultado: EstadoPagoMensual[] = await Promise.all(propietarios.map(async (prop) => {
      const meses: { [key: string]: any } = {};
      let total_deuda = 0;
      let total_pagado = 0;
      let deuda_anterior = 0;

      // Inicializar meses desde la fecha de inicio
      for (const mesKey of mesesLista) {
        // Obtener el canon para este mes específico
        const canonParaMes = await configuracionService.getCanonPorFecha(mesKey);
        meses[mesKey] = {
          estado: 'pendiente',
          monto_usd: 0,
          monto_bs: 0,
          desglose: [],
          abono_restante: 0,
          canon_mensual: canonParaMes
        };
      }

      // Procesar pagos del propietario
      const pagosPropietario = pagos.filter(p => p.propietario_id === prop.id);
      
      // Agrupar pagos por mes
      const pagosPorMes: { [key: string]: any } = {};
      
      pagosPropietario.forEach(pago => {
        if (!pagosPorMes[pago.mes]) {
          pagosPorMes[pago.mes] = {
            monto_usd: 0,
            monto_bs: 0,
            estado: 'pendiente',
            desglose: [],
            abono_restante: 0,
            fecha_pago: pago.fecha_pago
          };
        }
        pagosPorMes[pago.mes].monto_usd += pago.monto_usd;
        pagosPorMes[pago.mes].monto_bs += pago.monto_bs;
        
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
          pagosPorMes[pago.mes].desglose.push(...pago.desglose_pagos);
        }
        
        if (pago.estado === 'completo') {
          pagosPorMes[pago.mes].estado = 'completo';
        } else if (pago.estado === 'parcial' && pagosPorMes[pago.mes].estado !== 'completo') {
          pagosPorMes[pago.mes].estado = 'parcial';
        }
        if (pago.abono_restante > 0) {
          pagosPorMes[pago.mes].abono_restante = pago.abono_restante;
        }
      });

      // Verificar meses antes de la fecha de inicio (deuda anterior)
      const mesesAntesInicio: string[] = [];
      for (const mesKey of Object.keys(pagosPorMes)) {
        const [year, month] = mesKey.split('-').map(Number);
        if (year < yearInicio || (year === yearInicio && month < monthInicio)) {
          mesesAntesInicio.push(mesKey);
        }
      }
      
      // Calcular deuda anterior usando el canon correspondiente a cada mes
      for (const mes of mesesAntesInicio) {
        const canonMes = await configuracionService.getCanonPorFecha(mes);
        const pago = pagosPorMes[mes];
        if (pago.estado === 'completo') {
          // No hay deuda
        } else if (pago.estado === 'parcial') {
          deuda_anterior += canonMes - pago.monto_usd;
        } else {
          deuda_anterior += canonMes;
        }
      }
      
      // Asignar pagos a los meses dentro del periodo y calcular deuda
      for (const mesKey of mesesLista) {
        const canonMes = await configuracionService.getCanonPorFecha(mesKey);
        
        if (pagosPorMes[mesKey]) {
          const pago = pagosPorMes[mesKey];
          meses[mesKey].monto_usd = pago.monto_usd;
          meses[mesKey].monto_bs = pago.monto_bs;
          meses[mesKey].estado = pago.estado;
          meses[mesKey].desglose = pago.desglose || [];
          meses[mesKey].abono_restante = pago.abono_restante || 0;
          meses[mesKey].fecha_pago = pago.fecha_pago;
          
          if (pago.estado === 'completo') {
            total_pagado += canonMes;
          } else if (pago.estado === 'parcial') {
            total_pagado += pago.monto_usd;
            total_deuda += canonMes - pago.monto_usd;
          } else {
            total_deuda += canonMes;
          }
        } else {
          // Mes sin pago - deuda total
          total_deuda += canonMes;
        }
      }

      return {
        propietario_id: prop.id,
        nombre: prop.nombre,
        apartamento: prop.apartamento,
        deuda_anterior: deuda_anterior,
        meses,
        total_deuda,
        total_pagado,
        saldo_actual: total_pagado - total_deuda - deuda_anterior
      };
    }));

    return resultado;
  },

  // Obtener historial completo de un propietario
  async getHistorialPropietario(propietarioId: string): Promise<any> {
    // 1. Obtener propietario
    const { data: propietario, error: propError } = await supabase
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
      .eq('id', propietarioId)
      .single();

    if (propError) {
      console.error('Error fetching propietario:', propError);
      throw propError;
    }

    // 2. Obtener fecha de inicio de operaciones
    const fechaInicio = await configuracionService.getFechaInicioOperaciones();

    // 3. Obtener todos los pagos del propietario desde la fecha de inicio
    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select('*')
      .eq('propietario_id', propietarioId)
      .gte('mes', fechaInicio)
      .order('fecha_pago', { ascending: false });

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      throw pagoError;
    }

    // 4. Calcular resumen
    const total_pagado_usd = pagos.reduce((sum, p) => sum + p.monto_usd, 0);
    const total_pagado_bs = pagos.reduce((sum, p) => sum + p.monto_bs, 0);
    const ultimo_pago = pagos.length > 0 ? pagos[0].fecha_pago : null;
    const primer_pago = pagos.length > 0 ? pagos[pagos.length - 1].fecha_pago : null;

    // 5. Estado de meses con sus montos
    const mesesEstado = await Promise.all(pagos.map(async (p) => {
      const canonMes = await configuracionService.getCanonPorFecha(p.mes);
      return {
        mes: p.mes,
        estado: p.estado,
        monto_usd: p.monto_usd,
        monto_bs: p.monto_bs,
        canon_mensual: canonMes,
        fecha_pago: p.fecha_pago
      };
    }));

    // 6. Calcular deuda total (meses pendientes * canon correspondiente)
    const [yearInicio, monthInicio] = fechaInicio.split('-').map(Number);
    const fechaActual = new Date();
    const añoActual = fechaActual.getFullYear();
    const mesActual = fechaActual.getMonth() + 1;
    
    const mesesPagados = new Set(mesesEstado.map(m => m.mes));
    let deudaTotal = 0;
    
    let año = yearInicio;
    let mes = monthInicio;
    
    while (año < añoActual || (año === añoActual && mes <= mesActual)) {
      const mesKey = `${año}-${String(mes).padStart(2, '0')}`;
      if (!mesesPagados.has(mesKey)) {
        const canonMes = await configuracionService.getCanonPorFecha(mesKey);
        deudaTotal += canonMes;
      }
      mes++;
      if (mes > 12) {
        mes = 1;
        año++;
      }
    }

    return {
      propietario,
      pagos,
      resumen: {
        total_pagado_usd,
        total_pagado_bs,
        total_deuda: deudaTotal,
        meses_al_dia: mesesEstado.filter(m => m.estado === 'completo').length,
        meses_morosos: mesesEstado.filter(m => m.estado === 'pendiente').length,
        meses_parciales: mesesEstado.filter(m => m.estado === 'parcial').length,
        ultimo_pago,
        primer_pago
      },
      meses_estado: mesesEstado
    };
  }
};