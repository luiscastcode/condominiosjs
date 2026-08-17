// src/components/admin/TasaCambioManager.tsx
import React, { useState, useEffect } from 'react';
import { pagosService } from '../../lib/services/pagos.service';
import { dolarapiService } from '../../lib/services/dolarapi.service';
import type { TasaCambioHistorial } from '../../types';

const TasaCambioManager: React.FC = () => {
  const [tasaActual, setTasaActual] = useState<TasaCambioHistorial | null>(null);
  const [historial, setHistorial] = useState<TasaCambioHistorial[]>([]);
  const [tasaDia, setTasaDia] = useState<{ moneda: string; promedio: number; fechaFormateada: string } | null>(null);
  const [nuevaTasa, setNuevaTasa] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [actual, historialData, tasaDiaData] = await Promise.all([
        pagosService.getTasaCambioActual(),
        pagosService.getHistorialTasaCambio(30),
        dolarapiService.getTasaDiaFormateada()
      ]);
      setTasaActual(actual);
      setHistorial(historialData);
      if (tasaDiaData) {
        setTasaDia({
          moneda: tasaDiaData.moneda,
          promedio: tasaDiaData.promedio,
          fechaFormateada: tasaDiaData.fechaFormateada
        });
      }
    } catch (error) {
      setError('Error al cargar datos de tasa de cambio');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardarTasa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const tasa = parseFloat(nuevaTasa);
      if (isNaN(tasa) || tasa <= 0) {
        setError('Ingresa una tasa válida');
        setIsLoading(false);
        return;
      }

      // Guardar sin usuario (opcional)
      await pagosService.guardarTasaCambio(tasa);
      await loadData();
      setNuevaTasa('');
      setSuccess('✅ Tasa de cambio actualizada exitosamente');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Error al guardar tasa de cambio');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">💱 Tasa de Cambio</h3>

            {/* Tasa del día (desde API) */}
      {tasaDia && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tasa del día (Oficial)</p>
              <p className="text-2xl font-bold text-green-600">Bs {tasaDia.promedio.toFixed(2)}</p>
              <p className="text-xs text-gray-500">Actualizada: {tasaDia.fechaFormateada}</p>
              <p className="text-xs text-gray-400">Moneda: {tasaDia.moneda}</p>
            </div>
            <span className="text-4xl">💵</span>
          </div>
          <p className="text-xs text-blue-600 mt-2">
            ✅ Esta es la tasa oficial del día de hoy, usada para información en el sistema.
          </p>
        </div>
      )}

      {/* Tasa actual (guardada en el sistema) */}
      <div className="bg-blue-50 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Tasa guardada en el sistema</p>
            <p className="text-2xl font-bold text-blue-600">
              Bs {tasaActual?.tasa?.toFixed(2) || 'No establecida'}
            </p>
            {tasaActual?.fecha && (
              <p className="text-xs text-gray-500">
                Actualizada: {formatDate(tasaActual.fecha)}
              </p>
            )}
          </div>
          <span className="text-4xl">🏦</span>
        </div>
        <p className="text-xs text-blue-600 mt-2">
          ⚠️ Esta tasa se usa para cálculos de pagos históricos. La tasa del día se obtiene automáticamente de la API.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-2 rounded-lg text-sm mb-4">
          {success}
        </div>
      )}

  

      {/* Formulario para actualizar tasa */}
      <form onSubmit={handleGuardarTasa} className="mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nueva Tasa (Bs/$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={nuevaTasa}
              onChange={(e) => setNuevaTasa(e.target.value)}
              className="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: 36.50"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Guardando...' : 'Actualizar Tasa'}
          </button>
        </div>
      </form>

      {/* Historial */}
      <div className="border-t pt-4">
        <h4 className="font-medium text-gray-700 mb-3">Historial de Tasas</h4>
        <div className="overflow-x-auto max-h-48 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-center text-gray-500">
                    No hay historial de tasas
                  </td>
                </tr>
              ) : (
                historial.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{formatDate(item.fecha)}</td>
                    <td className="px-3 py-2 font-medium">Bs {item.tasa.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TasaCambioManager;