// src/components/propietarios/PropietariosTable.tsx
import React, { useState, useEffect } from 'react';
import { propietariosService } from '../../lib/services/propietarios.service';
import { propiedadesService } from '../../lib/services/propiedades.service';
import type { Propietario, Propiedad, Torre } from '../../types';
import PropietarioForm from './PropietarioForm';
import RegistroPagoForm from '../pagos/RegistroPagoForm';
import PagoCondominio from '../pagos/PagoCondominio';

const PropietariosTable: React.FC = () => {
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPropiedad, setSelectedPropiedad] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [showPagoCondominio, setShowPagoCondominio] = useState(false);
  const [editingPropietario, setEditingPropietario] = useState<Propietario | undefined>();
  const [selectedPropietarioId, setSelectedPropietarioId] = useState<string>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [propietariosData, propiedadesData] = await Promise.all([
        propietariosService.getAll(),
        propiedadesService.getAll()
      ]);
      setPropietarios(propietariosData);
      setTotalItems(propietariosData.length);
      setPropiedades(propiedadesData);
      
      const allTorres: Torre[] = [];
      for (const prop of propiedadesData) {
        if (prop.tiene_torres) {
          const torresData = await propiedadesService.getTorres(prop.id);
          allTorres.push(...torresData);
        }
      }
      setTorres(allTorres);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar a "${nombre}"?`)) return;
    
    try {
      await propietariosService.delete(id);
      setPropietarios(propietarios.filter(p => p.id !== id));
      setTotalItems(prev => prev - 1);
      setSuccess(`✅ "${nombre}" eliminado exitosamente`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Error al eliminar propietario');
    }
  };

  const getPropiedadNombre = (id: string) => {
    return propiedades.find(p => p.id === id)?.nombre || 'Sin propiedad';
  };

  const getTorreNombre = (id: string) => {
    return torres.find(t => t.id === id)?.nombre || 'Sin torre';
  };

  const filteredPropietarios = propietarios.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.apartamento.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPropiedad = selectedPropiedad ? p.propiedad_id === selectedPropiedad : true;
    return matchesSearch && matchesPropiedad;
  });

  useEffect(() => {
    setTotalItems(filteredPropietarios.length);
    setCurrentPage(1);
  }, [searchTerm, selectedPropiedad]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPropietarios.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  const handleRegistrarPago = (propietarioId: string) => {
    setSelectedPropietarioId(propietarioId);
    setShowPagoForm(true);
  };

  const handlePagoCondominio = (propietarioId: string) => {
    setSelectedPropietarioId(propietarioId);
    setShowPagoCondominio(true);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando propietarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Buscar propietario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-4 py-2 border rounded-lg w-64 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={selectedPropiedad}
              onChange={(e) => setSelectedPropiedad(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los conjuntos</option>
              {propiedades.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadData}
              className="bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300 flex items-center gap-1"
            >
              🔄 Recargar
            </button>
            <button
              onClick={() => {
                setEditingPropietario(undefined);
                setShowForm(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-1"
            >
              ➕ Nuevo Propietario
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 text-green-600 px-4 py-2 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="overflow-x-auto p-4">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Propietario</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Apartamento</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conjunto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Torre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Piso</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cuota</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm || selectedPropiedad ? 'No hay propietarios que coincidan con los filtros' : 'No hay propietarios registrados'}
                </td>
              </tr>
            ) : (
              currentItems.map((prop) => (
                <tr key={prop.id} className="hover:bg-gray-50 transition">
                  {/* ✅ Nombre del propietario con enlace al historial */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => window.location.href = `/propietario/${prop.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline hover:cursor-pointer text-left"
                    >
                      {prop.nombre}
                    </button>
                    <div className="text-xs text-gray-500">{prop.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {prop.apartamento}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {getPropiedadNombre(prop.propiedad_id)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {prop.torre_id ? getTorreNombre(prop.torre_id) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {prop.piso || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {prop.telefono || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {prop.email}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    ${prop.cuota_mensual}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingPropietario(prop);
                          setShowForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 transition p-1 hover:cursor-pointer"
                        title="Editar propietario"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(prop.id, prop.nombre)}
                        className="text-red-600 hover:text-red-800 transition p-1 hover:cursor-pointer"
                        title="Eliminar propietario"
                      >
                        🗑️
                      </button>
                      <button
                        onClick={() => handleRegistrarPago(prop.id)}
                        className="text-green-600 hover:text-green-800 transition p-1 hover:cursor-pointer"
                        title="Registrar nuevo pago"
                      >
                        💰
                      </button>
                      <button
                        onClick={() => handlePagoCondominio(prop.id)}
                        className="text-purple-600 hover:text-purple-800 transition p-1 hover:cursor-pointer"
                        title="Pago de Condominio"
                      >
                        📊
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalItems > 0 && (
        <div className="px-4 py-3 border-t bg-gray-50 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            Mostrando {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, totalItems)} de {totalItems} propietarios
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Mostrar:</label>
              <select
                value={itemsPerPage}
                onChange={handleItemsPerPageChange}
                className="px-2 py-1 border rounded text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ⏮
              </button>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ◀
              </button>
              
              <span className="px-3 py-1 text-sm font-medium">
                {currentPage} / {totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ▶
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ⏭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para crear/editar propietario */}
      {showForm && (
        <PropietarioForm
          propietario={editingPropietario}
          onSuccess={() => {
            setShowForm(false);
            setEditingPropietario(undefined);
            loadData();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingPropietario(undefined);
          }}
        />
      )}

      {/* Modal para registrar pago */}
      {showPagoForm && (
        <RegistroPagoForm
          propietarioId={selectedPropietarioId}
          onSuccess={() => {
            setShowPagoForm(false);
            setSelectedPropietarioId('');
            loadData();
          }}
          onCancel={() => {
            setShowPagoForm(false);
            setSelectedPropietarioId('');
          }}
        />
      )}

      {/* Modal para Pago de Condominio */}
      {showPagoCondominio && (
        <PagoCondominio
          propietarioId={selectedPropietarioId}
          onSuccess={() => {
            setShowPagoCondominio(false);
            setSelectedPropietarioId('');
            loadData();
          }}
          onCancel={() => {
            setShowPagoCondominio(false);
            setSelectedPropietarioId('');
          }}
        />
      )}
    </div>
  );
};

export default PropietariosTable;