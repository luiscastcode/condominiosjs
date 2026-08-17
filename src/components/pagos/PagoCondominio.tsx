// src/components/pagos/PagoCondominio.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { propietariosService } from '../../lib/services/propietarios.service';
import { pagoCondominioService } from '../../lib/services/pago-condominio.service';
import { formatBs, formatUSD, formatDate } from '../../lib/utils/monto.utils';
import type { Propietario } from '../../types';

interface PagoCondominioProps {
  propietarioId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface PagoRegistrado {
  id: string;
  monto_bs: number;
  tasa_cambio: number;
  fecha_pago: string;
  forma_pago: string;
  banco_origen: string;
  numero_referencia: string;
  monto_usd: number;
  distribuido: boolean;
}

const PagoCondominio: React.FC<PagoCondominioProps> = ({ 
  propietarioId, 
  onSuccess, 
  onCancel 
}) => {
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [selectedPropietario, setSelectedPropietario] = useState<Propietario | null>(null);
  const [pagosRegistrados, setPagosRegistrados] = useState<PagoRegistrado[]>([]);
  const [pagoSeleccionado, setPagoSeleccionado] = useState<PagoRegistrado | null>(null);
  const [mesesMorosos, setMesesMorosos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [distribucion, setDistribucion] = useState<any>(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  useEffect(() => {
    loadPropietarios();
  }, []);

  useEffect(() => {
    if (selectedPropietario) {
      loadPagosRegistrados(selectedPropietario.id);
      loadMesesMorosos(selectedPropietario.id);
    }
  }, [selectedPropietario]);

  const loadPropietarios = async () => {
    try {
      const data = await propietariosService.getAll();
      setPropietarios(data);
      if (propietarioId) {
        const prop = data.find(p => p.id === propietarioId);
        if (prop) setSelectedPropietario(prop);
      }
    } catch (error) {
      setError('Error al cargar propietarios');
    }
  };

  const loadPagosRegistrados = async (propietarioId: string) => {
    try {
      console.log('🔍 Cargando pagos para propietario:', propietarioId);
      
      const { data, error } = await supabase
        .from('pagos')
        .select('*')
        .eq('propietario_id', propietarioId)
        .eq('distribuido', false)
        .order('fecha_pago', { ascending: false });

      if (error) {
        console.error('❌ Error fetching pagos:', error);
        throw error;
      }

      // Filtrar pagos sin desglose
      const pagosSinDistribuir = (data || []).filter(pago => {
        const sinDesglose = !pago.desglose_pagos || 
                            (Array.isArray(pago.desglose_pagos) && pago.desglose_pagos.length === 0) ||
                            pago.desglose_pagos === null ||
                            pago.desglose_pagos === undefined ||
                            (typeof pago.desglose_pagos === 'string' && 
                             (pago.desglose_pagos === '[]' || pago.desglose_pagos === 'null'));
        
        return sinDesglose;
      });

      console.log('✅ Pagos sin distribuir:', pagosSinDistribuir.length);
      setPagosRegistrados(pagosSinDistribuir);
    } catch (error) {
      console.error('Error loading pagos registrados:', error);
      setPagosRegistrados([]);
    }
  };

  const loadMesesMorosos = async (propietarioId: string) => {
    try {
      const meses = await pagoCondominioService.getMesesMorosos(propietarioId);
      setMesesMorosos(meses);
      
      console.log('📋 Meses morosos cargados:');
      meses.filter(m => m.deuda_restante_usd > 0).forEach(m => {
        console.log(`  - ${m.mes}: $${m.deuda_restante_usd.toFixed(2)} (${m.estado})`);
      });
    } catch (error) {
      console.error('Error loading meses morosos:', error);
    }
  };

  const handleDistribuir = async () => {
    if (!pagoSeleccionado || !selectedPropietario) {
      setError('Debes seleccionar un propietario y un pago');
      return;
    }

    // ✅ Verificar que haya meses con deuda
    const mesesConDeuda = mesesMorosos.filter(m => m.deuda_restante_usd > 0);
    if (mesesConDeuda.length === 0) {
      setError('El propietario no tiene meses con deuda');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      console.log('📤 Distribuyendo pago...');
      console.log('💰 Pago seleccionado:', pagoSeleccionado.id);
      
      const resultado = await pagoCondominioService.distribuirPagoCondominio(
        selectedPropietario.id,
        pagoSeleccionado.id,
        pagoSeleccionado.monto_bs,
        pagoSeleccionado.tasa_cambio,
        pagoSeleccionado.fecha_pago  // ✅ La fecha del recibo se pasa pero NO determina el mes
      );

      setDistribucion(resultado);
      setMostrarConfirmacion(true);
      
      // Recargar datos
      await loadPagosRegistrados(selectedPropietario.id);
      await loadMesesMorosos(selectedPropietario.id);
      
      setSuccess(`✅ Distribución completada. ${resultado.mesesCubiertos} mes(es) cubiertos.`);
      
    } catch (error: any) {
      console.error('❌ Error distribuyendo:', error);
      setError(error.message || 'Error al distribuir el pago');
    } finally {
      setIsLoading(false);
    }
  };

  const formatMes = (mes: string) => {
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
      return <span className="px-2 py-1 bg-gray-100 text-gray-400 rounded-full text-xs font-medium">⏳ Futuro</span>;
    default:
      return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">❌ Adeudado</span>;
  }
}

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">📊 Distribuir Pago de Condominio</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm mb-4">
            {success}
          </div>
        )}

        {/* Selector de Propietario */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Propietario</label>
          <select
            className="w-full p-2 border rounded"
            value={selectedPropietario?.id || ''}
            onChange={(e) => {
              const prop = propietarios.find(p => p.id === e.target.value);
              setSelectedPropietario(prop || null);
              setPagoSeleccionado(null);
              setDistribucion(null);
              setMostrarConfirmacion(false);
            }}
          >
            <option value="">Seleccionar propietario</option>
            {propietarios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} - {p.apartamento}
              </option>
            ))}
          </select>
        </div>

        {selectedPropietario && (
          <>
            {/* Información del propietario */}
            <div className="bg-gray-50 p-3 rounded-lg mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Apartamento:</span>
                  <span className="ml-2 font-medium">{selectedPropietario.apartamento}</span>
                </div>
                <div>
                  <span className="text-gray-500">Canon:</span>
                  <span className="ml-2 font-medium">${selectedPropietario.cuota_mensual}</span>
                </div>
                <div>
                  <span className="text-gray-500">Teléfono:</span>
                  <span className="ml-2">{selectedPropietario.telefono || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Meses con deuda:</span>
                  <span className="ml-2 font-medium text-red-600">
                    {mesesMorosos.filter(m => m.deuda_restante_usd > 0).length}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista de pagos registrados */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pagos Registrados (sin distribuir)
              </label>
              <select
                className="w-full p-2 border rounded"
                value={pagoSeleccionado?.id || ''}
                onChange={(e) => {
                  const pago = pagosRegistrados.find(p => p.id === e.target.value);
                  setPagoSeleccionado(pago || null);
                  setDistribucion(null);
                  setMostrarConfirmacion(false);
                }}
              >
                <option value="">Seleccionar pago</option>
                {pagosRegistrados.map((pago) => {
                  const montoUsd = pago.monto_bs / pago.tasa_cambio;
                  return (
                    <option key={pago.id} value={pago.id}>
                      📅 {formatDate(pago.fecha_pago)} - Bs {formatBs(pago.monto_bs)} 
                      (${formatUSD(montoUsd)}) - {pago.forma_pago}
                    </option>
                  );
                })}
              </select>
              {pagosRegistrados.length === 0 && (
                <p className="text-sm text-gray-500 mt-1">No hay pagos pendientes de distribución</p>
              )}
            </div>

            {/* Mostrar detalles del pago seleccionado */}
            {pagoSeleccionado && (
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Detalles del Pago</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Monto Bs:</span>
                    <span className="ml-2 font-medium">Bs {formatBs(pagoSeleccionado.monto_bs)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Tasa:</span>
                    <span className="ml-2 font-medium">Bs {formatUSD(pagoSeleccionado.tasa_cambio)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Equivalente USD:</span>
                    <span className="ml-2 font-medium text-green-600">
                      ${formatUSD(pagoSeleccionado.monto_bs / pagoSeleccionado.tasa_cambio)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Fecha Recibo:</span>
                    <span className="ml-2">{formatDate(pagoSeleccionado.fecha_pago)}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  ⚠️ La fecha del recibo NO determina el mes de aplicación. El pago se distribuye desde la deuda más antigua.
                </p>
              </div>
            )}


{/* Tabla de meses - Mostrar TODOS los meses del año */}
{mesesMorosos.length > 0 && (
  <div className="mb-4">
    <h4 className="font-medium text-gray-700 mb-2">📋 Estado de Meses</h4>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mes</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Canon</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pagado ($)</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Deuda ($)</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {mesesMorosos.map((mes) => {
            const esFuturo = mes.es_futuro || false;
            const esPagado = mes.estado === 'completo' || mes.pagado_usd > 0;
            const tieneDeuda = mes.deuda_restante_usd > 0;
            
            return (
              <tr 
                key={mes.mes} 
                className={`hover:bg-gray-50 transition ${
                  esFuturo && !esPagado ? 'bg-gray-50/30 text-gray-400' : ''
                }`}
              >
                <td className="px-3 py-2 font-medium">
                  {formatMes(mes.mes)}
                </td>
                <td className="px-3 py-2">${mes.canon}</td>
                <td className="px-3 py-2 text-green-600">
                  {mes.pagado_usd > 0 ? `$${formatUSD(mes.pagado_usd)}` : '-'}
                </td>
                <td className="px-3 py-2 font-medium">
                  {tieneDeuda ? (
                    <span className="text-red-600">${formatUSD(mes.deuda_restante_usd)}</span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {getEstadoBadge(mes.estado)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
)}

            {/* Botón de distribución */}
            {pagoSeleccionado && mesesMorosos.filter(m => m.deuda_restante_usd > 0).length > 0 && (
              <button
                onClick={handleDistribuir}
                disabled={isLoading}
                className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {isLoading ? 'Distribuyendo...' : '📤 Distribuir Pago entre Meses con Deuda'}
              </button>
            )}

            {/* Mostrar resultado de la distribución */}
            {distribucion && mostrarConfirmacion && (
              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">📊 Resultado de la Distribución</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-gray-500">Total Asignado:</span>
                    <span className="ml-2 font-medium text-green-600">
                      ${formatUSD(distribucion.totalAsignadoUsd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Meses Cubiertos:</span>
                    <span className="ml-2 font-medium text-blue-600">{distribucion.mesesCubiertos}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Sobrante:</span>
                    <span className="ml-2 font-medium text-yellow-600">
                      ${formatUSD(distribucion.sobranteUsd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Sobrante en Bs:</span>
                    <span className="ml-2 font-medium text-yellow-600">
                      Bs {formatBs(distribucion.sobranteBs)}
                    </span>
                  </div>
                </div>

                {/* Detalle de la distribución */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mes</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Monto Bs</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Monto USD</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Deuda Restante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {distribucion.distribucion.map((item: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{formatMes(item.mes)}</td>
                          <td className="px-3 py-2">Bs {formatBs(item.monto_bs_asignado)}</td>
                          <td className="px-3 py-2">${formatUSD(item.monto_usd_asignado)}</td>
                          <td className="px-3 py-2">{getEstadoBadge(item.estado)}</td>
                          <td className="px-3 py-2">
                            {item.deuda_restante_usd > 0 && (
                              <span className="text-red-600">${formatUSD(item.deuda_restante_usd)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={() => {
                    setMostrarConfirmacion(false);
                    onSuccess();
                  }}
                  className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  ✅ Finalizar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PagoCondominio;