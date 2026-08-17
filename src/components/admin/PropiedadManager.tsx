// src/components/admin/PropiedadManager.tsx
import React, { useState, useEffect } from 'react';
import { propiedadesService } from '../../lib/services/propiedades.service';
import type { Propiedad, Torre, TipoPropiedad } from '../../types';

// Lista de bancos en Venezuela
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

// Configuración de tipos de propiedad
const TIPOS_PROPIEDAD: { value: TipoPropiedad; label: string; icon: string; descripcion: string }[] = [
  { 
    value: 'edificio', 
    label: 'Edificio', 
    icon: '🏢',
    descripcion: 'Edificio residencial o de oficinas'
  },
  { 
    value: 'torre', 
    label: 'Torre', 
    icon: '🏗️',
    descripcion: 'Torre independiente o parte de un conjunto'
  },
  { 
    value: 'bloque', 
    label: 'Bloque', 
    icon: '🧱',
    descripcion: 'Bloque de apartamentos o casas'
  },
  { 
    value: 'casa', 
    label: 'Casa', 
    icon: '🏠',
    descripcion: 'Casa unifamiliar o quinta'
  },
  { 
    value: 'otro', 
    label: 'Otro', 
    icon: '📍',
    descripcion: 'Local comercial, oficina, etc.'
  },
];

const PropiedadManager: React.FC = () => {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [selectedPropiedad, setSelectedPropiedad] = useState<Propiedad | null>(null);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showTorreForm, setShowTorreForm] = useState(false);
  const [editingPropiedad, setEditingPropiedad] = useState<Propiedad | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    nombre: '',
    tipo: 'edificio' as TipoPropiedad,
    direccion: '',
    ciudad: '',
    estado: '',
    descripcion: '',
    tiene_torres: false,
    // Datos bancarios
    banco_nombre: '',
    banco_cuenta: '',
    banco_tipo_cuenta: 'corriente',
    banco_cedula_rif: '',
    // Datos de pago móvil
    pago_movil_telefono: '',
    pago_movil_cedula: '',
    pago_movil_banco: '',
    // Datos de contacto
    telefono_contacto: '',
    email_contacto: '',
    horario_atencion: ''
  });

  const [torreData, setTorreData] = useState({
    nombre: '',
    numero_pisos: 1
  });

  useEffect(() => {
    loadPropiedades();
  }, []);

  const loadPropiedades = async () => {
    setIsLoading(true);
    try {
      const data = await propiedadesService.getAll();
      setPropiedades(data);
    } catch (error) {
      setError('Error al cargar propiedades');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTorres = async (propiedadId: string) => {
    try {
      const data = await propiedadesService.getTorres(propiedadId);
      setTorres(data);
    } catch (error) {
      setError('Error al cargar torres');
    }
  };

  const handleSelectPropiedad = async (propiedad: Propiedad) => {
    setSelectedPropiedad(propiedad);
    await loadTorres(propiedad.id);
  };

  const handleReload = async () => {
    setError('');
    setSuccess('');
    await loadPropiedades();
    if (selectedPropiedad) {
      await loadTorres(selectedPropiedad.id);
    }
    setSuccess('✅ Datos recargados exitosamente');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (!formData.nombre.trim()) {
        setError('El nombre de la propiedad es obligatorio');
        setIsLoading(false);
        return;
      }

      if (editingPropiedad) {
        const updated = await propiedadesService.update(editingPropiedad.id, formData);
        setPropiedades(propiedades.map(p => p.id === updated.id ? updated : p));
        setSuccess('✅ Propiedad actualizada exitosamente');
      } else {
        const newPropiedad = await propiedadesService.create(formData);
        setPropiedades([...propiedades, newPropiedad]);
        setSuccess('✅ Propiedad creada exitosamente');
      }
      
      setShowForm(false);
      setEditingPropiedad(null);
      resetFormData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.message || 'Error al guardar propiedad');
    } finally {
      setIsLoading(false);
    }
  };

  const resetFormData = () => {
    setFormData({
      nombre: '',
      tipo: 'edificio',
      direccion: '',
      ciudad: '',
      estado: '',
      descripcion: '',
      tiene_torres: false,
      banco_nombre: '',
      banco_cuenta: '',
      banco_tipo_cuenta: 'corriente',
      banco_cedula_rif: '',
      pago_movil_telefono: '',
      pago_movil_cedula: '',
      pago_movil_banco: '',
      telefono_contacto: '',
      email_contacto: '',
      horario_atencion: ''
    });
  };

  const handleDeletePropiedad = async (id: string, nombre: string) => {
    if (!confirm(`⚠️ ¿Estás seguro de eliminar "${nombre}"?`)) return;
    if (!confirm(`⚠️ ADVERTENCIA: Se eliminarán TODOS los propietarios y torres asociados. ¿Continuar?`)) return;

    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      await propiedadesService.delete(id);
      setPropiedades(prevPropiedades => prevPropiedades.filter(p => p.id !== id));
      if (selectedPropiedad?.id === id) {
        setSelectedPropiedad(null);
        setTorres([]);
      }
      setSuccess(`✅ "${nombre}" eliminada exitosamente`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (error: any) {
      setError(`❌ Error al eliminar "${nombre}": ${error.message || 'Error desconocido'}`);
      await loadPropiedades();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTorre = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar la torre "${nombre}"?`)) return;

    setError('');
    setSuccess('');

    try {
      await propiedadesService.deleteTorre(id);
      setTorres(torres.filter(t => t.id !== id));
      setSuccess(`✅ Torre "${nombre}" eliminada exitosamente`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(`❌ Error al eliminar torre: ${error.message || 'Error desconocido'}`);
      if (selectedPropiedad) {
        await loadTorres(selectedPropiedad.id);
      }
    }
  };

  const handleCreateTorre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropiedad) return;

    setError('');
    setSuccess('');

    try {
      const newTorre = await propiedadesService.createTorre({
        ...torreData,
        propiedad_id: selectedPropiedad.id
      });
      setTorres([...torres, newTorre]);
      setShowTorreForm(false);
      setSuccess('✅ Torre creada exitosamente');
      setTorreData({ nombre: '', numero_pisos: 1 });
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Error al crear torre');
    }
  };

  const handleEdit = (propiedad: Propiedad) => {
    setEditingPropiedad(propiedad);
    setFormData({
      nombre: propiedad.nombre,
      tipo: propiedad.tipo || 'edificio',
      direccion: propiedad.direccion || '',
      ciudad: propiedad.ciudad || '',
      estado: propiedad.estado || '',
      descripcion: propiedad.descripcion || '',
      tiene_torres: propiedad.tiene_torres || false,
      banco_nombre: propiedad.banco_nombre || '',
      banco_cuenta: propiedad.banco_cuenta || '',
      banco_tipo_cuenta: propiedad.banco_tipo_cuenta || 'corriente',
      banco_cedula_rif: propiedad.banco_cedula_rif || '',
      pago_movil_telefono: propiedad.pago_movil_telefono || '',
      pago_movil_cedula: propiedad.pago_movil_cedula || '',
      pago_movil_banco: propiedad.pago_movil_banco || '',
      telefono_contacto: propiedad.telefono_contacto || '',
      email_contacto: propiedad.email_contacto || '',
      horario_atencion: propiedad.horario_atencion || ''
    });
    setShowForm(true);
  };

  const getTipoLabel = (tipo: TipoPropiedad) => {
    return TIPOS_PROPIEDAD.find(t => t.value === tipo)?.label || tipo;
  };

  const getTipoIcon = (tipo: TipoPropiedad) => {
    return TIPOS_PROPIEDAD.find(t => t.value === tipo)?.icon || '📍';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando propiedades...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold">🏢 Gestión de Conjuntos Residenciales</h3>
        <div className="flex gap-2">
          <button
            onClick={handleReload}
            className="bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300 flex items-center gap-1"
            title="Recargar datos"
          >
            🔄 Recargar
          </button>
          <button
            onClick={() => {
              setEditingPropiedad(null);
              resetFormData();
              setShowForm(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            + Nueva Propiedad
          </button>
        </div>
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

      {/* Lista de propiedades */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {propiedades.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            No hay propiedades registradas
          </div>
        ) : (
          propiedades.map((prop) => (
            <div
              key={prop.id}
              className={`p-4 border rounded-lg cursor-pointer transition ${
                selectedPropiedad?.id === prop.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              onClick={() => handleSelectPropiedad(prop)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getTipoIcon(prop.tipo)}</span>
                    <h4 className="font-semibold">{prop.nombre}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {getTipoLabel(prop.tipo)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {prop.ciudad}, {prop.estado}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {prop.torres?.length || 0} torres
                    </span>
                    {prop.tiene_torres && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                        Con torres
                      </span>
                    )}
                    {prop.banco_nombre && (
                      <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded">
                        🏦 {prop.banco_nombre}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(prop);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Editar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePropiedad(prop.id, prop.nombre);
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detalles de la propiedad seleccionada */}
      {selectedPropiedad && (
        <div className="border-t pt-4">
          {/* Datos generales */}
          <div className="mb-4">
            <h4 className="font-semibold flex items-center gap-2">
              <span>{getTipoIcon(selectedPropiedad.tipo)}</span>
              Detalles de {selectedPropiedad.nombre}
            </h4>
            {selectedPropiedad.descripcion && (
              <p className="text-sm text-gray-500 mt-1">{selectedPropiedad.descripcion}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Datos Bancarios */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span>🏦</span> Datos Bancarios
              </h5>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Banco:</span> {selectedPropiedad.banco_nombre || 'No configurado'}</p>
                <p><span className="text-gray-500">Cuenta:</span> {selectedPropiedad.banco_cuenta || '-'}</p>
                <p><span className="text-gray-500">Tipo de Cuenta:</span> {selectedPropiedad.banco_tipo_cuenta || '-'}</p>
                <p><span className="text-gray-500">Cédula/RIF:</span> {selectedPropiedad.banco_cedula_rif || '-'}</p>
              </div>
            </div>

            {/* Datos de Pago Móvil */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span>📱</span> Datos de Pago Móvil
              </h5>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Teléfono:</span> {selectedPropiedad.pago_movil_telefono || 'No configurado'}</p>
                <p><span className="text-gray-500">Cédula:</span> {selectedPropiedad.pago_movil_cedula || '-'}</p>
                <p><span className="text-gray-500">Banco Asociado:</span> {selectedPropiedad.pago_movil_banco || '-'}</p>
              </div>
            </div>

            {/* Datos de Contacto */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span>📞</span> Datos de Contacto
              </h5>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Teléfono:</span> {selectedPropiedad.telefono_contacto || 'No configurado'}</p>
                <p><span className="text-gray-500">Email:</span> {selectedPropiedad.email_contacto || '-'}</p>
                <p><span className="text-gray-500">Horario de Atención:</span> {selectedPropiedad.horario_atencion || '-'}</p>
              </div>
            </div>

            {/* Torres */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold text-gray-700 flex items-center gap-2">
                  <span>🏗️</span> Torres / Bloques
                </h5>
                {selectedPropiedad.tiene_torres && (
                  <button
                    onClick={() => setShowTorreForm(true)}
                    className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 text-xs"
                  >
                    + Agregar
                  </button>
                )}
              </div>
              <div className="space-y-1 text-sm">
                {torres.length === 0 ? (
                  <p className="text-gray-500">
                    {selectedPropiedad.tiene_torres 
                      ? 'No hay torres registradas' 
                      : 'Esta propiedad no tiene torres'}
                  </p>
                ) : (
                  torres.map((torre) => (
                    <div key={torre.id} className="flex items-center justify-between border-b border-gray-200 py-1">
                      <span>{torre.nombre} ({torre.numero_pisos} pisos)</span>
                      <button
                        onClick={() => handleDeleteTorre(torre.id, torre.nombre)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para crear/editar propiedad */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                {editingPropiedad ? '✏️ Editar Propiedad' : '➕ Nueva Propiedad'}
              </h4>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingPropiedad(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              {/* Datos básicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Nombre de la Propiedad *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Residencial Las Palmas"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Tipo de Propiedad *
                  </label>
                  <select
                    required
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value as TipoPropiedad })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIPOS_PROPIEDAD.map((tipo) => (
                      <option key={tipo.value} value={tipo.value}>
                        {tipo.icon} {tipo.label} - {tipo.descripcion}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Dirección completa"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={formData.ciudad}
                    onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Caracas"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Estado
                  </label>
                  <input
                    type="text"
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Distrito Capital"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Descripción adicional"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="tiene_torres"
                  checked={formData.tiene_torres}
                  onChange={(e) => setFormData({ ...formData, tiene_torres: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="tiene_torres" className="text-sm text-gray-700">
                  ¿Tiene múltiples torres, bloques o edificios?
                </label>
              </div>

              {/* Datos Bancarios */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3 text-gray-700">🏦 Datos Bancarios</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Banco Receptor
                    </label>
                    <select
                      value={formData.banco_nombre}
                      onChange={(e) => setFormData({ ...formData, banco_nombre: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar banco</option>
                      {BANCOS_VENEZUELA.map((banco) => (
                        <option key={banco} value={banco}>
                          {banco}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Número de Cuenta
                    </label>
                    <input
                      type="text"
                      value={formData.banco_cuenta}
                      onChange={(e) => setFormData({ ...formData, banco_cuenta: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0000-0000-00-0000000000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Tipo de Cuenta
                    </label>
                    <select
                      value={formData.banco_tipo_cuenta}
                      onChange={(e) => setFormData({ ...formData, banco_tipo_cuenta: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="corriente">Corriente</option>
                      <option value="ahorro">Ahorro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Cédula / RIF
                    </label>
                    <input
                      type="text"
                      value={formData.banco_cedula_rif}
                      onChange={(e) => setFormData({ ...formData, banco_cedula_rif: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="V-12345678 o J-123456789"
                    />
                  </div>
                </div>
              </div>

              {/* Datos de Pago Móvil */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3 text-gray-700">📱 Datos de Pago Móvil</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      value={formData.pago_movil_telefono}
                      onChange={(e) => setFormData({ ...formData, pago_movil_telefono: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0412-1234567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Cédula
                    </label>
                    <input
                      type="text"
                      value={formData.pago_movil_cedula}
                      onChange={(e) => setFormData({ ...formData, pago_movil_cedula: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="V-12345678"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Banco Asociado
                    </label>
                    <select
                      value={formData.pago_movil_banco}
                      onChange={(e) => setFormData({ ...formData, pago_movil_banco: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar banco</option>
                      {BANCOS_VENEZUELA.map((banco) => (
                        <option key={banco} value={banco}>
                          {banco}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Datos de Contacto */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3 text-gray-700">📞 Datos de Contacto</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Teléfono de Contacto
                    </label>
                    <input
                      type="text"
                      value={formData.telefono_contacto}
                      onChange={(e) => setFormData({ ...formData, telefono_contacto: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0412-1234567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Email de Contacto
                    </label>
                    <input
                      type="email"
                      value={formData.email_contacto}
                      onChange={(e) => setFormData({ ...formData, email_contacto: e.target.value })}
                      className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="admin@condominio.com"
                    />
                  </div>
                </div>
                
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Horario de Atención
                  </label>
                  <textarea
                    value={formData.horario_atencion}
                    onChange={(e) => setFormData({ ...formData, horario_atencion: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                    placeholder="Lunes a Viernes: 8:00 AM - 5:00 PM"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPropiedad(null);
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Guardando...
                    </>
                  ) : (
                    editingPropiedad ? 'Actualizar Propiedad' : 'Crear Propiedad'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para crear torre */}
      {showTorreForm && selectedPropiedad && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                🏗️ Nueva Torre - {selectedPropiedad.nombre}
              </h4>
              <button
                onClick={() => setShowTorreForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTorre}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Nombre de la Torre *
                  </label>
                  <input
                    type="text"
                    required
                    value={torreData.nombre}
                    onChange={(e) => setTorreData({ ...torreData, nombre: e.target.value })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Torre A, Bloque 1, Sector Norte, Edificio 2B"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Nombres sugeridos: "Torre A", "Bloque 1", "Sector Norte", "Edificio 2B"
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Número de Pisos
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={torreData.numero_pisos}
                    onChange={(e) => setTorreData({ ...torreData, numero_pisos: parseInt(e.target.value) || 1 })}
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowTorreForm(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                >
                  Crear Torre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropiedadManager;