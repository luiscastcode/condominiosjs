 // src/components/dashboard/EstadoPagosTable.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { propietariosService } from '../../lib/services/propietarios.service';
import { propiedadesService } from '../../lib/services/propiedades.service';
import { configuracionService } from '../../lib/services/configuracion.service';
import { formatBs, formatUSD, formatDate } from '../../lib/utils/monto.utils';
import type { Propietario, Propiedad } from '../../types';

interface PagoDetalle {
  id: string;
  fecha_recibo: string;
  monto_usd: number;
  monto_bs: number;
  tasa_cambio: number;
  descripcion?: string;
  mes_aplicado: string;
  numero_referencia?: string;
  forma_pago?: string;
  banco_origen?: string;
}

interface PagoMensual {
  mes: string;
  canon_mensual: number;
  estado: 'completo' | 'parcial' | 'pendiente' | 'futuro';
  detalles: PagoDetalle[];
  total_pagado_usd: number;
  deuda_usd: number;
  saldo_favor_usd: number;
  es_futuro: boolean;
}

interface EstadoPagoMensual {
  propietario_id: string;
  nombre: string;
  apartamento: string;
  meses: { [key: string]: PagoMensual };
  total_deuda_usd: number;
  total_saldo_favor_usd: number;
  total_pagado_usd: number;
}

const EstadoPagosTable: React.FC = () => {
  const [estadoPagos, setEstadoPagos] = useState<EstadoPagoMensual[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [propiedadSeleccionada, setPropiedadSeleccionada] = useState('');
  const [añoSeleccionado, setAñoSeleccionado] = useState<number>(new Date().getFullYear());
  const [mesActual, setMesActual] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [añosDisponibles, setAñosDisponibles] = useState<number[]>([]);
  const [mesExpandido, setMesExpandido] = useState<string | null>(null);

  useEffect(() => {
    const hoy = new Date();
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    setMesActual(`${meses[hoy.getMonth()]} ${hoy.getFullYear()}`);
    
    loadData();
  }, [propiedadSeleccionada, añoSeleccionado]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [propietariosData, propiedadesData] = await Promise.all([
        propietariosService.getAll(),
        propiedadesService.getAll()
      ]);

      setPropiedades(propiedadesData);
      
      const estadoProcesado = await procesarEstadoPagos(propietariosData, propiedadSeleccionada, añoSeleccionado);
      setEstadoPagos(estadoProcesado);
      
      const años = await getAñosDisponibles();
      setAñosDisponibles(años);
    } catch (error) {
      console.error('Error loading estado pagos:', error);
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

  /**
   * Verifica si un mes es futuro
   */
  const esMesFuturo = (mesKey: string): boolean => {
    const hoy = new Date();
    const [year, month] = mesKey.split('-').map(Number);
    
    if (year > hoy.getFullYear()) return true;
    if (year === hoy.getFullYear() && month > hoy.getMonth() + 1) return true;
    return false;
  };

  const procesarEstadoPagos = async (propietarios: Propietario[], propiedadId?: string, año?: number) => {
    const añoSeleccionado = año || new Date().getFullYear();
    const mesInicio = `${añoSeleccionado}-01`;
    const mesFin = `${añoSeleccionado}-12`;

    const { data: pagos, error: pagoError } = await supabase
      .from('pagos')
      .select(`
        *,
        propietario:propietarios(
          id,
          nombre,
          apartamento,
          propiedad_id
        )
      `)
      .gte('mes', mesInicio)
      .lte('mes', mesFin);

    if (pagoError) {
      console.error('Error fetching pagos:', pagoError);
      return [];
    }

    const propietariosFiltrados = propiedadId 
      ? propietarios.filter(p => p.propiedad_id === propiedadId)
      : propietarios;

    const resultado = await Promise.all(propietariosFiltrados.map(async (prop) => {
      const meses: { [key: string]: PagoMensual } = {};
      let total_deuda_usd = 0;
      let total_saldo_favor_usd = 0;
      let total_pagado_usd = 0;

      // ✅ Inicializar TODOS los meses del año (Enero a Diciembre)
      for (let m = 1; m <= 12; m++) {
        const mesKey = `${añoSeleccionado}-${String(m).padStart(2, '0')}`;
        const canon = await configuracionService.getCanonPorFecha(mesKey);
        const esFuturo = esMesFuturo(mesKey);
        
        meses[mesKey] = {
          mes: mesKey,
          canon_mensual: canon,
          estado: esFuturo ? 'futuro' : 'pendiente',
          detalles: [],
          total_pagado_usd: 0,
          deuda_usd: esFuturo ? 0 : canon,
          saldo_favor_usd: 0,
          es_futuro: esFuturo
        };
      }

      // 2. Obtener pagos del propietario y extraer TODOS los abonos
      const pagosPropietario = pagos?.filter(p => p.propietario_id === prop.id) || [];
      const todosLosAbonos: any[] = [];

      pagosPropietario.forEach(pago => {
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos) && pago.desglose_pagos.length > 0) {
          pago.desglose_pagos.forEach((item: any) => {
            const monto = item.monto_usd || 0;
            if (monto > 0) {
              const mesKey = item.mes || pago.mes;
              todosLosAbonos.push({
                mes_aplicado: mesKey,
                monto_usd: monto,
                monto_bs: item.monto_bs || 0,
                tasa_cambio: item.tasa_cambio || pago.tasa_cambio || 0,
                fecha_recibo: item.fecha_recibo || pago.fecha_pago || pago.created_at,
                numero_referencia: item.numero_referencia || pago.numero_referencia,
                forma_pago: item.forma_pago || pago.forma_pago,
                banco_origen: item.banco_origen || pago.banco_origen,
                id: pago.id,
                descripcion: item.descripcion || 'Abono'
              });
            }
          });
        }
      });

      // 3. Aplicar los abonos a los meses correspondientes
      for (const abono of todosLosAbonos) {
        const mesKey = abono.mes_aplicado;
        if (!meses[mesKey]) {
          console.warn(`⚠️ Mes ${mesKey} no encontrado para abono`, abono);
          continue;
        }

        const mesData = meses[mesKey];
        const montoUSD = abono.monto_usd;
        const canon = mesData.canon_mensual;

        // ✅ Verificar que el mes no exceda el canon
        const espacioDisponible = Math.max(0, canon - mesData.total_pagado_usd);
        const montoAplicar = Math.min(montoUSD, espacioDisponible);

        if (montoAplicar > 0) {
          mesData.total_pagado_usd += montoAplicar;
          total_pagado_usd += montoAplicar;

          // ✅ Si el abono es mayor que el espacio disponible, el excedente va a saldo a favor
          const excedente = montoUSD - montoAplicar;
          if (excedente > 0) {
            mesData.saldo_favor_usd += excedente;
            total_saldo_favor_usd += excedente;
          }

          // Registrar detalle
          mesData.detalles.push({
            id: `${abono.id}-${Date.now()}-${Math.random()}`,
            fecha_recibo: abono.fecha_recibo,
            monto_usd: montoAplicar,
            monto_bs: abono.monto_bs * (montoAplicar / montoUSD) || 0,
            tasa_cambio: abono.tasa_cambio,
            descripcion: abono.descripcion || 'Abono aplicado',
            mes_aplicado: mesKey,
            numero_referencia: abono.numero_referencia,
            forma_pago: abono.forma_pago,
            banco_origen: abono.banco_origen
          });

          // ✅ Si es un mes futuro y tiene pago, cambiar estado a completo
          if (mesData.es_futuro && mesData.total_pagado_usd > 0) {
            mesData.estado = 'completo';
            mesData.deuda_usd = 0;
          }
        }
      }

      // 4. Calcular estados y deudas de cada mes
      for (const mesKey of Object.keys(meses)) {
        const mesData = meses[mesKey];
        const canon = mesData.canon_mensual;
        const pagado = mesData.total_pagado_usd;

        // Saltar meses futuros sin pago
        if (mesData.es_futuro && pagado === 0) {
          mesData.estado = 'futuro';
          mesData.deuda_usd = 0;
          continue;
        }

        if (pagado >= canon) {
          mesData.estado = 'completo';
          mesData.deuda_usd = 0;
        } else if (pagado > 0 && pagado < canon) {
          mesData.estado = 'parcial';
          mesData.deuda_usd = canon - pagado;
          total_deuda_usd += mesData.deuda_usd;
        } else {
          mesData.estado = 'pendiente';
          mesData.deuda_usd = canon;
          total_deuda_usd += mesData.deuda_usd;
        }
      }

      return {
        propietario_id: prop.id,
        nombre: prop.nombre,
        apartamento: prop.apartamento,
        meses,
        total_deuda_usd,
        total_saldo_favor_usd,
        total_pagado_usd
      };
    }));

    return resultado;
  };

  const getEstadoEmoji = (estado: string, totalPagado: number, canon: number) => {
    if (estado === 'futuro') {
      return '';
    }
    if (estado === 'completo' || totalPagado >= canon) {
      return '✅';
    }
    if (estado === 'parcial' || (totalPagado > 0 && totalPagado < canon)) {
      return '⚠️';
    }
    return '❌';
  };

  const getEstadoBadge = (estado: string, totalPagado: number, canon: number) => {
    if (estado === 'futuro') {
      return <span className="text-gray-300 text-xs">-</span>;
    }
    if (estado === 'completo' || totalPagado >= canon) {
      return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">✅ Pagado</span>;
    }
    if (estado === 'parcial' || (totalPagado > 0 && totalPagado < canon)) {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">⚠️ Abonado</span>;
    }
    return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">❌ Adeudado</span>;
  };

  const formatMes = (mes: string) => {
    const [year, month] = mes.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${meses[parseInt(month) - 1]} ${year}`;
  };

  const toggleMesExpandido = (propietarioId: string, mesKey: string) => {
    const key = `${propietarioId}-${mesKey}`;
    setMesExpandido(mesExpandido === key ? null : key);
  };

  const handleAñoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAñoSeleccionado(parseInt(e.target.value));
  };

  const obtenerMesesHeader = () => {
    const headers: string[] = [];
    // ✅ Mostrar TODOS los meses del año (Enero a Diciembre)
    for (let m = 1; m <= 12; m++) {
      headers.push(`${añoSeleccionado}-${String(m).padStart(2, '0')}`);
    }
    return headers;
  };

  const estadisticasGenerales = estadoPagos.reduce((acc, prop) => ({
    totalPropietarios: acc.totalPropietarios + 1,
    totalDeuda: acc.totalDeuda + prop.total_deuda_usd,
    totalSaldoFavor: acc.totalSaldoFavor + prop.total_saldo_favor_usd,
    totalPagado: acc.totalPagado + prop.total_pagado_usd,
  }), { totalPropietarios: 0, totalDeuda: 0, totalSaldoFavor: 0, totalPagado: 0 });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando estado de pagos...</p>
        </div>
      </div>
    );
  }

  const mesesHeader = obtenerMesesHeader();

  const edificioNombre = propiedadSeleccionada 
    ? propiedades.find(p => p.id === propiedadSeleccionada)?.nombre || 'Todos'
    : 'Todos los conjuntos';

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b bg-linear-to-r from-blue-50 to-blue-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-800">📊 Estado de Pagos por Mes</h3>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Conjunto:</span> {edificioNombre}
              <span className="ml-4">
                <span className="font-medium">Actualizado al:</span> {mesActual}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              ⚡ Los pagos se distribuyen desde la deuda más antigua (FIFO)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Año:</label>
              <select
                value={añoSeleccionado}
                onChange={handleAñoChange}
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
              onClick={loadData}
              className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 flex items-center gap-1"
            >
              🔄 Recargar
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-sm text-gray-500">Propietarios</div>
            <div className="text-2xl font-bold text-gray-800">{estadisticasGenerales.totalPropietarios}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-sm text-gray-500">Total Pagado</div>
            <div className="text-2xl font-bold text-green-600">${formatUSD(estadisticasGenerales.totalPagado)}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-sm text-gray-500">Deuda Total</div>
            <div className="text-2xl font-bold text-red-600">${formatUSD(estadisticasGenerales.totalDeuda)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 mt-3 text-sm">
          <span className="font-medium text-gray-700">Leyenda:</span>
          <span className="flex items-center gap-1">
            <span className="text-xl">✅</span>
            <span className="text-gray-700">Pagado</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-xl">⚠️</span>
            <span className="text-gray-700">Abonado (Parcial)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-xl">❌</span>
            <span className="text-gray-700">Adeudado</span>
          </span>
          <span className="text-sm text-gray-400 ml-2">
            👆 Click en un mes para ver los abonos
          </span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">Apto</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-24 bg-gray-50 z-10">Propietario</th>
              {mesesHeader.map((mes) => (
                <th key={mes} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase min-w-13.75">
                  {formatMes(mes)}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-20">Deuda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {estadoPagos.length === 0 ? (
              <tr>
                <td colSpan={mesesHeader.length + 3} className="px-3 py-8 text-center text-gray-500">
                  No hay propietarios registrados para este año
                </td>
              </tr>
            ) : (
              estadoPagos.map((prop) => (
                <React.Fragment key={prop.propietario_id}>
                  <tr className="hover:bg-gray-50 transition">
                    <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white hover:bg-gray-50">
                      {prop.apartamento}
                    </td>
                    <td className="px-3 py-2 text-gray-700 sticky left-24 bg-white hover:bg-gray-50">
                      <button
                        onClick={() => window.location.href = `/propietario/${prop.propietario_id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                      >
                        {prop.nombre}
                      </button>
                    </td>
                    {mesesHeader.map((mes) => {
                      const data = prop.meses[mes];
                      if (!data) {
                        return <td key={mes} className="px-2 py-2 text-center text-gray-300">-</td>;
                      }
                      
                      // ✅ Si es mes futuro sin pago, mostrar vacío
                      if (data.es_futuro && data.total_pagado_usd === 0) {
                        return <td key={mes} className="px-2 py-2 text-center text-gray-200">-</td>;
                      }
                      
                      const emoji = getEstadoEmoji(data.estado, data.total_pagado_usd, data.canon_mensual);
                      const tieneDetalles = data.detalles && data.detalles.length > 0;
                      const totalAbonos = data.detalles.filter(d => d.monto_usd > 0).length;
                      
                      return (
                        <td 
                          key={mes} 
                          className={`px-2 py-2 text-center cursor-pointer relative ${tieneDetalles ? 'hover:bg-blue-50' : ''}`}
                          onClick={() => tieneDetalles && toggleMesExpandido(prop.propietario_id, mes)}
                        >
                          <div className="flex flex-col items-center">
                            <span className="text-xl">{emoji}</span>
                            {tieneDetalles && (
                              <>
                                <span className="text-[9px] text-gray-400 mt-0.5">
                                  {totalAbonos} abono{totalAbonos !== 1 ? 's' : ''}
                                </span>
                                <span className="text-[8px] text-green-600 font-medium">
                                  ${formatUSD(data.total_pagado_usd)}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-medium text-red-600">
                      ${formatUSD(prop.total_deuda_usd)}
                    </td>
                  </tr>
                  
                  {mesExpandido?.startsWith(prop.propietario_id) && (
                    <tr>
                      <td colSpan={mesesHeader.length + 3} className="px-3 py-3 bg-blue-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {Object.entries(prop.meses)
                            .filter(([mesKey, data]) => data.detalles.length > 0)
                            .map(([mesKey, data]) => {
                              const key = `${prop.propietario_id}-${mesKey}`;
                              if (mesExpandido !== key) return null;
                              
                              return (
                                <div key={mesKey} className="bg-white rounded-lg p-3 shadow-sm border border-blue-200">
                                  <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-semibold text-gray-800">{formatMes(mesKey)}</h4>
                                    {getEstadoBadge(data.estado, data.total_pagado_usd, data.canon_mensual)}
                                  </div>
                                  
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Canon:</span>
                                      <span className="font-medium">${formatUSD(data.canon_mensual)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Abonado:</span>
                                      <span className="font-medium text-green-600">${formatUSD(data.total_pagado_usd)}</span>
                                    </div>
                                    {data.deuda_usd > 0 && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">Restante:</span>
                                        <span className="font-medium text-red-600">${formatUSD(data.deuda_usd)}</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {data.detalles.length > 0 && (
                                    <div className="mt-3 pt-2 border-t border-gray-200">
                                      <div className="text-xs font-medium text-gray-600 mb-1.5">
                                        📋 {data.detalles.length} abono{data.detalles.length !== 1 ? 's' : ''}:
                                      </div>
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        {data.detalles.map((detalle, idx) => (
                                          <div key={detalle.id || idx} className="text-xs bg-gray-50 rounded p-1.5">
                                            <div className="flex justify-between items-center">
                                              <span className="text-gray-600">#{idx + 1}</span>
                                              <span className="text-green-600 font-medium">
                                                ${formatUSD(detalle.monto_usd)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between text-gray-400 text-[10px]">
                                              <span>Bs {formatUSD(detalle.monto_bs)}</span>
                                              <span>TC: {detalle.tasa_cambio.toFixed(2)}</span>
                                            </div>
                                            <div className="text-gray-400 text-[10px]">
                                              📅 {formatDate(detalle.fecha_recibo)}
                                            </div>
                                            {detalle.numero_referencia && (
                                              <div className="text-gray-400 text-[9px]">
                                                Ref: {detalle.numero_referencia}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EstadoPagosTable;