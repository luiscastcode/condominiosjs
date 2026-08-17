// src/components/PaymentTable.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase/client";
import { propietariosService, propiedadesService } from "../lib/services";
import RegistroPagoForm from "./pagos/RegistroPagoForm";
import type { Pago, Propietario, Propiedad } from "../types";
import { formatBs, formatUSD, formatDate } from "../lib/utils/monto.utils";
import { pdfService } from "../lib/services/pdf.service";
// En HistorialPropietario.tsx y PaymentTable.tsx
import { configuracionService } from '../lib/services/configuracion.service';

const PaymentTable: React.FC = () => {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);

  // ✅ Función auxiliar para obtener fecha local
  const getFechaLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // ✅ En el estado
  const [fechaInicio, setFechaInicio] = useState(() => {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return getFechaLocal(primerDia);
  });

  const [fechaFin, setFechaFin] = useState(getFechaLocal(new Date()));

  const [propiedadSeleccionada, setPropiedadSeleccionada] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [selectedPropietarioId, setSelectedPropietarioId] =
    useState<string>("");

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    loadData();
  }, [fechaInicio, fechaFin, propiedadSeleccionada]);

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      // ✅ Obtener pagos NO distribuidos (solo pagos bancarios pendientes)
      const { data: pagosData, error: pagosError } = await supabase
        .from("pagos")
        .select("*")
        .eq("distribuido", false)
        .is("desglose_pagos", null)
        .order("fecha_registro", { ascending: false });

      if (pagosError) throw pagosError;

      let allPagos = pagosData || [];

      // Filtrar por rango de fechas del recibo bancario (fecha_pago)
      if (fechaInicio && fechaFin) {
        const inicio = new Date(fechaInicio);
        const fin = new Date(fechaFin);
        fin.setHours(23, 59, 59, 999);

        allPagos = allPagos.filter((pago) => {
          const fechaPago = new Date(pago.fecha_pago);
          return fechaPago >= inicio && fechaPago <= fin;
        });
      }

      // Filtrar por propiedad si está seleccionada
      if (propiedadSeleccionada) {
        allPagos = allPagos.filter(
          (pago) => pago.propiedad_id === propiedadSeleccionada,
        );
      }

      // Ordenar por fecha de registro (fecha_registro) descendente
      allPagos.sort((a, b) => {
        if (a.fecha_registro && b.fecha_registro) {
          return (
            new Date(b.fecha_registro).getTime() -
            new Date(a.fecha_registro).getTime()
          );
        }
        return 0;
      });

      const [propietariosData, propiedadesData] = await Promise.all([
        propietariosService.getAll(),
        propiedadesService.getAll(),
      ]);

      setPagos(allPagos);
      setTotalItems(allPagos.length);
      setPropietarios(propietariosData);
      setPropiedades(propiedadesData);

      setCurrentPage(1);
    } catch (error) {
      console.error("Error loading payment data:", error);
      setError("Error al cargar los pagos");
    } finally {
      setIsLoading(false);
    }
  };

  const getPropietario = (id: string) => propietarios.find((p) => p.id === id);
  const getPropiedad = (id: string) => propiedades.find((p) => p.id === id);

  const getFormaPagoTexto = (forma: string) => {
    switch (forma) {
      case "transferencia":
        return "🏦 Transferencia";
      case "pago_movil":
        return "📱 Pago Móvil";
      case "efectivo":
        return "💵 Efectivo";
      default:
        return forma;
    }
  };

  const formatFechaRegistro = (fecha: string) => {
    if (!fecha) return "-";
    return new Date(fecha).toLocaleDateString("es-VE", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = pagos.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  const handleSetMesActual = () => {
    const ahora = new Date();
    const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    setFechaInicio(getFechaLocal(primerDia));
    setFechaFin(getFechaLocal(ahora));
  };

  const handleSetMesAnterior = () => {
    const ahora = new Date();
    const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const ultimoDiaMesAnterior = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      0,
    );
    setFechaInicio(getFechaLocal(mesAnterior));
    setFechaFin(getFechaLocal(ultimoDiaMesAnterior));
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando pagos...</p>
        </div>
      </div>
    );
  }
const handleGenerarRecibo = async (pago: Pago) => {
  try {
    const propietario = getPropietario(pago.propietario_id);
    const propiedad = getPropiedad(pago.propiedad_id);
    
    if (!propietario || !propiedad) {
      alert('No se encontraron datos para generar el recibo');
      return;
    }

    // ✅ Si el pago tiene distribución, obtener cánones
    let mesesDistribucion = [];
    if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
      for (const item of pago.desglose_pagos) {
        const mes = item.mes || pago.mes;
        const canon = await configuracionService.getCanonPorFecha(mes);
        mesesDistribucion.push({
          mes: mes,
          monto_usd: item.monto_usd || 0,
          monto_bs: item.monto_bs || 0,
          estado: item.estado || 'pendiente',
          canon_mensual: canon || 15
        });
      }
    }

    const reciboData = {
      propietario: {
        nombre: propietario.nombre,
        apartamento: propietario.apartamento,
        torre: propietario.torre?.nombre || '',
        telefono: propietario.telefono || '',
        email: propietario.email,
        cuota_mensual: propietario.cuota_mensual
      },
      propiedad: {
        nombre: propiedad.nombre,
        direccion: propiedad.direccion || '',
        ciudad: propiedad.ciudad || '',
        estado: propiedad.estado || '',
        banco_nombre: propiedad.banco_nombre || '',
        banco_cuenta: propiedad.banco_cuenta || '',
        banco_tipo_cuenta: propiedad.banco_tipo_cuenta || 'corriente',
        banco_cedula_rif: propiedad.banco_cedula_rif || '',
        telefono_contacto: propiedad.telefono_contacto || '',
        email_contacto: propiedad.email_contacto || '',
        horario_atencion: propiedad.horario_atencion || ''
      },
      pago: {
        id: pago.id,
        monto_usd: pago.monto_usd,
        monto_bs: pago.monto_bs,
        tasa_cambio: pago.tasa_cambio,
        forma_pago: pago.forma_pago,
        banco_origen: pago.banco_origen,
        banco_destino: pago.banco_destino,
        numero_referencia: pago.numero_referencia,
        fecha_pago: pago.fecha_pago,
        fecha_registro: pago.fecha_registro || pago.created_at,
        mes: pago.mes,
        estado: pago.estado,
        administrador: 'JEAN CARLOS SANCHEZ'
      },
      distribucion: mesesDistribucion.length > 0 ? {
        meses: mesesDistribucion,
        total_asignado_usd: pago.monto_usd,
        total_asignado_bs: pago.monto_bs
      } : undefined
    };

    await pdfService.generarRecibo(reciboData);
  } catch (error) {
    console.error('Error generando recibo:', error);
    alert('Error al generar el recibo');
  }
};

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header con filtros */}
      <div className="p-4 border-b">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Desde:
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Hasta:
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-1">
              <button
                onClick={handleSetMesActual}
                className="bg-blue-100 text-blue-700 px-3 py-2 rounded hover:bg-blue-200 text-sm"
              >
                Mes Actual
              </button>
              <button
                onClick={handleSetMesAnterior}
                className="bg-gray-100 text-gray-700 px-3 py-2 rounded hover:bg-gray-200 text-sm"
              >
                Mes Anterior
              </button>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Conjunto:
              </label>
              <select
                value={propiedadSeleccionada}
                onChange={(e) => setPropiedadSeleccionada(e.target.value)}
                className="ml-2 px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                {propiedades.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.nombre}
                  </option>
                ))}
              </select>
            </div>
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
                setSelectedPropietarioId("");
                setShowPagoForm(true);
              }}
              className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 flex items-center gap-1"
            >
              💰 Nuevo Pago
            </button>
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-500">
          Mostrando pagos bancarios pendientes de distribución
          <span className="ml-2">
            - Total: <span className="font-medium">{totalItems}</span> pagos
          </span>
          <span className="ml-2 text-xs text-gray-400">
            (Pagos registrados que aún no han sido distribuidos)
          </span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto p-4">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Fecha Registro
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Propietario
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Apartamento
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Fecha Recibo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tasa
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Monto ($)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Monto (Bs)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Forma de Pago
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Banco/Ref
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentItems.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No hay pagos pendientes de distribución
                  {propiedadSeleccionada &&
                    ` para ${propiedades.find((p) => p.id === propiedadSeleccionada)?.nombre}`}
                </td>
              </tr>
            ) : (
              currentItems.map((pago) => {
                const propietario = getPropietario(pago.propietario_id);
                const propiedad = getPropiedad(pago.propiedad_id);
                return (
                  <tr key={pago.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatFechaRegistro(pago.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {propietario?.nombre || "Desconocido"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {propietario?.email || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                      {propietario?.apartamento || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {pago.fecha_pago ? formatDate(pago.fecha_pago) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {pago.tasa_cambio
                        ? `Bs ${formatUSD(pago.tasa_cambio)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      ${formatUSD(pago.monto_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">
                      Bs {formatBs(pago.monto_bs)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {getFormaPagoTexto(pago.forma_pago)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {pago.forma_pago !== "efectivo" ? (
                        <div>
                          <div className="text-xs">
                            {pago.banco_origen || "-"}
                          </div>
                          <div className="text-xs text-gray-400">
                            Ref: {pago.numero_referencia || "-"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            setSelectedPropietarioId(pago.propietario_id);
                            setShowPagoForm(true);
                          }}
                          className="text-green-600 hover:text-green-800 transition text-xs"
                          title="Registrar nuevo pago"
                        >
                          💰 Nuevo Pago
                        </button>
                        <button
                          onClick={() => handleGenerarRecibo(pago)}
                          className="text-purple-600 hover:text-purple-800 transition text-xs"
                          title="Generar Recibo PDF"
                        >
                          📄 Recibo
                        </button>
                        <button
                          onClick={() => {
                            window.location.href = `/propietario/${pago.propietario_id}`;
                          }}
                          className="text-blue-600 hover:text-blue-800 transition text-xs"
                          title="Ver historial del propietario"
                        >
                          📋 Historial
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginador */}
      {totalItems > 0 && (
        <div className="px-4 py-3 border-t bg-gray-50 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            Mostrando {indexOfFirstItem + 1} -{" "}
            {Math.min(indexOfLastItem, totalItems)} de {totalItems} pagos
            pendientes
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

      {/* Modal de registro de pago */}
      {showPagoForm && (
        <RegistroPagoForm
          propietarioId={selectedPropietarioId}
          onSuccess={() => {
            setShowPagoForm(false);
            setSelectedPropietarioId("");
            loadData();
          }}
          onCancel={() => {
            setShowPagoForm(false);
            setSelectedPropietarioId("");
          }}
        />
      )}
    </div>
  );
};

export default PaymentTable;
