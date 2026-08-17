// src/components/admin/AdminManager.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

const AdminManager: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadAdmins();
  }, []);

// src/components/admin/AdminManager.tsx (versión con RPC)

const loadAdmins = async () => {
  setIsLoadingList(true);
  try {
    // Usar la función RPC
    const { data, error } = await supabase.rpc('get_admin_users');
    
    if (error) {
      console.error('Error loading admins:', error);
      // Fallback: cargar solo roles
      await loadAdminsFallback();
      return;
    }
    
    if (data) {
      setAdmins(data);
    }
  } catch (error) {
    console.error('Error loading admins:', error);
    await loadAdminsFallback();
  } finally {
    setIsLoadingList(false);
  }
};

// Fallback para cargar solo roles (sin emails)
const loadAdminsFallback = async () => {
  try {
    const { data: rolesData, error: rolesError } = await supabase
      .from('usuarios_roles')
      .select('id, user_id, role, created_at')
      .in('role', ['admin', 'super_admin']);

    if (!rolesError && rolesData) {
      const adminList: AdminUser[] = rolesData.map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        email: 'ID: ' + item.user_id.substring(0, 8) + '...',
        role: item.role,
        created_at: item.created_at
      }));
      setAdmins(adminList);
    }
  } catch (error) {
    console.error('Error loading admins fallback:', error);
  }
};

  // Método alternativo para cargar admins con función RPC
  // (Recomendado: crear una función en Supabase)
  const loadAdminsWithRPC = async () => {
    // Esta función requiere crear una función en Supabase
    // CREATE OR REPLACE FUNCTION get_admin_users()
    // RETURNS TABLE(user_id UUID, email TEXT, role TEXT, created_at TIMESTAMPTZ)
    // LANGUAGE sql
    // SECURITY DEFINER
    // AS $$
    //   SELECT 
    //     ur.user_id,
    //     au.email,
    //     ur.role,
    //     ur.created_at
    //   FROM usuarios_roles ur
    //   JOIN auth.users au ON ur.user_id = au.id
    //   WHERE ur.role = 'admin'
    // $$;
    
    try {
      const { data, error } = await supabase.rpc('get_admin_users');
      
      if (error) {
        console.error('Error loading admins with RPC:', error);
        return;
      }
      
      if (data) {
        setAdmins(data);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Crear usuario en Auth (requiere service_role key)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newAdminEmail,
        password: newAdminPassword,
        email_confirm: true,
        user_metadata: { role: 'admin' }
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Error al crear el usuario');
        setIsLoading(false);
        return;
      }

      // 2. Asignar rol de admin
      const { error: roleError } = await supabase
        .from('usuarios_roles')
        .insert([
          { user_id: authData.user.id, role: 'admin' }
        ]);

      if (roleError) {
        setError(roleError.message);
        setIsLoading(false);
        return;
      }

      setSuccess('Administrador creado exitosamente');
      setNewAdminEmail('');
      setNewAdminPassword('');
      loadAdmins();
    } catch (err) {
      setError('Error al crear el administrador');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string, userId: string) => {
    if (!confirm('¿Estás seguro de eliminar este administrador?')) return;

    try {
      // Eliminar el rol primero
      const { error: roleError } = await supabase
        .from('usuarios_roles')
        .delete()
        .eq('user_id', userId);

      if (roleError) {
        setError(roleError.message);
        return;
      }

      // Eliminar el usuario de Auth
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
        setError(authError.message);
        return;
      }

      setSuccess('Administrador eliminado exitosamente');
      loadAdmins();
    } catch (err) {
      setError('Error al eliminar el administrador');
    }
  };

  if (isLoadingList) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando administradores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">Gestión de Administradores</h3>
      
      {/* Formulario para agregar admin */}
      <form onSubmit={handleAddAdmin} className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium mb-3">Agregar Nuevo Administrador</h4>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm mb-3">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-2 rounded-lg text-sm mb-3">
            {success}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="admin@ejemplo.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={newAdminPassword}
              onChange={(e) => setNewAdminPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Creando...' : 'Crear Administrador'}
        </button>
      </form>

      {/* Lista de administradores */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha de Creación</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {admins.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                  No hay administradores registrados
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{admin.email}</td>
                  <td className="px-4 py-2 text-sm">
                    {new Date(admin.created_at).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {admin.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <button
                      onClick={() => handleDeleteAdmin(admin.id, admin.user_id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminManager;