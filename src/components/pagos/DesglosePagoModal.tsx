// src/components/pagos/DesglosePagoModal.tsx
import React, { useState, useEffect } from 'react';
import { pagosService } from '../../lib/services/pagos.service';
import type { DesglosePago } from '../../types';

interface DesglosePagoModalProps {
  pagoId: string;
  onClose: () => void;
}

const DesglosePagoModal: React.FC<DesglosePagoModalProps> = ({ pagoId, onClose }) => {
  const [desglose, setDesglose] = useState<DesglosePago[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDesglose();
  }, [pagoId]);

  const loadDesglose = async () => {
    setIsLoading(true);
    try {
      const data = await pagosService.getDesglosePago(pagoId);
      if (data) {
        setDesglose(data);
      }
    } catch (error) {
      setError('Error al cargar desglose');
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
      case 'pendiente':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'completo':
        return '✅ Completo';
      case 'parcial':
        return '⚠️ Parcial';
      case 'pendiente':
        return '❌ Pendiente';
      default:
        return estado;
    }
  };

  const formatMes = (mes: string) => {
    const [year, month] = mes.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">📋 Desglose del Pago</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">
            ❌ {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando desglose...</p>
          </div>
        ) : desglose.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No hay desglose disponible para este pago
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mes</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Monto ($)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Monto (Bs)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {desglose.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium">
                      {formatMes(item.mes)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      ${item.monto_usd.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      Bs {item.monto_bs.toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getEstadoColor(item.estado)}`}>
                          {getEstadoTexto(item.estado)}
                        </span>
                        {item.abono_restante && item.abono_restante > 0 && (
                          <span className="text-xs text-gray-500">
                            Restante: ${item.abono_restante.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesglosePagoModal;