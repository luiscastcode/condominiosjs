// src/hooks/useConfiguracion.ts
import { useState, useEffect, useCallback } from 'react';
import { configuracionService } from '../lib/services';
import type { Configuracion } from '../types';

export const useConfiguracion = () => {
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfiguracion = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await configuracionService.getConfiguracion();
      setConfiguracion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar configuración');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateConfiguracion = useCallback(async (config: Partial<Configuracion>) => {
    try {
      const updated = await configuracionService.updateConfiguracion(config);
      setConfiguracion(updated);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar configuración');
      throw err;
    }
  }, []);

  useEffect(() => {
    loadConfiguracion();
  }, [loadConfiguracion]);

  return {
    configuracion,
    isLoading,
    error,
    loadConfiguracion,
    updateConfiguracion,
  };
};