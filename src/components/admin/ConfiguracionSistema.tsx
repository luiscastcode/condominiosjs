// src/components/admin/ConfiguracionSistema.tsx
import React, { useState, useEffect } from 'react';
import { configuracionService } from '../../lib/services/configuracion.service';
import type { Configuracion } from '../../types';

const ConfiguracionSistema: React.FC = () => {
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null);
  const [fechaInicio, setFechaInicio] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadConfiguracion();
  }, []);

  const loadConfiguracion = async () => {
    setIsLoading(true);
    try {
      const data = await configuracionService.getConfiguracion();
      setConfiguracion(data);
      if (data?.fecha_inicio_operaciones) {
        setFechaInicio(data.fecha_inicio_operaciones);
      }
    } catch (error) {
      setError('Error al cargar configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (!fechaInicio) {
        setError('Debes seleccionar una fecha');
        setIsLoading(false);
        return;
      }

      await configuracionService.setFechaInicioOperaciones(fechaInicio);
      setSuccess('✅ Fecha de inicio actualizada exitosamente');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Error al guardar configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">⚙️ Configuración del Sistema</h3>

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

      <form onSubmit={handleGuardar} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Fecha de Inicio de Operaciones
          </label>
          <p className="text-sm text-gray-500 mb-2">
            Define desde qué mes el sistema debe comenzar a calcular deudas y pagos.
            Todos los meses anteriores a esta fecha se consideran "deuda anterior".
          </p>
          <div className="flex items-center gap-4">
            <input
              type="date"
              required
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="mt-1 block w-full max-w-xs border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {configuracion?.fecha_inicio_operaciones && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              📅 Fecha actual configurada: <span className="font-semibold">{formatDate(configuracion.fecha_inicio_operaciones)}</span>
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Los pagos y deudas se calculan desde esta fecha hasta el mes actual.
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

export default ConfiguracionSistema;