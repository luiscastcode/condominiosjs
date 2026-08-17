// src/components/pagos/DistribuirPagos.tsx
import React, { useState, useEffect } from 'react';
import { pagosService } from '../../lib/services/pagos.service';
import { propietariosService } from '../../lib/services/propietarios.service';
import { configuracionService } from '../../lib/services/configuracion.service';
import { dolarapiService } from '../../lib/services/dolarapi.service';
import { evaluarPago, formatBs, formatUSD, formatDate } from '../../lib/utils/monto.utils';
import MontoDisplay from '../shared/MontoDisplay';
import type { Propietario } from '../../types';

interface RecargaPendiente {
  id: string;
  monto_bs: number;
  monto_disponible_bs: number;
  tasa_cambio: number;
  fecha_recibo: string;
  estado_distribucion: string;
}

interface MesDeuda {
  mes: string;
  canon: number;
  deuda_restante_usd: number;
  estado: string;
  monto_pagado_usd: number;
  monto_pagado_bs: number;
  abono_restante: number;
  pago_id: string | null;
}

const DistribuirPagos: React.FC = () => {
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [propietarioSeleccionado, setPropietarioSeleccionado] = useState<string>('');
  const [recargasPendientes, setRecargasPendientes] = useState<RecargaPendiente[]>([]);
  const [recargaSeleccionada, setRecargaSeleccionada] = useState<RecargaPendiente | null>(null);
  const [mesesDeuda, setMesesDeuda] = useState<MesDeuda[]>([]);
  const [asignaciones, setAsignaciones] = useState<{ [mes: string]: number }>({});
  const [montoDisponible, setMontoDisponible] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mostrarDialogo, setMostrarDialogo] = useState<{ mes: string; montoUSD: number } | null>(null);
  const [tasaRecarga, setTasaRecarga] = useState<number>(0);
  const [fechaRecibo, setFechaRecibo] = useState<string>('');
  const [montoOriginalBs, setMontoOriginalBs] = useState<number>(0);

  useEffect(() => {
    cargarPropietarios();
  }, []);

  useEffect(() => {
    if (propietarioSeleccionado) {
      cargarDatosPropietario(propietarioSeleccionado);
    }
  }, [propietarioSeleccionado]);

  const cargarPropietarios = async () => {
    try {
      const data = await propietariosService.getAll();
      setPropietarios(data);
    } catch (error) {
      setError('Error al cargar propietarios');
    }
  };

  const cargarDatosPropietario = async (propietarioId: string) => {
    setIsLoading(true);
    setError('');
    setRecargaSeleccionada(null);
    setMesesDeuda([]);
    setAsignaciones({});

    try {
      const [recargas, meses] = await Promise.all([
        pagosService.getRecargasPendientes(propietarioId),
        pagosService.getMesesDeuda(propietarioId)
      ]);

      setRecargasPendientes(recargas);
      setMesesDeuda(meses);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setError('Error al cargar los datos del propietario');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecargaChange = (recargaId: string) => {
    const recarga = recargasPendientes.find(r => r.id === recargaId);
    if (recarga) {
      setRecargaSeleccionada(recarga);
      setMontoDisponible(recarga.monto_disponible_bs || recarga.monto_bs);
      setTasaRecarga(recarga.tasa_cambio);
      setFechaRecibo(recarga.fecha_recibo);
      setMontoOriginalBs(recarga.monto_bs);
      
      // Inicializar asignaciones en 0 para los meses con deuda
      const nuevasAsignaciones: { [mes: string]: number } = {};
      mesesDeuda.forEach(mes => {
        nuevasAsignaciones[mes.mes] = 0;
      });
      setAsignaciones(nuevasAsignaciones);
    }
  };

  const handleAsignacionChange = (mes: string, valor: number) => {
    const totalAsignado = Object.values(asignaciones).reduce((a, b) => a + b, 0);
    const nuevoTotal = totalAsignado + (valor - (asignaciones[mes] || 0));
    
    if (nuevoTotal > montoDisponible) {
      setError('La suma de las asignaciones supera el monto disponible');
      return;
    }

    setAsignaciones({
      ...asignaciones,
      [mes]: valor
    });
    setError('');
  };

  const handleConfirmarRedondeo = async (mes: string, redondear: boolean) => {
    const montoAsignado = asignaciones[mes] || 0;
    const montoUSD = montoAsignado / tasaRecarga;
    
    if (redondear) {
      const montoAjustadoBs = 15 * tasaRecarga;
      setAsignaciones({
        ...asignaciones,
        [mes]: montoAjustadoBs
      });
    }
    
    setMostrarDialogo(null);
  };

  const handleDistribuir = async () => {
    if (!recargaSeleccionada || !propietarioSeleccionado) {
      setError('Debes seleccionar un propietario y una recarga');
      return;
    }

    const totalAsignado = Object.values(asignaciones).reduce((a, b) => a + b, 0);
    if (totalAsignado === 0) {
      setError('Debes asignar al menos un monto a algún mes');
      return;
    }

    if (totalAsignado > montoDisponible) {
      setError('El total asignado supera el monto disponible');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // ✅ Preparar asignaciones con el mes específico
      const asignacionesArray = Object.entries(asignaciones)
        .filter(([_, monto]) => monto > 0)
        .map(([mes, monto_bs]) => ({ 
          mes,        // ✅ "2026-01" para enero 2026
          monto_bs    // ✅ Monto en Bs asignado a ese mes
        }));

      const result = await pagosService.distribuirRecarga(
        recargaSeleccionada.id,
        propietarioSeleccionado,
        asignacionesArray,
        recargaSeleccionada.tasa_cambio
      );

      if (result.success) {
        setSuccess(result.message);
        await cargarDatosPropietario(propietarioSeleccionado);
        setRecargaSeleccionada(null);
        setAsignaciones({});
      }
    } catch (error: any) {
      console.error('Error distribuyendo pago:', error);
      setError(error.message || 'Error al distribuir el pago');
    } finally {
      setIsLoading(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'completo':
        return 'bg-green-100 text-green-800';
      case 'parcial':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-red-100 text-red-800';
    }
  };

  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'completo':
        return 'Pagado ✅';
      case 'parcial':
        return 'Parcial ⚠️';
      default:
        return 'Adeudado 🔴';
    }
  };

  const totalAsignado = Object.values(asignaciones).reduce((a, b) => a + b, 0);
  const totalAsignadoUSD = totalAsignado / tasaRecarga || 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">📊 Distribuir Pagos</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {/* Selector de Propietario */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Propietario</label>
        <select
          className="w-full p-2 border rounded"
          value={propietarioSeleccionado}
          onChange={(e) => setPropietarioSeleccionado(e.target.value)}
        >
          <option value="">Seleccionar propietario</option>
          {propietarios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} - {p.apartamento}
            </option>
          ))}
        </select>
      </div>

      {propietarioSeleccionado && (
        <>
          {/* Lista de Recargas Pendientes */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Recarga a distribuir</label>
            <select
              className="w-full p-2 border rounded"
              value={recargaSeleccionada?.id || ''}
              onChange={(e) => handleRecargaChange(e.target.value)}
              disabled={isLoading}
            >
              <option value="">Seleccionar recarga</option>
              {recargasPendientes.map((recarga) => {
                const montoUSD = recarga.monto_disponible_bs / recarga.tasa_cambio;
                return (
                  <option key={recarga.id} value={recarga.id}>
                    {formatDate(recarga.fecha_recibo)} - 
                    Bs {formatBs(recarga.monto_disponible_bs)} 
                    (${formatUSD(montoUSD)} aprox)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Detalles de la Recarga Seleccionada */}
          {recargaSeleccionada && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Monto Original</p>
                  <p className="font-bold text-blue-600">Bs {formatBs(montoOriginalBs)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Disponible</p>
                  <p className="font-bold text-green-600">Bs {formatBs(montoDisponible)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Tasa de Cambio</p>
                  <p className="font-bold text-purple-600">
                    {formatUSD(tasaRecarga)} Bs/$
                    <span className="text-xs text-gray-500 block">
                      ({formatDate(fechaRecibo)})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Equivalente en USD</p>
                  <p className="font-bold text-orange-600">
                    ${formatUSD(montoDisponible / tasaRecarga)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabla de Deuda y Asignación */}
          {recargaSeleccionada && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left">Mes</th>
                    <th className="p-2 text-left">Estado</th>
                    <th className="p-2 text-left">Deuda ($)</th>
                    <th className="p-2 text-left">Asignar (Bs)</th>
                    <th className="p-2 text-left">Equiv. ($)</th>
                    <th className="p-2 text-left">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {mesesDeuda.map((mes) => {
                    const montoAsignado = asignaciones[mes.mes] || 0;
                    const montoUSD = montoAsignado / tasaRecarga;
                    const evaluacion = evaluarPago(montoUSD, mes.canon);
                    
                    return (
                      <tr key={mes.mes} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          {new Date(mes.mes + '-01').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(mes.estado)}`}>
                            {getEstadoTexto(mes.estado)}
                          </span>
                        </td>
                        <td className="p-2 font-mono">
                          ${formatUSD(mes.deuda_restante_usd)}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-32 p-1 border rounded focus:ring-blue-500 focus:border-blue-500"
                            value={montoAsignado || ''}
                            onChange={(e) => {
                              const valor = parseFloat(e.target.value) || 0;
                              handleAsignacionChange(mes.mes, valor);
                            }}
                            disabled={mes.estado === 'completo' || isLoading}
                          />
                        </td>
                        <td className="p-2 font-mono">
                          ${formatUSD(montoUSD)}
                          {evaluacion.requiereConfirmacion && (
                            <span className="ml-1 text-yellow-500 cursor-help" title="Monto cercano al canon">
                              ⚠️
                            </span>
                          )}
                          {evaluacion.estado === 'PAGADO' && montoAsignado > 0 && (
                            <span className="ml-1 text-green-500" title="Se redondeará a pago completo">
                              ✅
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {evaluacion.requiereConfirmacion && montoAsignado > 0 && (
                            <button
                              onClick={() => setMostrarDialogo({ mes: mes.mes, montoUSD })}
                              className="text-blue-600 hover:text-blue-800 text-sm underline"
                            >
                              Revisar
                            </button>
                          )}
                          {evaluacion.estado === 'PAGADO' && montoAsignado > 0 && (
                            <span className="text-green-600 text-sm">✅ Redondeo aplicado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-bold">
                  <tr>
                    <td className="p-2 text-right" colSpan={3}>Total Asignado:</td>
                    <td className="p-2 text-blue-600">
                      Bs {formatBs(totalAsignado)}
                    </td>
                    <td className="p-2 text-orange-600" colSpan={2}>
                      ${formatUSD(totalAsignadoUSD)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 text-right" colSpan={3}>Disponible:</td>
                    <td className="p-2 text-green-600">
                      Bs {formatBs(montoDisponible)}
                    </td>
                    <td className="p-2 text-green-600" colSpan={2}>
                      ${formatUSD(montoDisponible / tasaRecarga)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Diálogo de Confirmación de Redondeo */}
          {mostrarDialogo && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h4 className="text-lg font-semibold mb-4">⚠️ Confirmar Redondeo</h4>
                <div className="mb-4">
                  <p className="text-gray-700">
                    El monto para {new Date(mostrarDialogo.mes + '-01').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })} 
                    equivale a <span className="font-bold text-orange-600">${formatUSD(mostrarDialogo.montoUSD)}</span>.
                  </p>
                  <p className="text-gray-600 mt-2">
                    El canon mensual es de <span className="font-bold text-blue-600">$15.00</span>.
                  </p>
                  <p className="text-yellow-600 mt-2 text-sm">
                    El monto está cerca del canon. ¿Cómo deseas proceder?
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleConfirmarRedondeo(mostrarDialogo.mes, true)}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    ✅ Redondear a $15.00 y marcar como PAGADO
                  </button>
                  <button
                    onClick={() => handleConfirmarRedondeo(mostrarDialogo.mes, false)}
                    className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                  >
                    ⚠️ Mantener como ABONO PARCIAL (${formatUSD(mostrarDialogo.montoUSD)})
                  </button>
                  <button
                    onClick={() => setMostrarDialogo(null)}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Botón de Distribución */}
          {recargaSeleccionada && (
            <div className="mt-4 flex gap-4">
              <button
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                onClick={handleDistribuir}
                disabled={isLoading || totalAsignado === 0}
              >
                {isLoading ? 'Procesando...' : '📤 Distribuir Pago'}
              </button>
              {totalAsignado > 0 && (
                <div className="text-sm text-gray-500 self-center">
                  Total: Bs {formatBs(totalAsignado)} (${formatUSD(totalAsignadoUSD)})
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DistribuirPagos;