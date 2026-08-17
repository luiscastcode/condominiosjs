// src/components/pagos/RecargaWalletForm.tsx
import React, { useState, useEffect } from 'react';
import { pagosService } from '../../lib/services/pagos.service';
import { propietariosService } from '../../lib/services/propietarios.service';
import { propiedadesService } from '../../lib/services/propiedades.service';
import { dolarapiService } from '../../lib/services/dolarapi.service';
import type { Propietario, Propiedad } from '../../types';

const BANCOS_VENEZUELA = [
  'Banco de Venezuela',
  'Banco Mercantil',
  'Banco Provincial',
  'Banco Nacional de Crédito',
  'Banesco',
  'Banco del Caribe',
  'Banco Exterior',
  'Banco Occidental de Descuento (BOD)',
  'Banco Fondo Común (BFC)',
  'Banco Plaza',
  'Banco Sofitasa',
  'Banco Activo',
  'Banco del Tesoro',
  'Banco Agrícola de Venezuela',
  'Banco de la Fuerza Armada',
  'Banco de la Mujer',
  'Banco de Desarrollo de la Mujer (BANMUJER)',
  'Banco de la Gente',
  'Banco 100% Banco',
  'Banco de Inversión',
  'Banco Arcano',
  'Banco Comercial',
  'Banco de Desarrollo',
  'Banco de Inversión y Desarrollo',
  'Banco del Pueblo Soberano',
  'Banco de Venezuela - Tu Banco',
  'Banco de la Patria',
  'Banco de la Vivienda',
  'Banco de la Producción',
  'Otro'
];

interface RecargaWalletFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  propietarioId?: string;
}

const RecargaWalletForm: React.FC<RecargaWalletFormProps> = ({ 
  onSuccess, 
  onCancel,
  propietarioId 
}) => {
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [selectedPropietario, setSelectedPropietario] = useState<Propietario | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tasaHistorica, setTasaHistorica] = useState<number | null>(null);
  const [fechaTasa, setFechaTasa] = useState<string>('');
  const [cargandoTasa, setCargandoTasa] = useState(false);
  const [montoUsdCalculado, setMontoUsdCalculado] = useState(0);
  const [walletActual, setWalletActual] = useState({ wallet_bs: 0, wallet_usd: 0 });

  const [formData, setFormData] = useState({
    propietario_id: propietarioId || '',
    monto_bs: 0,
    forma_pago: 'transferencia' as 'transferencia' | 'pago_movil' | 'efectivo',
    banco_origen: '',
    numero_referencia: '',
    fecha_recibo: new Date().toISOString().split('T')[0], // Fecha del recibo bancario
    fecha_registro: new Date().toISOString().split('T')[0] // Fecha de registro en sistema
  });

  // Cargar tasa cuando cambia la fecha de recarga
  useEffect(() => {
    if (formData.fecha_recibo) {
      cargarTasaPorFecha(formData.fecha_recibo);
    }
  }, [formData.fecha_recibo]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (formData.propietario_id) {
      const prop = propietarios.find(p => p.id === formData.propietario_id);
      setSelectedPropietario(prop || null);
      if (prop) {
        setWalletActual({
          wallet_bs: prop.wallet_bs || 0,
          wallet_usd: prop.wallet_usd || 0
        });
      }
    } else {
      setSelectedPropietario(null);
    }
  }, [formData.propietario_id, propietarios]);

  useEffect(() => {
    if (tasaHistorica && formData.monto_bs) {
      const usd = formData.monto_bs / tasaHistorica;
      setMontoUsdCalculado(usd);
    }
  }, [formData.monto_bs, tasaHistorica]);


// Actualizar la función cargarTasaPorFecha

const cargarTasaPorFecha = async (fecha: string) => {
  setCargandoTasa(true);
  try {
    const tasa = await dolarapiService.getTasaPorFecha(fecha);
    if (tasa && tasa.promedio) {
      setTasaHistorica(tasa.promedio);
      setFechaTasa(tasa.fecha);
      console.log(`💱 Tasa para ${fecha}: Bs ${tasa.promedio}`);
    } else {
      // Si no encuentra tasa, usar la actual como fallback
      const tasaActual = await dolarapiService.getTasaActual();
      if (tasaActual && tasaActual.promedio) {
        setTasaHistorica(tasaActual.promedio);
        setFechaTasa(tasaActual.fecha);
        console.log(`⚠️ No se encontró tasa para ${fecha}, usando tasa actual: Bs ${tasaActual.promedio}`);
      } else {
        // Fallback final: usar tasa por defecto
        setTasaHistorica(36.50);
        setFechaTasa(new Date().toISOString().split('T')[0]);
        console.log(`⚠️ Usando tasa por defecto: Bs 36.50`);
      }
    }
  } catch (error) {
    console.error('Error cargando tasa:', error);
    setTasaHistorica(36.50);
    setFechaTasa(new Date().toISOString().split('T')[0]);
  } finally {
    setCargandoTasa(false);
  }
};

  const loadData = async () => {
    try {
      const [propietariosData, propiedadesData] = await Promise.all([
        propietariosService.getAll(),
        propiedadesService.getAll()
      ]);
      setPropietarios(propietariosData);
      setPropiedades(propiedadesData);
    } catch (error) {
      setError('Error al cargar datos');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (!formData.propietario_id) {
        setError('Debes seleccionar un propietario');
        setIsLoading(false);
        return;
      }

      if (!formData.monto_bs || formData.monto_bs <= 0) {
        setError('El monto debe ser mayor a 0');
        setIsLoading(false);
        return;
      }

      if (formData.forma_pago !== 'efectivo') {
        if (!formData.banco_origen) {
          setError('Debes seleccionar el banco de origen');
          setIsLoading(false);
          return;
        }
        if (!formData.numero_referencia) {
          setError('Debes ingresar el número de referencia');
          setIsLoading(false);
          return;
        }
      }

      // Usar la tasa histórica o fallback
      const tasaFinal = tasaHistorica || 36.50;

      console.log('💳 Procesando recarga:', {
        propietarioId: formData.propietario_id,
        monto_bs: formData.monto_bs,
        tasa: tasaFinal,
        forma_pago: formData.forma_pago,
        fecha_recibo: formData.fecha_recibo
      });

      // Registrar la recarga con la tasa histórica
      const resultado = await propietariosService.recargarWallet(
        formData.propietario_id,
        formData.monto_bs,
        tasaFinal,
        formData.forma_pago,
        formData.banco_origen,
        formData.numero_referencia,
        formData.fecha_recibo
      );

      // También registrar el pago en la tabla de pagos para el historial
      const propietario = propietarios.find(p => p.id === formData.propietario_id);
      if (propietario) {
        const montoUsd = formData.monto_bs / tasaFinal;
        await pagosService.create({
          propietario_id: formData.propietario_id,
          propiedad_id: propietario.propiedad_id,
          monto_usd: montoUsd,
          monto_bs: formData.monto_bs,
          tasa_cambio: tasaFinal,
          forma_pago: formData.forma_pago,
          banco_origen: formData.banco_origen || 'EFECTIVO',
          banco_destino: 'No especificado',
          numero_referencia: formData.numero_referencia || 'EFECTIVO',
          fecha_pago: formData.fecha_recibo, // Fecha del recibo
          fecha_registro: new Date().toISOString().split('T')[0], // Fecha de registro en sistema
          mes: new Date(formData.fecha_recibo).toISOString().slice(0, 7),
          estado: 'completo',
          abono_restante: 0
        });
      }

      console.log('✅ Recarga completada:', resultado);

      setSuccess(`✅ Wallet recargada exitosamente. Nuevo saldo: $${resultado.wallet_usd.toFixed(2)}`);
      
      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (error: any) {
      console.error('❌ Error en recarga:', error);
      setError(error.message || 'Error al recargar wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    const hasChanges = 
      formData.propietario_id !== (propietarioId || '') ||
      formData.monto_bs !== 0 ||
      formData.forma_pago !== 'transferencia' ||
      formData.banco_origen !== '' ||
      formData.numero_referencia !== '';

    if (hasChanges) {
      if (!confirm('¿Estás seguro de cancelar? Los datos no guardados se perderán.')) {
        return;
      }
    }
    onCancel();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">💳 Recargar Wallet</h3>
          <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700">✕</button>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Propietario */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Propietario *</label>
            <select
              required
              value={formData.propietario_id}
              onChange={(e) => setFormData({ ...formData, propietario_id: e.target.value })}
              className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={!!propietarioId}
            >
              <option value="">Seleccionar propietario</option>
              {propietarios.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.nombre} - {prop.apartamento}
                </option>
              ))}
            </select>
          </div>

          {/* Wallet actual */}
          {selectedPropietario && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Saldo actual:</span>
                  <span className="ml-2 font-medium text-blue-600">Bs {walletActual.wallet_bs.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Saldo en USD:</span>
                  <span className="ml-2 font-medium text-green-600">${walletActual.wallet_usd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Fecha del recibo bancario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Fecha del Recibo Bancario *
              </label>
              <input
                type="date"
                required
                value={formData.fecha_recibo}
                onChange={(e) => setFormData({ ...formData, fecha_recibo: e.target.value })}
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Fecha cuando el propietario realizó el pago (según el recibo del banco)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Fecha de Registro
              </label>
              <input
                type="date"
                disabled
                value={formData.fecha_registro}
                className="mt-1 block w-full border rounded-md p-2 bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Fecha cuando se registra en el sistema (automática)
              </p>
            </div>
          </div>

          {/* Monto y tasa */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Monto a recargar (Bs) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.monto_bs}
                onChange={(e) => setFormData({ ...formData, monto_bs: parseFloat(e.target.value) || 0 })}
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Equivalente en USD</label>
              <input
                type="text"
                disabled
                value={montoUsdCalculado > 0 ? `$${montoUsdCalculado.toFixed(2)}` : '$0.00'}
                className="mt-1 block w-full border rounded-md p-2 bg-gray-50"
              />
              {cargandoTasa ? (
                <p className="text-xs text-gray-400 mt-1">Cargando tasa...</p>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Tasa: Bs {tasaHistorica?.toFixed(2) || 'No disponible'} por $
                  </p>
                  {fechaTasa && (
                    <span className="text-xs text-green-600">
                      ✅ {formatDate(fechaTasa)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Forma de pago */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Forma de Pago *</label>
            <select
              required
              value={formData.forma_pago}
              onChange={(e) => setFormData({ 
                ...formData, 
                forma_pago: e.target.value as any,
                banco_origen: e.target.value === 'efectivo' ? '' : formData.banco_origen,
                numero_referencia: e.target.value === 'efectivo' ? '' : formData.numero_referencia
              })}
              className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="transferencia">🏦 Transferencia Bs</option>
              <option value="pago_movil">📱 Pago Móvil Bs</option>
              <option value="efectivo">💵 Efectivo $</option>
            </select>
          </div>

          {/* Campos de referencia */}
          {formData.forma_pago !== 'efectivo' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Banco de Origen *</label>
                <select
                  required
                  value={formData.banco_origen}
                  onChange={(e) => setFormData({ ...formData, banco_origen: e.target.value })}
                  className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar banco</option>
                  {BANCOS_VENEZUELA.map((banco) => (
                    <option key={banco} value={banco}>{banco}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Número de Referencia *</label>
                <input
                  type="text"
                  required
                  value={formData.numero_referencia}
                  onChange={(e) => setFormData({ ...formData, numero_referencia: e.target.value })}
                  className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="1234567890"
                />
              </div>
            </div>
          )}

          {/* Resumen */}
          {selectedPropietario && formData.monto_bs > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-700 mb-2">📋 Resumen de Recarga</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Monto a recargar:</span>
                  <span className="ml-2 font-medium text-green-600">Bs {formData.monto_bs.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Equivalente en USD:</span>
                  <span className="ml-2 font-medium text-blue-600">${montoUsdCalculado.toFixed(2)}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Nuevo saldo:</span>
                  <span className="ml-2 font-bold text-green-700">
                    Bs {(walletActual.wallet_bs + formData.monto_bs).toFixed(2)} 
                    (${(walletActual.wallet_usd + montoUsdCalculado).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Tasa aplicada en el resumen */}
              <div className="mt-2 pt-2 border-t text-sm">
                <span className="text-gray-600">💱 Tasa aplicada:</span>
                <span className="ml-2 font-medium text-blue-600">Bs {tasaHistorica?.toFixed(2) || 'No disponible'}</span>
                {fechaTasa && (
                  <span className="ml-2 text-xs text-gray-400">
                    ({formatDate(fechaTasa)})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border rounded hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || cargandoTasa}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando...
                </>
              ) : (
                '💳 Recargar Wallet'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecargaWalletForm;