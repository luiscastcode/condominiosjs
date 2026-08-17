// src/components/dashboard/ReportesFinancieros.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { propietariosService } from '../../lib/services/propietarios.service';
import { propiedadesService } from '../../lib/services/propiedades.service';
import { configuracionService } from '../../lib/services/configuracion.service';
import { formatBs, formatUSD, formatDate } from '../../lib/utils/monto.utils';
import type { Propietario, Propiedad } from '../../types';

interface ReporteMensual {
  mes: string;
  total_pagado_usd: number;
  total_pagado_bs: number;
  total_deuda_usd: number;
  total_canon_usd: number;
  propietarios_pagados: number;
  propietarios_parciales: number;
  propietarios_morosos: number;
  total_propietarios: number;
  es_futuro: boolean;
}

interface ReportePropietario {
  propietario_id: string;
  nombre: string;
  apartamento: string;
  meses: { [key: string]: { pagado: number; deuda: number; estado: string; es_futuro: boolean; canon: number } };
  total_pagado_usd: number;
  total_deuda_usd: number;
  total_canon_usd: number;
}

const ReportesFinancieros: React.FC = () => {
  const [reporteMensual, setReporteMensual] = useState<ReporteMensual[]>([]);
  const [reportePropietarios, setReportePropietarios] = useState<ReportePropietario[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [propiedadSeleccionada, setPropiedadSeleccionada] = useState('');
  const [añoSeleccionado, setAñoSeleccionado] = useState<number>(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [añosDisponibles, setAñosDisponibles] = useState<number[]>([]);
  const [tipoReporte, setTipoReporte] = useState<'mensual' | 'propietarios' | 'resumen'>('mensual');
  const [resumenGeneral, setResumenGeneral] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [propiedadSeleccionada, añoSeleccionado]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [propiedadesData] = await Promise.all([
        propiedadesService.getAll()
      ]);

      setPropiedades(propiedadesData);
      
      const años = await getAñosDisponibles();
      setAñosDisponibles(años);

      await generarReportes();
    } catch (error) {
      console.error('Error loading reportes:', error);
      setError('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const getAñosDisponibles = async () => {
    const fechaInicio = await configuracionService.getFechaInicioOperaciones();
    const añoInicio = parseInt(fechaInicio.split('-')[0]);
    const añoActual = new Date().getFullYear();
    
    const años: number[] = [];
    for (let año = añoInicio; año <= añoActual; año++) {
      años.push(año);
    }
    return años;
  };

  const esMesFuturo = (mesKey: string): boolean => {
    const hoy = new Date();
    const [year, month] = mesKey.split('-').map(Number);
    
    if (year > hoy.getFullYear()) return true;
    if (year === hoy.getFullYear() && month > hoy.getMonth() + 1) return true;
    return false;
  };

  const determinarEstadoMes = (pagado: number, canon: number): string => {
    if (pagado === 0) return 'pendiente';
    if (pagado >= 14.50) return 'completo';
    if (pagado > 0 && pagado < 14.50) return 'parcial';
    return 'pendiente';
  };

  const generarReportes = async () => {
    try {
      const propietarios = await propietariosService.getAll();
      
      const propietariosFiltrados = propiedadSeleccionada 
        ? propietarios.filter(p => p.propiedad_id === propiedadSeleccionada)
        : propietarios;

      const mesInicio = `${añoSeleccionado}-01`;
      const mesFin = `${añoSeleccionado}-12`;

      const { data: pagos, error: pagosError } = await supabase
        .from('pagos')
        .select('*')
        .gte('mes', mesInicio)
        .lte('mes', mesFin);

      if (pagosError) throw pagosError;

      const reporteMensual = await generarReporteMensual(propietariosFiltrados, pagos || []);
      setReporteMensual(reporteMensual);

      const reportePropietarios = await generarReportePropietarios(propietariosFiltrados, pagos || []);
      setReportePropietarios(reportePropietarios);

      const resumen = calcularResumenGeneral(reporteMensual, reportePropietarios);
      setResumenGeneral(resumen);

    } catch (error) {
      console.error('Error generando reportes:', error);
      setError('Error al generar los reportes');
    }
  };

  const generarReporteMensual = async (propietarios: Propietario[], pagos: any[]): Promise<ReporteMensual[]> => {
    const reporte: ReporteMensual[] = [];

    for (let m = 1; m <= 12; m++) {
      const mesKey = `${añoSeleccionado}-${String(m).padStart(2, '0')}`;
      const canon = await configuracionService.getCanonPorFecha(mesKey);
      const esFuturo = esMesFuturo(mesKey);
      
      let totalPagadoUsd = 0;
      let totalPagadoBs = 0;
      const propietariosConPago: Set<string> = new Set();
      const propietariosConPagoParcial: Set<string> = new Set();

      pagos.forEach(pago => {
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
          pago.desglose_pagos.forEach((item: any) => {
            if (item.mes === mesKey) {
              const monto = item.monto_usd || 0;
              totalPagadoUsd += monto;
              totalPagadoBs += item.monto_bs || 0;
              
              const estado = determinarEstadoMes(monto, canon);
              if (estado === 'completo') {
                propietariosConPago.add(pago.propietario_id);
              } else if (estado === 'parcial') {
                propietariosConPagoParcial.add(pago.propietario_id);
              }
            }
          });
        } else if (pago.mes === mesKey) {
          const monto = pago.monto_usd || 0;
          totalPagadoUsd += monto;
          totalPagadoBs += pago.monto_bs || 0;
          const estado = determinarEstadoMes(monto, canon);
          if (estado === 'completo') {
            propietariosConPago.add(pago.propietario_id);
          } else if (estado === 'parcial') {
            propietariosConPagoParcial.add(pago.propietario_id);
          }
        }
      });

      const totalCanon = propietarios.length * canon;
      
      let totalDeuda = 0;
      if (!esFuturo) {
        totalDeuda = Math.max(0, totalCanon - totalPagadoUsd);
      }

      const propietariosPagados = propietariosConPago.size;
      const propietariosParciales = propietariosConPagoParcial.size;
      const propietariosMorosos = esFuturo ? 0 : propietarios.length - propietariosPagados - propietariosParciales;

      reporte.push({
        mes: mesKey,
        total_pagado_usd: totalPagadoUsd,
        total_pagado_bs: totalPagadoBs,
        total_deuda_usd: totalDeuda,
        total_canon_usd: totalCanon,
        propietarios_pagados: propietariosPagados,
        propietarios_parciales: propietariosParciales,
        propietarios_morosos: propietariosMorosos,
        total_propietarios: propietarios.length,
        es_futuro: esFuturo
      });
    }

    return reporte;
  };

  const generarReportePropietarios = async (propietarios: Propietario[], pagos: any[]): Promise<ReportePropietario[]> => {
    const reporte: ReportePropietario[] = [];

    for (const prop of propietarios) {
      const meses: { [key: string]: { pagado: number; deuda: number; estado: string; es_futuro: boolean; canon: number } } = {};
      let totalPagadoUsd = 0;
      let totalDeudaUsd = 0;
      let totalCanonUsd = 0;

      // Inicializar meses
      for (let m = 1; m <= 12; m++) {
        const mesKey = `${añoSeleccionado}-${String(m).padStart(2, '0')}`;
        const canon = await configuracionService.getCanonPorFecha(mesKey);
        const esFuturo = esMesFuturo(mesKey);
        
        meses[mesKey] = {
          pagado: 0,
          deuda: esFuturo ? 0 : canon,
          estado: esFuturo ? 'futuro' : 'pendiente',
          es_futuro: esFuturo,
          canon: canon
        };
        if (!esFuturo) {
          totalCanonUsd += canon;
        }
      }

      // ✅ Extraer TODOS los abonos de TODOS los pagos
      const pagosPropietario = pagos.filter(p => p.propietario_id === prop.id);
      const todosLosAbonos: any[] = [];
      
      pagosPropietario.forEach(pago => {
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
          pago.desglose_pagos.forEach((item: any) => {
            const mesKey = item.mes;
            if (meses[mesKey]) {
              const monto = item.monto_usd || 0;
              if (monto > 0) {
                todosLosAbonos.push({
                  mes: mesKey,
                  monto_usd: monto,
                  monto_bs: item.monto_bs || 0,
                  tasa_cambio: item.tasa_cambio || pago.tasa_cambio || 0,
                  fecha_recibo: item.fecha_recibo || pago.fecha_pago || pago.created_at,
                  estado: item.estado || 'completo'
                });
              }
            }
          });
        } else if (pago.mes && pago.monto_usd > 0) {
          todosLosAbonos.push({
            mes: pago.mes,
            monto_usd: pago.monto_usd,
            monto_bs: pago.monto_bs || 0,
            tasa_cambio: pago.tasa_cambio || 0,
            fecha_recibo: pago.fecha_pago || pago.created_at,
            estado: 'completo'
          });
        }
      });

      // ✅ ORDENAR abonos por mes (FIFO - más antiguo primero)
      todosLosAbonos.sort((a, b) => a.mes.localeCompare(b.mes));

      // ✅ APLICAR FIFO: distribuir abonos en orden estricto
      const mesesKeys = Object.keys(meses).sort();
      let mesIndex = 0;
      let mesIndexFuturo = 0;

      // Primero: cubrir meses vencidos con deuda
      for (const abono of todosLosAbonos) {
        let montoAbono = abono.monto_usd;
        
        // Buscar el primer mes vencido con deuda
        while (montoAbono > 0 && mesIndex < mesesKeys.length) {
          const mesKey = mesesKeys[mesIndex];
          const mesData = meses[mesKey];
          
          // Saltar meses futuros (se manejan después)
          if (mesData.es_futuro) {
            mesIndex++;
            continue;
          }
          
          const canon = mesData.canon;
          const pagadoActual = mesData.pagado;
          const deudaRestante = Math.max(0, canon - pagadoActual);
          
          if (deudaRestante <= 0) {
            mesIndex++;
            continue;
          }
          
          const montoAplicar = Math.min(montoAbono, deudaRestante);
          mesData.pagado += montoAplicar;
          totalPagadoUsd += montoAplicar;
          montoAbono -= montoAplicar;
          
          if (mesData.pagado >= canon) {
            mesIndex++;
          }
        }
        
        // ✅ Si sobró dinero después de cubrir todos los meses vencidos,
        // aplicar a meses futuros (pagos adelantados)
        if (montoAbono > 0) {
          // Buscar meses futuros en orden
          const mesesFuturos = mesesKeys.filter(k => {
            const data = meses[k];
            return data.es_futuro && data.pagado < data.canon;
          });
          
          for (const mesKey of mesesFuturos) {
            if (montoAbono <= 0) break;
            
            const mesData = meses[mesKey];
            const canon = mesData.canon;
            const pagadoActual = mesData.pagado;
            const espacioDisponible = canon - pagadoActual;
            
            if (espacioDisponible <= 0) continue;
            
            const montoAplicar = Math.min(montoAbono, espacioDisponible);
            mesData.pagado += montoAplicar;
            totalPagadoUsd += montoAplicar;
            montoAbono -= montoAplicar;
            
            if (mesData.pagado >= canon) {
              mesData.estado = 'completo';
            }
          }
        }
        
        // Si aún sobró dinero, va a saldo a favor (se registra en el último mes)
        if (montoAbono > 0) {
          const ultimoMesConPago = mesesKeys.filter(k => meses[k].pagado > 0).pop();
          if (ultimoMesConPago) {
            meses[ultimoMesConPago].pagado += montoAbono;
            totalPagadoUsd += montoAbono;
          }
        }
      }

      // ✅ RECALCULAR deuda y estado para CADA MES
      for (const mesKey of Object.keys(meses)) {
        const mesData = meses[mesKey];
        
        // Saltar meses futuros sin pago
        if (mesData.es_futuro && mesData.pagado === 0) {
          mesData.estado = 'futuro';
          mesData.deuda = 0;
          continue;
        }

        const canon = mesData.canon;
        const pagado = mesData.pagado;

        // Determinar estado
        const estado = determinarEstadoMes(pagado, canon);
        mesData.estado = estado;

        // Calcular deuda (solo para meses vencidos)
        if (mesData.es_futuro) {
          mesData.deuda = 0;
        } else if (estado === 'completo') {
          mesData.deuda = 0;
        } else if (estado === 'parcial') {
          mesData.deuda = canon - pagado;
          totalDeudaUsd += mesData.deuda;
        } else {
          mesData.deuda = canon;
          totalDeudaUsd += mesData.deuda;
        }
      }

      reporte.push({
        propietario_id: prop.id,
        nombre: prop.nombre,
        apartamento: prop.apartamento,
        meses,
        total_pagado_usd: totalPagadoUsd,
        total_deuda_usd: totalDeudaUsd,
        total_canon_usd: totalCanonUsd
      });
    }

    return reporte;
  };

  const calcularResumenGeneral = (reporteMensual: ReporteMensual[], reportePropietarios: ReportePropietario[]) => {
    const mesesVencidos = reporteMensual.filter(m => !m.es_futuro);
    
    const totalPagado = mesesVencidos.reduce((sum, m) => sum + m.total_pagado_usd, 0);
    const totalDeuda = mesesVencidos.reduce((sum, m) => sum + m.total_deuda_usd, 0);
    const totalCanon = mesesVencidos.reduce((sum, m) => sum + m.total_canon_usd, 0);
    
    const ultimoMes = mesesVencidos[mesesVencidos.length - 1];
    const morosos = ultimoMes?.propietarios_morosos || 0;
    const pagados = ultimoMes?.propietarios_pagados || 0;
    const parciales = ultimoMes?.propietarios_parciales || 0;
    const totalPropietarios = ultimoMes?.total_propietarios || 0;

    const promedioPagoPorPropietario = totalPropietarios > 0 ? totalPagado / totalPropietarios : 0;

    return {
      totalPagado,
      totalDeuda,
      totalCanon,
      morosos,
      pagados,
      parciales,
      totalPropietarios,
      promedioPagoPorPropietario,
      tasaCobranza: totalCanon > 0 ? (totalPagado / totalCanon) * 100 : 0
    };
  };

  const formatMes = (mes: string) => {
    const [year, month] = mes.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${meses[parseInt(month) - 1]} ${year}`;
  };

  const formatMesLargo = (mes: string) => {
    const [year, month] = mes.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[parseInt(month) - 1]} ${year}`;
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'completo':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">✅ Pagado</span>;
      case 'parcial':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">⚠️ Parcial</span>;
      case 'futuro':
        return <span className="px-2 py-1 bg-gray-100 text-gray-400 rounded-full text-xs font-medium">-</span>;
      default:
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">❌ Adeudado</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">📊 Reportes Financieros</h2>
            <p className="text-sm text-gray-500">
              Análisis completo de pagos y deudas del condominio
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Año:</label>
              <select
                value={añoSeleccionado}
                onChange={(e) => setAñoSeleccionado(parseInt(e.target.value))}
                className="px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {añosDisponibles.map((año) => (
                  <option key={año} value={año}>
                    {año}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Conjunto:</label>
              <select
                value={propiedadSeleccionada}
                onChange={(e) => setPropiedadSeleccionada(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Todos</option>
                {propiedades.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={generarReportes}
              className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 flex items-center gap-1"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-4 border-b">
          <button
            onClick={() => setTipoReporte('mensual')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tipoReporte === 'mensual'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📅 Por Mes
          </button>
          <button
            onClick={() => setTipoReporte('propietarios')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tipoReporte === 'propietarios'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            👤 Por Propietario
          </button>
          <button
            onClick={() => setTipoReporte('resumen')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tipoReporte === 'resumen'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📊 Resumen General
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      {tipoReporte === 'mensual' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">📅 Reporte Mensual de Pagos</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Pagado ($)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Pagado (Bs)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Deuda ($)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Canon Total ($)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">✅ Pagados</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">⚠️ Parciales</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">❌ Morosos</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Cobranza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reporteMensual.map((mes) => {
                  const porcentajeCobranza = mes.total_canon_usd > 0 && !mes.es_futuro
                    ? (mes.total_pagado_usd / mes.total_canon_usd) * 100 
                    : 0;
                  
                  return (
                    <tr 
                      key={mes.mes} 
                      className={`hover:bg-gray-50 transition ${
                        mes.es_futuro ? 'bg-gray-50/30 text-gray-400' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {formatMesLargo(mes.mes)}
                        {mes.es_futuro && (
                          <span className="ml-2 text-xs text-gray-400">(futuro)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">
                        {mes.total_pagado_usd > 0 ? `$${formatUSD(mes.total_pagado_usd)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600">
                        {mes.total_pagado_bs > 0 ? `Bs ${formatBs(mes.total_pagado_bs)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">
                        {mes.es_futuro ? '-' : `$${formatUSD(mes.total_deuda_usd)}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {mes.es_futuro ? '-' : `$${formatUSD(mes.total_canon_usd)}`}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-green-600">
                        {mes.propietarios_pagados > 0 ? mes.propietarios_pagados : '-'}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-yellow-600">
                        {mes.propietarios_parciales > 0 ? mes.propietarios_parciales : '-'}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-red-600">
                        {mes.es_futuro ? '-' : mes.propietarios_morosos > 0 ? mes.propietarios_morosos : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {mes.es_futuro ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <span className={porcentajeCobranza >= 80 ? 'text-green-600' : porcentajeCobranza >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                            {porcentajeCobranza.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {reporteMensual.length > 0 && (
                <tfoot className="bg-gray-100 font-bold">
                  <tr>
                    <td className="px-4 py-3 text-gray-700">TOTALES</td>
                    <td className="px-4 py-3 text-right text-green-600">
                      ${formatUSD(reporteMensual.reduce((sum, m) => sum + m.total_pagado_usd, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-600">
                      Bs {formatBs(reporteMensual.reduce((sum, m) => sum + m.total_pagado_bs, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      ${formatUSD(reporteMensual.reduce((sum, m) => sum + m.total_deuda_usd, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600" colSpan={5}>
                      Promedio Cobranza: {(reporteMensual.filter(m => !m.es_futuro).reduce((sum, m) => sum + (m.total_canon_usd > 0 ? (m.total_pagado_usd / m.total_canon_usd) * 100 : 0), 0) / Math.max(1, reporteMensual.filter(m => !m.es_futuro).length)).toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ⏳ Los meses marcados como "futuro" aún no han llegado y no generan deuda
          </p>
        </div>
      )}

      {tipoReporte === 'propietarios' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">👤 Estado de Cuenta por Propietario</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">Propietario</th>
                  {reportePropietarios.length > 0 && Object.keys(reportePropietarios[0]?.meses || {}).map((mes) => (
                    <th key={mes} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase min-w-12.5">
                      {formatMes(mes)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase min-w-20">Total Pagado</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase min-w-20">Total Deuda</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase min-w-20">Total Canon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reportePropietarios.map((prop) => {
                  let deudaReal = 0;
                  for (const mesKey of Object.keys(prop.meses)) {
                    const mesData = prop.meses[mesKey];
                    if (!mesData.es_futuro && mesData.deuda > 0) {
                      deudaReal += mesData.deuda;
                    }
                  }
                  
                  return (
                    <tr key={prop.propietario_id} className="hover:bg-gray-50 transition">
                      <td className="px-3 py-2 sticky left-0 bg-white hover:bg-gray-50">
                        <button
                          onClick={() => window.location.href = `/propietario/${prop.propietario_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline text-left font-medium"
                        >
                          {prop.nombre}
                        </button>
                        <div className="text-xs text-gray-500 font-normal">
                          {prop.apartamento}
                        </div>
                      </td>
                      {Object.keys(prop.meses).map((mes) => {
                        const data = prop.meses[mes];
                        const esFuturo = data.es_futuro || false;
                        const estado = data.estado || 'pendiente';
                        const pagado = data.pagado || 0;
                        
                        let icono = '';
                        let mostrarMonto = false;
                        
                        if (pagado > 0) {
                          if (estado === 'completo') {
                            icono = '✅';
                          } else if (estado === 'parcial') {
                            icono = '⚠️';
                          } else {
                            icono = '✅';
                          }
                          mostrarMonto = true;
                        } else if (esFuturo) {
                          icono = '-';
                          mostrarMonto = false;
                        } else {
                          icono = '❌';
                          mostrarMonto = false;
                        }
                        
                        return (
                          <td key={mes} className="px-2 py-2 text-center">
                            {mostrarMonto ? (
                              <div className="flex flex-col items-center">
                                <span className="text-sm">{icono}</span>
                                <span className="text-[8px] text-green-600">${formatUSD(pagado)}</span>
                              </div>
                            ) : esFuturo ? (
                              <span className="text-gray-300">-</span>
                            ) : (
                              <span className="text-red-500">❌</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-medium text-green-600">
                        ${formatUSD(prop.total_pagado_usd)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-red-600">
                        ${formatUSD(deudaReal)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        ${formatUSD(prop.total_canon_usd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ⏳ Los meses en blanco son meses futuros sin pago adelantado
          </p>
        </div>
      )}

      {tipoReporte === 'resumen' && resumenGeneral && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
              <p className="text-sm text-gray-500">Total Pagado</p>
              <p className="text-2xl font-bold text-green-600">
                ${formatUSD(resumenGeneral.totalPagado)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-500">
              <p className="text-sm text-gray-500">Total Deuda</p>
              <p className="text-2xl font-bold text-red-600">
                ${formatUSD(resumenGeneral.totalDeuda)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
              <p className="text-sm text-gray-500">Total Canon</p>
              <p className="text-2xl font-bold text-blue-600">
                ${formatUSD(resumenGeneral.totalCanon)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-500">
              <p className="text-sm text-gray-500">Tasa de Cobranza</p>
              <p className="text-2xl font-bold text-purple-600">
                {resumenGeneral.tasaCobranza.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">👥 Estado de Propietarios</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{resumenGeneral.pagados}</p>
                <p className="text-sm text-gray-600">✅ Pagados</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-yellow-600">{resumenGeneral.parciales}</p>
                <p className="text-sm text-gray-600">⚠️ Parciales</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">{resumenGeneral.morosos}</p>
                <p className="text-sm text-gray-600">❌ Morosos</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">{resumenGeneral.totalPropietarios}</p>
                <p className="text-sm text-gray-600">Total Propietarios</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">📊 Análisis de Morosidad</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">Promedio de Pago por Propietario</p>
                <p className="text-xl font-bold text-blue-600">
                  ${formatUSD(resumenGeneral.promedioPagoPorPropietario)}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">Propietarios al Día</p>
                <p className="text-xl font-bold text-green-600">
                  {resumenGeneral.pagados} de {resumenGeneral.totalPropietarios}
                  <span className="text-sm text-gray-500 ml-2">
                    ({resumenGeneral.totalPropietarios > 0 ? ((resumenGeneral.pagados / resumenGeneral.totalPropietarios) * 100).toFixed(1) : 0}%)
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportesFinancieros;