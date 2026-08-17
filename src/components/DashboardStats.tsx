// src/components/DashboardStats.tsx
import React, { useState, useEffect } from "react";
import {
  propietariosService,
  pagosService,
  configuracionService,
  propiedadesService,
} from "../lib/services";
import { dolarapiService } from "../lib/services/dolarapi.service";
import ReporteMorososPDF from "./reportes/ReporteMorososPDF";
import type { Propiedad } from "../types";

interface Stats {
  totalPropietarios: number;
  alDia: number;
  morosos: number;
  ingresosMes: number;
  egresosMes: number;
  tasaCambio: number;
}

const DashboardStats: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalPropietarios: 0,
    alDia: 0,
    morosos: 0,
    ingresosMes: 0,
    egresosMes: 0,
    tasaCambio: 0,
  });
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [propiedadActiva, setPropiedadActiva] = useState<Propiedad | null>(
    null,
  );
  const [tasaDia, setTasaDia] = useState<{
    promedio: number;
    fechaFormateada: string;
    moneda: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [mostrarReporte, setMostrarReporte] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const mesActual = new Date().toISOString().slice(0, 7);

      // Cargar datos en paralelo
      const [propietarios, estadisticas, config, propiedadesData, tasaDiaData] =
        await Promise.all([
          propietariosService.getAll(),
          pagosService.getEstadisticasMes(mesActual),
          configuracionService.getConfiguracion(),
          propiedadesService.getAll(),
          dolarapiService.getTasaDiaFormateada(),
        ]);

      // Guardar propiedades
      setPropiedades(propiedadesData);

      // Seleccionar la primera propiedad como activa (o la que tenga más propietarios)
      if (propiedadesData.length > 0) {
        let propiedadConMasPropietarios = propiedadesData[0];
        let maxPropietarios = 0;

        for (const prop of propiedadesData) {
          const propietariosDePropiedad =
            await propiedadesService.getPropietariosByPropiedad(prop.id);
          if (propietariosDePropiedad.length > maxPropietarios) {
            maxPropietarios = propietariosDePropiedad.length;
            propiedadConMasPropietarios = prop;
          }
        }

        setPropiedadActiva(propiedadConMasPropietarios);
      }

      // Calcular morosos y al día
      const morosos = await propietariosService.getMorosos(mesActual);
      const alDia = await propietariosService.getAlDia(mesActual);

      setStats({
        totalPropietarios: propietarios.length,
        alDia: alDia.length,
        morosos: morosos.length,
        ingresosMes: estadisticas.recaudado,
        egresosMes: estadisticas.recaudado * 0.7, // Ejemplo: 70% de los ingresos
        tasaCambio: config?.tasa_cambio || 36.5,
      });

      // Guardar tasa del día
      if (tasaDiaData) {
        setTasaDia({
          promedio: tasaDiaData.promedio,
          fechaFormateada: tasaDiaData.fechaFormateada,
          moneda: tasaDiaData.moneda,
        });
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="bg-white p-6 rounded-lg shadow-md animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {/* Propiedad Activa - Ocupa 2 columnas en desktop */}
      <div className="bg-linear-to-r from-blue-500 to-blue-600 text-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-100">Conjunto Residencial Activo</p>
            <p className="text-2xl font-bold">
              {propiedadActiva?.nombre || "Sin propiedad"}
            </p>
            {propiedadActiva && (
              <>
                <p className="text-sm text-blue-100 mt-1">
                  {propiedadActiva.ciudad}, {propiedadActiva.estado}
                </p>
                <p className="text-xs text-blue-200 mt-1">
                  {propiedadActiva.tiene_torres
                    ? `🔹 ${propiedadActiva.torres?.length || 0} torres`
                    : "🔹 Sin torres"}
                </p>
              </>
            )}
          </div>
          <span className="text-4xl">🏢</span>
        </div>
        {/* Selector de propiedades */}
        {propiedades.length > 1 && (
          <div className="mt-3">
            <select
              value={propiedadActiva?.id || ""}
              onChange={async (e) => {
                const selected = propiedades.find(
                  (p) => p.id === e.target.value,
                );
                if (selected) {
                  setPropiedadActiva(selected);
                  // Recargar estadísticas para la propiedad seleccionada
                  const mesActual = new Date().toISOString().slice(0, 7);
                  const propietariosDePropiedad =
                    await propiedadesService.getPropietariosByPropiedad(
                      selected.id,
                    );
                  const morosos =
                    await propietariosService.getMorosos(mesActual);
                  const alDia = await propietariosService.getAlDia(mesActual);

                  setStats((prev) => ({
                    ...prev,
                    totalPropietarios: propietariosDePropiedad.length,
                    alDia: alDia.length,
                    morosos: morosos.length,
                  }));
                }
              }}
              className="w-full bg-blue-700 text-white border border-blue-400 rounded-md p-1 text-sm"
            >
              {propiedades.map((prop) => (
                <option
                  key={prop.id}
                  value={prop.id}
                  className="text-gray-900 bg-white"
                >
                  {prop.nombre} ({prop.ciudad})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tasa del día - API Oficial */}
      <div className="bg-linear-to-r from-green-500 to-green-600 text-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-green-100">💱 Tasa del día (Oficial)</p>
            <p className="text-2xl font-bold">
              Bs {tasaDia?.promedio.toFixed(2) || "Cargando..."}
            </p>
            <p className="text-xs text-green-200 mt-1">
              {tasaDia?.fechaFormateada || "Actualizando..."}
            </p>
            {tasaDia?.moneda && (
              <p className="text-xs text-green-200">Moneda: {tasaDia.moneda}</p>
            )}
          </div>
          <span className="text-4xl">💵</span>
        </div>
        <p className="text-xs text-green-200 mt-2">
          ✅ Tasa oficial del día obtenida automáticamente
        </p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Propietarios</p>
            <p className="text-2xl font-bold">{stats.totalPropietarios}</p>
          </div>
          <span className="text-3xl">👥</span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Al Día</p>
            <p className="text-2xl font-bold text-green-600">{stats.alDia}</p>
          </div>
          <span className="text-3xl">✅</span>
        </div>
      </div>

      <div className="bg-blue-100 p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <button className="hover:cursor-pointer" onClick={() => setMostrarReporte(true)}>
            📄 Reporte de Morosos
          </button>

          {mostrarReporte && (
            <ReporteMorososPDF onClose={() => setMostrarReporte(false)} />
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Tasa de Cambio (Sistema)</p>
            <p className="text-2xl font-bold">Bs {stats.tasaCambio}</p>
          </div>
          <span className="text-3xl">🏦</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Usada para cálculos históricos
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Ingresos del Mes</p>
            <p className="text-2xl font-bold text-green-600">
              $ {stats.ingresosMes.toFixed(2)}
            </p>
            {propiedadActiva && (
              <p className="text-xs text-gray-500 mt-1">
                {propiedadActiva.nombre}
              </p>
            )}
          </div>
          <span className="text-3xl">📈</span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Egresos del Mes</p>
            <p className="text-2xl font-bold text-red-600">
              $ {stats.egresosMes.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {((stats.egresosMes / stats.ingresosMes) * 100).toFixed(1)}% de
              los ingresos
            </p>
          </div>
          <span className="text-3xl">📉</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
