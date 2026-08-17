// src/components/propietarios/PropietarioForm.tsx
import React, { useState, useEffect } from "react";
import { propietariosService } from "../../lib/services/propietarios.service";
import { propiedadesService } from "../../lib/services/propiedades.service";
import type { Propietario, Propiedad, Torre } from "../../types";

interface PropietarioFormProps {
  propietario?: Propietario;
  onSuccess: () => void;
  onCancel: () => void;
}

const PropietarioForm: React.FC<PropietarioFormProps> = ({
  propietario,
  onSuccess,
  onCancel,
}) => {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [propiedadSeleccionada, setPropiedadSeleccionada] =
    useState<Propiedad | null>(null);

  const [formData, setFormData] = useState({
    nombre: propietario?.nombre || "",
    apartamento: propietario?.apartamento || "",
    telefono: propietario?.telefono || "",
    email: propietario?.email || "",
    cuota_mensual: propietario?.cuota_mensual || 150,
    propiedad_id: propietario?.propiedad_id || "",
    torre_id: propietario?.torre_id || "",
    piso: propietario?.piso || "",
    numero_apartamento: propietario?.numero_apartamento || "",
  });

  useEffect(() => {
    loadPropiedades();
  }, []);

  useEffect(() => {
    if (formData.propiedad_id) {
      const prop = propiedades.find((p) => p.id === formData.propiedad_id);
      setPropiedadSeleccionada(prop || null);
      loadTorres(formData.propiedad_id);
    } else {
      setPropiedadSeleccionada(null);
      setTorres([]);
    }
  }, [formData.propiedad_id, propiedades]);

  const loadPropiedades = async () => {
    try {
      const data = await propiedadesService.getAll();
      setPropiedades(data);
      // Si no hay propiedad seleccionada y hay propiedades, seleccionar la primera
      if (!formData.propiedad_id && data.length > 0) {
        setFormData((prev) => ({ ...prev, propiedad_id: data[0].id }));
      }
    } catch (error) {
      setError("Error al cargar propiedades");
    }
  };

  const loadTorres = async (propiedadId: string) => {
    try {
      const data = await propiedadesService.getTorres(propiedadId);
      setTorres(data);
    } catch (error) {
      setError("Error al cargar torres");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Validar campos obligatorios
      if (!formData.nombre.trim()) {
        setError("El nombre es obligatorio");
        setIsLoading(false);
        return;
      }

      if (!formData.email.trim()) {
        setError("El email es obligatorio");
        setIsLoading(false);
        return;
      }

      if (!formData.propiedad_id) {
        setError("Debes seleccionar un conjunto residencial");
        setIsLoading(false);
        return;
      }

      // Validar el apartamento
      let apartamentoCompleto = "";

      // Si tiene torre, usar el número de apartamento
      if (formData.torre_id && formData.numero_apartamento) {
        apartamentoCompleto = formData.numero_apartamento.trim();
      } else if (!formData.torre_id && formData.apartamento) {
        apartamentoCompleto = formData.apartamento.trim();
      } else if (formData.torre_id && !formData.numero_apartamento) {
        setError("Debes ingresar el número de apartamento");
        setIsLoading(false);
        return;
      } else if (!formData.torre_id && !formData.apartamento) {
        setError("Debes ingresar el apartamento");
        setIsLoading(false);
        return;
      }

      // Limitar longitud a 50 caracteres
      if (apartamentoCompleto.length > 50) {
        setError("El apartamento es demasiado largo (máximo 50 caracteres)");
        setIsLoading(false);
        return;
      }

      const existe = await propietariosService.existeApartamento(
        apartamentoCompleto,
        formData.propiedad_id,
        propietario?.id,
      );

      if (existe) {
        setError(
          `El apartamento "${apartamentoCompleto}" ya está registrado en ${propiedadSeleccionada?.nombre || "esta propiedad"}`,
        );
        setIsLoading(false);
        return;
      }

      // Verificar si el email ya existe
      if (formData.email) {
        const existeEmail = await propietariosService.existeEmail(
          formData.email,
          propietario?.id,
        );
        if (existeEmail) {
          setError(`El email "${formData.email}" ya está registrado`);
          setIsLoading(false);
          return;
        }
      }

      const dataToSave = {
        nombre: formData.nombre.trim(),
        apartamento: apartamentoCompleto,
        telefono: formData.telefono.trim(),
        email: formData.email.trim(),
        cuota_mensual: formData.cuota_mensual,
        propiedad_id: formData.propiedad_id,
        torre_id: formData.torre_id || null,
        piso: formData.piso?.trim() || null,
        numero_apartamento: formData.numero_apartamento?.trim() || null,
      };

      if (propietario) {
        await propietariosService.update(propietario.id, dataToSave);
      } else {
        await propietariosService.create(dataToSave);
      }

      onSuccess();
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "Error al guardar propietario");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Verificar si hay cambios sin guardar
    const hasChanges =
      formData.nombre !== (propietario?.nombre || "") ||
      formData.apartamento !== (propietario?.apartamento || "") ||
      formData.email !== (propietario?.email || "") ||
      formData.telefono !== (propietario?.telefono || "") ||
      formData.cuota_mensual !== (propietario?.cuota_mensual || 15) ||
      formData.propiedad_id !== (propietario?.propiedad_id || "") ||
      formData.torre_id !== (propietario?.torre_id || "") ||
      formData.piso !== (propietario?.piso || "") ||
      formData.numero_apartamento !== (propietario?.numero_apartamento || "");

    if (hasChanges) {
      if (
        !confirm(
          "¿Estás seguro de cancelar? Los datos no guardados se perderán.",
        )
      ) {
        return;
      }
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">
            {propietario ? "✏️ Editar Propietario" : "➕ Nuevo Propietario"}
          </h3>
          <button
            onClick={handleCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Datos personales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nombre completo *
              </label>
              <input
                type="text"
                required
                value={formData.nombre}
                onChange={(e) =>
                  setFormData({ ...formData, nombre: e.target.value })
                }
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nombre completo"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Teléfono
              </label>
              <input
                type="text"
                value={formData.telefono}
                onChange={(e) =>
                  setFormData({ ...formData, telefono: e.target.value })
                }
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0412-1234567"
                maxLength={20}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="correo@ejemplo.com"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Cuota Mensual ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cuota_mensual}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cuota_mensual: parseFloat(e.target.value) || 0,
                  })
                }
                className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Ubicación */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3 text-gray-700">📍 Ubicación</h4>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Conjunto Residencial *
                </label>
                <select
                  required
                  value={formData.propiedad_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      propiedad_id: e.target.value,
                      torre_id: "",
                    })
                  }
                  className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar conjunto</option>
                  {propiedades.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.tipo === "edificio"
                        ? "🏢"
                        : prop.tipo === "torre"
                          ? "🏗️"
                          : prop.tipo === "bloque"
                            ? "🧱"
                            : prop.tipo === "casa"
                              ? "🏠"
                              : "📍"}{" "}
                      {prop.nombre} - {prop.ciudad}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Torres - solo si la propiedad tiene torres */}
            {propiedadSeleccionada?.tiene_torres && torres.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Torre *
                  </label>
                  <select
                    required
                    value={formData.torre_id}
                    onChange={(e) =>
                      setFormData({ ...formData, torre_id: e.target.value })
                    }
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Seleccionar torre</option>
                    {torres.map((torre) => (
                      <option key={torre.id} value={torre.id}>
                        🏗️ {torre.nombre} ({torre.numero_pisos} pisos)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Piso
                  </label>
                  <input
                    type="text"
                    value={formData.piso}
                    onChange={(e) =>
                      setFormData({ ...formData, piso: e.target.value })
                    }
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: 5, PB, Sótano, etc."
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Apartamento *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.numero_apartamento}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        numero_apartamento: e.target.value,
                      })
                    }
                    className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: 101, A-305, 2-1-1-B, 0206"
                    maxLength={50}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Formato libre: 101, A-305, 2-1-1-B, 0206, 7-5, etc.
                  </p>
                </div>
              </div>
            )}

            {/* Sin torres - apartamento simple */}
            {propiedadSeleccionada && !propiedadSeleccionada.tiene_torres && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700">
                  Apartamento *
                </label>
                <input
                  type="text"
                  required
                  value={formData.apartamento}
                  onChange={(e) =>
                    setFormData({ ...formData, apartamento: e.target.value })
                  }
                  className="mt-1 block w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: 101, A-305, 2-1-1-B, 0206, Casa 1, Local B"
                  maxLength={50}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato libre: 101, A-305, 2-1-1-B, 0206, Casa 1, Local B,
                  etc.
                </p>
              </div>
            )}
          </div>

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
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Guardando...
                </>
              ) : propietario ? (
                "Actualizar"
              ) : (
                "Crear"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PropietarioForm;
