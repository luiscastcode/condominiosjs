// src/components/admin/CanonManager.tsx
import React, { useState, useEffect } from 'react';
import { configuracionService } from '../../lib/services/configuracion.service';
import type { CanonHistorial } from '../../types';

const CanonManager: React.FC = () => {
  const [canonActual, setCanonActual] = useState<number>(1);
  const [historial, setHistorial] = useState<CanonHistorial[]>([]);
  const [nuevoCanon, setNuevoCanon] = useState('');
  const [fechaInicio, setFechaInicio] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [actual, historialData] = await Promise.all([
        configuracionService.getCanonActual(),
        configuracionService.getHistorialCanon()
      ]);
      setCanonActual(actual);
      setHistorial(historialData);
    } catch (error) {
      setError('Error al cargar datos del canon');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardarCanon = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const canon = parseFloat(nuevoCanon);
      if (isNaN(canon) || canon <= 0) {
        setError('Ingresa un canon válido (mayor a 0)');
        setIsLoading(false);
        return;
      }

      if (!fechaInicio) {
        setError('Debes seleccionar una fecha de inicio');
        setIsLoading(false);
        return;
      }

      // ✅ Usar la fecha tal como viene del input (YYYY-MM-DD)
      await configuracionService.actualizarCanon(
        canon,
        fechaInicio
      );

      await loadData();
      setNuevoCanon('');
      setSuccess(`✅ Canon actualizado a $${canon} desde ${formatDate(fechaInicio)}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.message || 'Error al actualizar canon');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Función para formatear fecha a dd/mm/yyyy
  const formatDate = (date: string) => {
    if (!date) return '-';
    const partes = date.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return date;
  };

  // ✅ Función para formatear fecha del historial
  const formatHistorialDate = (date: string) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // ✅ Función para determinar si una fecha es válida
  const isValidDate = (date: string) => {
    const d = new Date(date);
    return !isNaN(d.getTime());
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">💰 Canon Mensual</h3>

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

      {/* Canon actual */}
      <div className="bg-blue-50 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Canon mensual actual</p>
            <p className="text-2xl font-bold text-blue-600">${canonActual}</p>
          </div>
          <span className="text-4xl">💵</span>
        </div>
      </div>

      {/* Formulario para actualizar canon */}
      <form onSubmit={handleGuardarCanon} className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nuevo Canon Mensual (USD)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={nuevoCanon}
              onChange={(e) => setNuevoCanon(e.target.value)}
              className="flex-1 border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="1.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Fecha de inicio del nuevo canon
          </label>
          <p className="text-xs text-gray-500 mb-1">
            Esta fecha determina desde cuándo aplica el nuevo canon.
            El canon anterior se aplicará hasta el día anterior.
          </p>
          <input
            type="date"
            required
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {fechaInicio && (
            <p className="text-xs text-blue-600 mt-1">
              Fecha seleccionada: {formatDate(fechaInicio)}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Actualizando...' : 'Actualizar Canon'}
        </button>
      </form>

      {/* Historial de cambios de canon */}
      <div className="border-t pt-4">
        <h4 className="font-medium text-gray-700 mb-3">📋 Historial de Cambios</h4>
        <div className="overflow-x-auto max-h-48 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Canon</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Inicio</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Fin</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                    No hay historial de cambios
                  </td>
                </tr>
              ) : (
                // ✅ Ordenar por fecha_inicio descendente (más reciente primero)
                [...historial]
                  .sort((a, b) => new Date(b.fecha_inicio).getTime() - new Date(a.fecha_inicio).getTime())
                  .map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">${item.canon_usd}</td>
                      <td className="px-3 py-2">{formatHistorialDate(item.fecha_inicio)}</td>
                      <td className="px-3 py-2">
                        {item.fecha_fin ? formatHistorialDate(item.fecha_fin) : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          item.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {item.activo ? '✅ Activo' : 'Histórico'}
                        </span>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Información adicional */}
      <div className="mt-4 text-xs text-gray-400 border-t pt-3">
        <p>💡 El canon mensual se aplica automáticamente según la fecha de cada mes.</p>
        <p>📅 Los cambios de canon afectan a todos los cálculos de deudas y pagos futuros.</p>
        <p>🔹 El formato de fechas es: <span className="font-mono">dd/mm/yyyy</span></p>
      </div>
    </div>
  );
};

export default CanonManager;