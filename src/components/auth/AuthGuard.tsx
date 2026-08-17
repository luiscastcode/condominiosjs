// src/components/auth/AuthGuard.tsx
import React from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

// Componente interno que usa useAuth
const AuthGuardContent: React.FC<{
  children: ReactNode;
  requireAdmin?: boolean;
  fallback?: ReactNode;
}> = ({ children, requireAdmin = false, fallback }) => {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (fallback) return <>{fallback}</>;
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  if (requireAdmin && !isAdmin) {
    if (fallback) return <>{fallback}</>;
    if (typeof window !== 'undefined') {
      window.location.href = '/unauthorized';
    }
    return null;
  }

  return <>{children}</>;
};

// Componente principal que envuelve con AuthProvider
const AuthGuard: React.FC<{
  children: ReactNode;
  requireAdmin?: boolean;
  fallback?: ReactNode;
}> = ({ children, requireAdmin = false, fallback }) => {
  return (
    <AuthProvider>
      <AuthGuardContent requireAdmin={requireAdmin} fallback={fallback}>
        {children}
      </AuthGuardContent>
    </AuthProvider>
  );
};

export default AuthGuard;