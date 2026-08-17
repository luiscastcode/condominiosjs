// src/hooks/usePagos.ts
import { useState, useEffect, useCallback } from 'react';
import { pagosService } from '../lib/services';
import type { Pago, EstadisticasPagos } from '../types';

export const usePagos = (mes?: string) => {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasPagos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPagos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let data;
      if (mes) {
        data = await pagosService.getByMes(mes);
        const stats = await pagosService.getEstadisticasMes(mes);
        setEstadisticas(stats);
      } else {
        data = await pagosService.getAll();
      }
      setPagos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar pagos');
    } finally {
      setIsLoading(false);
    }
  }, [mes]);

  const createPago = useCallback(async (pago: Omit<Pago, 'id' | 'created_at'>) => {
    try {
      const newPago = await pagosService.create(pago);
      setPagos(prev => [newPago, ...prev]);
      return newPago;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
      throw err;
    }
  }, []);

  const updatePago = useCallback(async (id: string, pago: Partial<Pago>) => {
    try {
      const updated = await pagosService.update(id, pago);
      setPagos(prev => prev.map(p => p.id === id ? updated : p));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar pago');
      throw err;
    }
  }, []);

  const deletePago = useCallback(async (id: string) => {
    try {
      await pagosService.delete(id);
      setPagos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar pago');
      throw err;
    }
  }, []);

  useEffect(() => {
    loadPagos();
  }, [loadPagos]);

  return {
    pagos,
    estadisticas,
    isLoading,
    error,
    loadPagos,
    createPago,
    updatePago,
    deletePago,
  };
};