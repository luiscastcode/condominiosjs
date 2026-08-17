// src/hooks/usePropietarios.ts
import { useState, useEffect, useCallback } from 'react';
import { propietariosService } from '../lib/services';
import type { Propietario } from '../types';

export const usePropietarios = () => {
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPropietarios = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await propietariosService.getAll();
      setPropietarios(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar propietarios');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPropietario = useCallback(async (propietario: Omit<Propietario, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newPropietario = await propietariosService.create(propietario);
      setPropietarios(prev => [newPropietario, ...prev]);
      return newPropietario;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear propietario');
      throw err;
    }
  }, []);

  const updatePropietario = useCallback(async (id: string, propietario: Partial<Propietario>) => {
    try {
      const updated = await propietariosService.update(id, propietario);
      setPropietarios(prev => prev.map(p => p.id === id ? updated : p));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar propietario');
      throw err;
    }
  }, []);

  const deletePropietario = useCallback(async (id: string) => {
    try {
      await propietariosService.delete(id);
      setPropietarios(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar propietario');
      throw err;
    }
  }, []);

  const searchPropietarios = useCallback(async (query: string) => {
    if (!query.trim()) {
      await loadPropietarios();
      return;
    }
    setIsLoading(true);
    try {
      const data = await propietariosService.search(query);
      setPropietarios(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar propietarios');
    } finally {
      setIsLoading(false);
    }
  }, [loadPropietarios]);

  useEffect(() => {
    loadPropietarios();
  }, [loadPropietarios]);

  return {
    propietarios,
    isLoading,
    error,
    loadPropietarios,
    createPropietario,
    updatePropietario,
    deletePropietario,
    searchPropietarios,
  };
};