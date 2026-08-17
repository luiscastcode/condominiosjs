// src/components/propietarios/HistorialPropietario.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase/client";
import { propietariosService } from "../../lib/services/propietarios.service";
import { configuracionService } from "../../lib/services/configuracion.service";
import { formatBs, formatUSD, formatDate } from "../../lib/utils/monto.utils";
import type { Propietario, Pago } from "../../types";
import { pdfService } from "../../lib/services/pdf.service";
 
 

interface HistorialPropietarioProps {
  propietarioId?: string;
}

interface MesDetalle {
  mes: string;
  deuda_inicial_usd: number;
  monto_aplicado_usd: number;
  monto_aplicado_bs: number;
  deuda_restante_usd: number;
  estado: "Pagado" | "Abonado (Parcial)" | "Pendiente";
  tasa_cambio: number;
  fecha_pago: string;
  desglose_items: any[];
}

const HistorialPropietario: React.FC<HistorialPropietarioProps> = ({
  propietarioId,
}) => {
  const [propietario, setPropietario] = useState<Propietario | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [pagosDistribuidos, setPagosDistribuidos] = useState<Pago[]>([]);
  const [mesesDetalle, setMesesDetalle] = useState<MesDetalle[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [id, setId] = useState<string>("");
  const [canonActual, setCanonActual] = useState<number>(15);
  const [mostrarDesglose, setMostrarDesglose] = useState<string | null>(null);

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

  useEffect(() => {
    if (!propietarioId) {
      const path = window.location.pathname;
      const segments = path.split("/");
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment !== "propietario") {
        setId(lastSegment);
      }
    } else {
      setId(propietarioId);
    }
  }, [propietarioId]);

  useEffect(() => {
    if (id) {
      loadData(id);
      loadCanonActual();
    }
  }, [id]);

  const loadCanonActual = async () => {
    try {
      const canon = await configuracionService.getCanonActual();
      setCanonActual(canon);
    } catch (error) {
      console.error("Error loading canon actual:", error);
    }
  };

  const loadData = async (propietarioId: string) => {
    setIsLoading(true);
    setError("");
    try {
      // Obtener propietario
      const prop = await propietariosService.getById(propietarioId);
      setPropietario(prop);
          // ✅ Verificar que la propiedad esté cargada
    console.log('🔍 Propietario cargado:', {
      nombre: prop?.nombre,
      propiedad: prop?.propiedad,
      banco_nombre: prop?.propiedad?.banco_nombre
    });

      // ✅ Obtener TODOS los pagos del propietario
      const { data: pagosData, error: pagosError } = await supabase
        .from("pagos")
        .select("*")
        .eq("propietario_id", propietarioId)
        .order("fecha_pago", { ascending: false });

      if (pagosError) throw pagosError;

      setPagos(pagosData || []);

      // ✅ Filtrar solo pagos DISTRIBUIDOS (los que tienen desglose_pagos)
      const pagosDist = (pagosData || []).filter(
        (p) =>
          p.distribuido === true &&
          p.desglose_pagos !== null &&
          p.desglose_pagos !== "[]" &&
          p.desglose_pagos !== "null",
      );
      setPagosDistribuidos(pagosDist);

      // Procesar meses de detalle
      const meses = await procesarMesesDetalle(propietarioId, pagosData || []);
      setMesesDetalle(meses);

      // Calcular resumen
      const totalDeudaInicial = meses.reduce(
        (sum, m) => sum + m.deuda_inicial_usd,
        0,
      );
      const totalAplicado = meses.reduce(
        (sum, m) => sum + m.monto_aplicado_usd,
        0,
      );
      const totalRestante = meses.reduce(
        (sum, m) => sum + m.deuda_restante_usd,
        0,
      );
      const mesesPagados = meses.filter((m) => m.estado === "Pagado").length;
      const mesesParciales = meses.filter(
        (m) => m.estado === "Abonado (Parcial)",
      ).length;
      const mesesPendientes = meses.filter(
        (m) => m.estado === "Pendiente",
      ).length;

      setResumen({
        totalDeudaInicial,
        totalAplicado,
        totalRestante,
        mesesPagados,
        mesesParciales,
        mesesPendientes,
        totalMeses: meses.length,
      });
    } catch (error) {
      console.error("Error loading historial:", error);
      setError("Error al cargar el historial");
    } finally {
      setIsLoading(false);
    }
  };

  const procesarMesesDetalle = async (propietarioId: string, pagos: Pago[]) => {
    const fechaInicio = await configuracionService.getFechaInicioOperaciones();
    const [yearInicio, monthInicio] = fechaInicio.split("-").map(Number);

    const hoy = new Date();
    const yearActual = hoy.getFullYear();
    const monthActual = hoy.getMonth() + 1;

    const mesesLista: string[] = [];
    let año = yearInicio;
    let mes = monthInicio;
    while (año < yearActual || (año === yearActual && mes <= monthActual)) {
      mesesLista.push(`${año}-${String(mes).padStart(2, "0")}`);
      mes++;
      if (mes > 12) {
        mes = 1;
        año++;
      }
    }

    const mesesDetalle: MesDetalle[] = [];

    for (const mesKey of mesesLista) {
      const canon = await configuracionService.getCanonPorFecha(mesKey);
      const pagosDelMes = pagos.filter((p) => p.mes === mesKey);

      let montoAplicadoUsd = 0;
      let montoAplicadoBs = 0;
      let desgloseItems: any[] = [];
      let ultimaTasa = 0;
      let ultimaFecha = "";

      pagosDelMes.forEach((pago) => {
        if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
          pago.desglose_pagos.forEach((item: any) => {
            if (item.mes === mesKey || !item.mes) {
              montoAplicadoUsd += item.monto_usd || 0;
              montoAplicadoBs += item.monto_bs || 0;
              desgloseItems.push({
                ...item,
                fecha: pago.fecha_pago,
                forma_pago: pago.forma_pago,
                banco: pago.banco_origen,
                referencia: pago.numero_referencia,
              });
              ultimaTasa = item.tasa_cambio || pago.tasa_cambio;
              ultimaFecha = pago.fecha_pago;
            }
          });
        } else {
          montoAplicadoUsd += pago.monto_usd || 0;
          montoAplicadoBs += pago.monto_bs || 0;
          desgloseItems.push({
            monto_usd: pago.monto_usd,
            monto_bs: pago.monto_bs,
            tasa_cambio: pago.tasa_cambio,
            fecha: pago.fecha_pago,
            forma_pago: pago.forma_pago,
            banco: pago.banco_origen,
            referencia: pago.numero_referencia,
          });
          ultimaTasa = pago.tasa_cambio;
          ultimaFecha = pago.fecha_pago;
        }
      });

      const deudaInicial = canon;
      const deudaRestante = Math.max(0, canon - montoAplicadoUsd);

      let estado: "Pagado" | "Abonado (Parcial)" | "Pendiente" = "Pendiente";
      if (deudaRestante === 0 && montoAplicadoUsd > 0) {
        estado = "Pagado";
      } else if (montoAplicadoUsd > 0 && deudaRestante > 0) {
        estado = "Abonado (Parcial)";
      }

      if (deudaInicial > 0 || montoAplicadoUsd > 0) {
        mesesDetalle.push({
          mes: mesKey,
          deuda_inicial_usd: deudaInicial,
          monto_aplicado_usd: montoAplicadoUsd,
          monto_aplicado_bs: montoAplicadoBs,
          deuda_restante_usd: deudaRestante,
          estado,
          tasa_cambio: ultimaTasa,
          fecha_pago: ultimaFecha,
          desglose_items: desgloseItems,
        });
      }
    }

    return mesesDetalle;
  };

  const formatMes = (mes: string) => {
    const [year, month] = mes.split("-");
    const meses = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    return `${meses[parseInt(month) - 1]} ${year}`;
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case "Pagado":
        return "bg-green-100 text-green-800";
      case "Abonado (Parcial)":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-red-100 text-red-800";
    }
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case "Pagado":
        return "✅";
      case "Abonado (Parcial)":
        return "⚠️";
      default:
        return "❌";
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando historial...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-600">❌ {error}</div>
      </div>
    );
  }

  if (!propietario) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-gray-500">
          No se encontró el propietario
        </div>
      </div>
    );
  }
const handleGenerarRecibo = async (pagoItem: Pago) => {
  try {
    if (!propietario) return;

    // ✅ Obtener los cánones para cada mes
    let mesesDistribucion = [];
    if (pagoItem.desglose_pagos && Array.isArray(pagoItem.desglose_pagos)) {
      for (const item of pagoItem.desglose_pagos) {
        const mes = item.mes || pagoItem.mes;
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

    // ✅ Asegurar que todos los datos de la propiedad estén completos
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
        nombre: propietario.propiedad?.nombre || 'Condominio',
        direccion: propietario.propiedad?.direccion || '',
        ciudad: propietario.propiedad?.ciudad || '',
        estado: propietario.propiedad?.estado || '',
        // ✅ Datos bancarios
        banco_nombre: propietario.propiedad?.banco_nombre || 'No especificado',
        banco_cuenta: propietario.propiedad?.banco_cuenta || '0000-0000-00-0000000000',
        banco_tipo_cuenta: propietario.propiedad?.banco_tipo_cuenta || 'corriente',
        banco_cedula_rif: propietario.propiedad?.banco_cedula_rif || 'J-00000000-0',
        // ✅ Datos de contacto
        telefono_contacto: propietario.propiedad?.telefono_contacto || '0412-0000000',
        email_contacto: propietario.propiedad?.email_contacto || 'admin@condominio.com',
        horario_atencion: propietario.propiedad?.horario_atencion || ''
      },
      pago: {
        id: pagoItem.id,
        monto_usd: pagoItem.monto_usd,
        monto_bs: pagoItem.monto_bs,
        tasa_cambio: pagoItem.tasa_cambio,
        forma_pago: pagoItem.forma_pago,
        banco_origen: pagoItem.banco_origen,
        banco_destino: pagoItem.banco_destino,
        numero_referencia: pagoItem.numero_referencia,
        fecha_pago: pagoItem.fecha_pago,
        fecha_registro: pagoItem.fecha_registro || pagoItem.created_at,
        mes: pagoItem.mes,
        estado: pagoItem.estado,
        administrador: 'JEAN CARLOS SANCHEZ'
      },
      distribucion: mesesDistribucion.length > 0 ? {
        meses: mesesDistribucion,
        total_asignado_usd: pagoItem.monto_usd,
        total_asignado_bs: pagoItem.monto_bs
      } : undefined
    };

    console.log('📄 Datos para recibo:', reciboData.propiedad); // Para depuración
    await pdfService.generarRecibo(reciboData);
  } catch (error) {
    console.error('Error generando recibo:', error);
    alert('Error al generar el recibo');
  }
};

       

  return (
    <div className="space-y-6">
      {/* Información del propietario */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {propietario.nombre}
            </h2>
            <p className="text-gray-600">
              Apartamento: {propietario.apartamento}
            </p>
            <p className="text-gray-600">Email: {propietario.email}</p>
            <p className="text-gray-600">
              Teléfono: {propietario.telefono || "-"}
            </p>
            <p className="text-gray-600">
              Cuota mensual: ${propietario.cuota_mensual}
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">Canon mensual actual</div>
            <div className="text-xl font-bold text-blue-600">
              ${canonActual}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-4">
          <button
            onClick={() => (window.location.href = "/propietarios")}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            ← Volver a propietarios
          </button>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            📊 Dashboard
          </button>
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">Deuda Inicial Total</p>
            <p className="text-xl font-bold text-blue-600">
              ${formatUSD(resumen.totalDeudaInicial)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Total Aplicado</p>
            <p className="text-xl font-bold text-green-600">
              ${formatUSD(resumen.totalAplicado)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Deuda Restante</p>
            <p className="text-xl font-bold text-red-600">
              ${formatUSD(resumen.totalRestante)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-500">
            <p className="text-sm text-gray-500">Meses</p>
            <p className="text-xl font-bold text-purple-600">
              {resumen.mesesPagados} ✅ / {resumen.mesesParciales} ⚠️ /{" "}
              {resumen.mesesPendientes} ❌
            </p>
          </div>
        </div>
      )}

      {/* Tabla de detalle por mes */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">
          📋 Detalle de Pagos por Mes
        </h3>

        {mesesDetalle.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No hay registros de pagos
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Mes Adeudado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Deuda Inicial
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Monto Aplicado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Deuda Restante
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estado del Mes
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mesesDetalle.map((mes, index) => (
                  <React.Fragment key={mes.mes}>
                    <tr
                      className={`hover:bg-gray-50 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {formatMes(mes.mes)}
                      </td>
                      <td className="px-4 py-3 font-medium text-blue-600">
                        ${formatUSD(mes.deuda_inicial_usd)}
                      </td>
                      <td className="px-4 py-3 text-green-600">
                        <div>
                          <span className="font-medium">
                            ${formatUSD(mes.monto_aplicado_usd)}
                          </span>
                          {mes.monto_aplicado_bs > 0 && (
                            <span className="text-xs text-gray-400 block">
                              Bs {formatBs(mes.monto_aplicado_bs)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-red-600">
                        ${formatUSD(mes.deuda_restante_usd)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 inline-flex items-center gap-1 text-xs font-semibold rounded-full ${getEstadoColor(mes.estado)}`}
                        >
                          {getEstadoIcon(mes.estado)} {mes.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {mes.desglose_items.length > 0 && (
                          <button
                            onClick={() =>
                              setMostrarDesglose(
                                mostrarDesglose === mes.mes ? null : mes.mes,
                              )
                            }
                            className="text-blue-600 hover:text-blue-800 text-sm underline"
                          >
                            {mostrarDesglose === mes.mes
                              ? "Ocultar"
                              : "Ver Detalle"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* Detalle expandido */}
                    {mostrarDesglose === mes.mes &&
                      mes.desglose_items.length > 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3 bg-gray-50">
                            <div className="pl-6">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">
                                📌 Desglose de Abonos
                              </h5>
                              <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                                      Fecha
                                    </th>
                                    <th className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                                      Monto Bs
                                    </th>
                                    <th className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                                      Monto USD
                                    </th>
                                    <th className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                                      Tasa
                                    </th>
                                    <th className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                                      Forma de Pago
                                    </th>
                                    <th className="px-3 py-1 text-left text-xs font-medium text-gray-500">
                                      Banco/Ref
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {mes.desglose_items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      <td className="px-3 py-1 text-xs">
                                        {formatDate(item.fecha)}
                                      </td>
                                      <td className="px-3 py-1 text-xs font-medium text-blue-600">
                                        Bs {formatBs(item.monto_bs || 0)}
                                      </td>
                                      <td className="px-3 py-1 text-xs font-medium text-green-600">
                                        ${formatUSD(item.monto_usd || 0)}
                                      </td>
                                      <td className="px-3 py-1 text-xs">
                                        Bs {formatUSD(item.tasa_cambio || 0)}
                                      </td>
                                      <td className="px-3 py-1 text-xs">
                                        {item.forma_pago === "transferencia"
                                          ? "🏦 Transferencia"
                                          : item.forma_pago === "pago_movil"
                                            ? "📱 Pago Móvil"
                                            : item.forma_pago === "efectivo"
                                              ? "💵 Efectivo"
                                              : "-"}
                                      </td>
                                      <td className="px-3 py-1 text-xs text-gray-500">
                                        {item.banco || "-"}
                                        {item.referencia && (
                                          <span className="block text-gray-400">
                                            Ref: {item.referencia}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                  </React.Fragment>
                ))}
              </tbody>
              {resumen && (
                <tfoot className="bg-gray-100 font-bold">
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-700">TOTALES</td>
                    <td className="px-4 py-3 text-blue-600">
                      ${formatUSD(resumen.totalDeudaInicial)}
                    </td>
                    <td className="px-4 py-3 text-green-600">
                      ${formatUSD(resumen.totalAplicado)}
                    </td>
                    <td className="px-4 py-3 text-red-600">
                      ${formatUSD(resumen.totalRestante)}
                    </td>
                    <td className="px-4 py-3 text-purple-600" colSpan={2}>
                      {resumen.mesesPagados} Pagados | {resumen.mesesParciales}{" "}
                      Parciales | {resumen.mesesPendientes} Pendientes
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ✅ HISTORIAL DE PAGOS DISTRIBUIDOS (Solo pagos con distribuido = true) */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">
          📋 Historial de Pagos Distribuidos
        </h3>

        {pagosDistribuidos.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No hay pagos distribuidos
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Fecha Registro
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Fecha Recibo
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Monto Bs
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Monto USD
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Tasa
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Banco/Referencia
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Distribuido
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pagosDistribuidos.map((pagoItem) => (
                  <tr key={pagoItem.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {formatDate(
                        pagoItem.fecha_registro || pagoItem.created_at,
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {formatDate(pagoItem.fecha_pago)}
                    </td>
                    <td className="px-3 py-2 font-medium text-blue-600">
                      Bs {formatBs(pagoItem.monto_bs)}
                    </td>
                    <td className="px-3 py-2 font-medium text-green-600">
                      ${formatUSD(pagoItem.monto_usd)}
                    </td>
                    <td className="px-3 py-2">
                      Bs {formatUSD(pagoItem.tasa_cambio)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {pagoItem.forma_pago !== "efectivo" ? (
                        <div>
                          <div>{pagoItem.banco_origen || "-"}</div>
                          <div className="text-gray-400">
                            Ref: {pagoItem.numero_referencia || "-"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Efectivo</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        ✅ Sí
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleGenerarRecibo(pagoItem)}
                        className="text-purple-600 hover:text-purple-800 transition text-xs"
                        title="Generar Recibo PDF"
                      >
                        📄 Recibo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorialPropietario;
