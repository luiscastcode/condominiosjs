// src/components/pagos/RegistroPagoForm.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { propietariosService } from '../../lib/services/propietarios.service';
import { propiedadesService } from '../../lib/services/propiedades.service';
import { configuracionService } from '../../lib/services/configuracion.service';
import { dolarapiService } from '../../lib/services/dolarapi.service';
import type { Propietario, Propiedad, Configuracion } from '../../types';
import { formatBs, formatUSD, formatDate } from '../../lib/utils/monto.utils';

// Lista de bancos de Venezuela
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

interface RegistroPagoFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  propietarioId?: string;
}

const RegistroPagoForm: React.FC<RegistroPagoFormProps> = ({ 
  onSuccess, 
  onCancel,
  propietarioId 
}) => {
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null);
  const [selectedPropietario, setSelectedPropietario] = useState<Propietario | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tasaHistorica, setTasaHistorica] = useState<number | null>(null);
  const [fechaTasa, setFechaTasa] = useState<string>('');
  const [cargandoTasa, setCargandoTasa] = useState(false);
  const [montoCalculado, setMontoCalculado] = useState(0);
  const [montoRegistro, setMontoRegistro] = useState<number | null>(null);
  const [deudaActual, setDeudaActual] = useState<number>(0);
  const [mesesConDeuda, setMesesConDeuda] = useState<number>(0);
  const [mostrarAdvertencia, setMostrarAdvertencia] = useState(false);

  // ✅ Función auxiliar para obtener fecha local
  const getFechaLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Estado del formulario
  const [formData, setFormData] = useState({
    propietario_id: propietarioId || '',
    propiedad_id: '',
    forma_pago: 'transferencia' as 'transferencia' | 'pago_movil' | 'efectivo',
    banco_origen: '',
    numero_referencia: '',
    fecha_pago: getFechaLocal(new Date()),
    fecha_registro: getFechaLocal(new Date()),
    monto_bs: 0,
    monto_usd: 0,
  });

  // Efecto para cargar datos iniciales
  useEffect(() => {
    loadData();
  }, []);

  // Efecto para cargar tasa histórica cuando cambia la fecha del recibo
  useEffect(() => {
    if (formData.fecha_pago) {
      cargarTasaPorFecha(formData.fecha_pago);
    }
  }, [formData.fecha_pago]);

  // Efecto para actualizar el propietario seleccionado
  useEffect(() => {
    if (formData.propietario_id) {
      const prop = propietarios.find(p => p.id === formData.propietario_id);
      setSelectedPropietario(prop || null);
      if (prop) {
        setFormData(prev => ({
          ...prev,
          propiedad_id: prop.propiedad_id,
        }));
        cargarDeudaPropietario(prop.id);
      }
    } else {
      setSelectedPropietario(null);
      setDeudaActual(0);
      setMesesConDeuda(0);
    }
  }, [formData.propietario_id, propietarios]);

  // Efecto para calcular el monto convertido
  useEffect(() => {
    if (tasaHistorica) {
      if (formData.forma_pago === 'efectivo') {
        if (formData.monto_usd > 0) {
          const montoBs = formData.monto_usd * tasaHistorica;
          setMontoCalculado(montoBs);
          setMontoRegistro(formData.monto_usd);
        } else {
          setMontoCalculado(0);
          setMontoRegistro(null);
        }
      } else {
        if (formData.monto_bs > 0) {
          const montoUsd = formData.monto_bs / tasaHistorica;
          setMontoCalculado(montoUsd);
          setMontoRegistro(formData.monto_bs);
        } else {
          setMontoCalculado(0);
          setMontoRegistro(null);
        }
      }
    }
  }, [formData.monto_bs, formData.monto_usd, formData.forma_pago, tasaHistorica]);

  // ✅ Cargar deuda actual del propietario
  const cargarDeudaPropietario = async (propietarioId: string) => {
    try {
      const { data: pagos } = await supabase
        .from('pagos')
        .select('*')
        .eq('propietario_id', propietarioId);

      const hoy = new Date();
      const mesActual = hoy.getMonth() + 1;
      const añoActual = hoy.getFullYear();
      
      let totalDeuda = 0;
      let mesesDeuda = 0;

      for (let m = 1; m <= mesActual; m++) {
        const mesKey = `${añoActual}-${String(m).padStart(2, '0')}`;
        const canon = await configuracionService.getCanonPorFecha(mesKey);
        
        let pagado = 0;
        pagos?.forEach(pago => {
          if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
            pago.desglose_pagos.forEach((item: any) => {
              if (item.mes === mesKey) {
                pagado += item.monto_usd || 0;
              }
            });
          }
        });

        const deuda = Math.max(0, canon - pagado);
        if (deuda > 0) {
          totalDeuda += deuda;
          mesesDeuda++;
        }
      }

      setDeudaActual(totalDeuda);
      setMesesConDeuda(mesesDeuda);
      
      if (totalDeuda > 0) {
        setMostrarAdvertencia(true);
      } else {
        setMostrarAdvertencia(false);
      }
    } catch (error) {
      console.error('Error cargando deuda:', error);
    }
  };

  // Cargar datos iniciales
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [propietariosData, propiedadesData, configData] = await Promise.all([
        propietariosService.getAll(),
        propiedadesService.getAll(),
        configuracionService.getConfiguracion()
      ]);

      setPropietarios(propietariosData);
      setPropiedades(propiedadesData);
      setConfiguracion(configData);

      if (propietarioId) {
        const prop = propietariosData.find(p => p.id === propietarioId);
        if (prop) {
          setFormData(prev => ({
            ...prev,
            propietario_id: prop.id,
            propiedad_id: prop.propiedad_id,
          }));
          cargarDeudaPropietario(prop.id);
        }
      }
    } catch (error) {
      setError('Error al cargar datos');
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar tasa histórica para una fecha
  const cargarTasaPorFecha = async (fecha: string) => {
    setCargandoTasa(true);
    try {
      const tasa = await dolarapiService.getTasaPorFecha(fecha);
      if (tasa && tasa.promedio) {
        setTasaHistorica(tasa.promedio);
        setFechaTasa(tasa.fecha);
        console.log(`💱 Tasa para ${fecha}: Bs ${tasa.promedio}`);
      } else {
        const tasaActual = await dolarapiService.getTasaActual();
        if (tasaActual && tasaActual.promedio) {
          setTasaHistorica(tasaActual.promedio);
          setFechaTasa(tasaActual.fecha);
        } else {
          setTasaHistorica(configuracion?.tasa_cambio || 36.50);
          setFechaTasa(new Date().toISOString().split('T')[0]);
        }
      }
    } catch (error) {
      console.error('Error cargando tasa:', error);
      setTasaHistorica(configuracion?.tasa_cambio || 36.50);
      setFechaTasa(new Date().toISOString().split('T')[0]);
    } finally {
      setCargandoTasa(false);
    }
  };

  // Manejar cambio en el monto según la forma de pago
  const handleMontoChange = (value: number, tipo: 'bs' | 'usd') => {
    if (tipo === 'bs') {
      setFormData(prev => ({ ...prev, monto_bs: value }));
    } else {
      setFormData(prev => ({ ...prev, monto_usd: value }));
    }
  };

  // Enviar formulario
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

      if (formData.forma_pago === 'efectivo') {
        if (!formData.monto_usd || formData.monto_usd <= 0) {
          setError('Debes ingresar un monto en dólares');
          setIsLoading(false);
          return;
        }
      } else {
        if (!formData.monto_bs || formData.monto_bs <= 0) {
          setError('Debes ingresar un monto en Bolívares');
          setIsLoading(false);
          return;
        }
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
        if (formData.numero_referencia.length < 4) {
          setError('El número de referencia debe tener al menos 4 caracteres');
          setIsLoading(false);
          return;
        }
      }

      const tasaFinal = tasaHistorica || configuracion?.tasa_cambio || 36.50;

      let montoUsdFinal = 0;
      let montoBsFinal = 0;

      if (formData.forma_pago === 'efectivo') {
        montoUsdFinal = formData.monto_usd;
        montoBsFinal = formData.monto_usd * tasaFinal;
      } else {
        montoBsFinal = formData.monto_bs;
        montoUsdFinal = formData.monto_bs / tasaFinal;
      }

      const propiedad = propiedades.find(p => p.id === formData.propiedad_id);
      const bancoDestino = propiedad?.banco_nombre || 'No especificado';

      // ✅ CORREGIDO: Asignar mes de referencia (no puede ser null)
      // Este valor es solo para referencia, la distribución usará el desglose
      const mesReferencia = formData.fecha_pago 
        ? formData.fecha_pago.substring(0, 7) 
        : new Date().toISOString().slice(0, 7);

      const pagoData = {
        propietario_id: formData.propietario_id,
        propiedad_id: formData.propiedad_id,
        monto_usd: montoUsdFinal,
        monto_bs: montoBsFinal,
        tasa_cambio: tasaFinal,
        forma_pago: formData.forma_pago,
        banco_origen: formData.forma_pago !== 'efectivo' ? formData.banco_origen : undefined,
        banco_destino: bancoDestino,
        numero_referencia: formData.forma_pago !== 'efectivo' ? formData.numero_referencia : undefined,
        fecha_pago: formData.fecha_pago,
        fecha_registro: getFechaLocal(new Date()),
        mes: mesReferencia, // ✅ Asignar mes de referencia (NO null)
        estado: 'pendiente',
        abono_restante: 0,
        distribuido: false,
        desglose_pagos: null
      };

      const { data: pagoInsertado, error: insertError } = await supabase
        .from('pagos')
        .insert([pagoData])
        .select()
        .single();

      if (insertError) {
        console.error('Error insertando pago:', insertError);
        throw new Error('Error al registrar el pago');
      }

      console.log('✅ Pago registrado:', pagoInsertado);
      
      if (deudaActual > 0) {
        setSuccess(`✅ Pago registrado exitosamente. Monto: ${formatBs(montoBsFinal)} Bs (${formatUSD(montoUsdFinal)} USD). ${mesesConDeuda} mes(es) con deuda pendiente.`);
      } else {
        setSuccess(`✅ Pago registrado exitosamente. Monto: ${formatBs(montoBsFinal)} Bs (${formatUSD(montoUsdFinal)} USD). Pago adelantado, será aplicado a meses futuros.`);
      }
      
      setFormData({
        ...formData,
        monto_bs: 0,
        monto_usd: 0,
        banco_origen: '',
        numero_referencia: '',
      });

      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message || 'Error al registrar pago');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">💰 Registrar Pago</h3>
          <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700">✕</button>
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

        {mostrarAdvertencia && deudaActual > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm mb-4">
            <strong>⚠️ Deuda pendiente:</strong> El propietario tiene <strong>${formatUSD(deudaActual)}</strong> de deuda en <strong>{mesesConDeuda}</strong> mes(es).
            <p className="text-xs mt-1">El pago se distribuirá automáticamente desde el mes más antiguo con deuda.</p>
          </div>
        )}

        {selectedPropietario && deudaActual === 0 && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm mb-4">
            <strong>📅 Pago adelantado:</strong> El propietario no tiene deuda pendiente.
            <p className="text-xs mt-1">El pago se aplicará como adelanto a meses futuros.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {selectedPropietario && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Apartamento:</span>
                  <span className="ml-2 font-medium">{selectedPropietario.apartamento}</span>
                </div>
                <div>
                  <span className="text-gray-500">Cuota:</span>
                  <span className="ml-2 font-medium">${selectedPropietario.cuota_mensual}</span>
                </div>
                <div>
                  <span className="text-gray-500">Teléfono:</span>
                  <span className="ml-2">{selectedPropietario.telefono || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Deuda actual:</span>
                  <span className={`ml-2 font-medium ${deudaActual > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${formatUSD(deudaActual)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Fecha del Recibo Bancario *
            </label>
            <input
              type="date"
              required
              value={formData.fecha_pago}
              onChange={(e) => setFormData({ ...formData, fecha_pago: e.target.value })}
              className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Fecha cuando el propietario realizó el pago (según el recibo del banco)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Forma de Pago *</label>
            <select
              required
              value={formData.forma_pago}
              onChange={(e) => setFormData({ 
                ...formData, 
                forma_pago: e.target.value as any,
                banco_origen: e.target.value === 'efectivo' ? '' : formData.banco_origen,
                numero_referencia: e.target.value === 'efectivo' ? '' : formData.numero_referencia,
                monto_bs: e.target.value === 'efectivo' ? 0 : formData.monto_bs,
                monto_usd: e.target.value === 'efectivo' ? formData.monto_usd : 0,
              })}
              className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="transferencia">🏦 Transferencia Bs</option>
              <option value="pago_movil">📱 Pago Móvil Bs</option>
              <option value="efectivo">💵 Efectivo $</option>
            </select>
          </div>

          {formData.forma_pago !== 'efectivo' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Monto en Bolívares (Bs) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.monto_bs || ''}
                onChange={(e) => handleMontoChange(parseFloat(e.target.value) || 0, 'bs')}
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
              />
              <div className="mt-1 text-sm text-gray-500">
                {tasaHistorica && formData.monto_bs > 0 && (
                  <span>
                    Equivalente: ${formatUSD(formData.monto_bs / tasaHistorica)}
                  </span>
                )}
                {!tasaHistorica && (
                  <span className="text-gray-400">Cargando tasa...</span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Monto en Dólares ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.monto_usd || ''}
                onChange={(e) => handleMontoChange(parseFloat(e.target.value) || 0, 'usd')}
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
              />
              <div className="mt-1 text-sm text-gray-500">
                {tasaHistorica && formData.monto_usd > 0 && (
                  <span>
                    Equivalente: Bs {formatBs(formData.monto_usd * tasaHistorica)}
                  </span>
                )}
                {!tasaHistorica && (
                  <span className="text-gray-400">Cargando tasa...</span>
                )}
              </div>
            </div>
          )}

          {formData.forma_pago !== 'efectivo' && (
            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium text-gray-700">📋 Datos de la Transferencia</h4>
              
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
                  maxLength={50}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Número de referencia de la operación bancaria
                </p>
              </div>
            </div>
          )}

          {tasaHistorica && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-700 mb-2">📋 Resumen</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Tasa de cambio:</span>
                  <span className="ml-2 font-medium text-blue-600">Bs {formatUSD(tasaHistorica)}</span>
                  {fechaTasa && (
                    <span className="text-xs text-gray-400 block">
                      ({formatDate(fechaTasa)})
                    </span>
                  )}
                </div>
                {montoRegistro !== null && (
                  <div>
                    <span className="text-gray-600">
                      {formData.forma_pago === 'efectivo' ? 'Monto en Bs:' : 'Monto en USD:'}
                    </span>
                    <span className="ml-2 font-medium text-green-600">
                      {formData.forma_pago === 'efectivo' 
                        ? `Bs ${formatBs(montoCalculado)}`
                        : `$${formatUSD(montoCalculado)}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

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
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Registrando...
                </>
              ) : (
                '💰 Registrar Pago'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistroPagoForm;