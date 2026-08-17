// src/components/AuthWrapper.tsx
import React from 'react';
import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';

interface AuthWrapperProps {
  children: ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  return <AuthProvider>{children}</AuthProvider>;
};

export default AuthWrapper;