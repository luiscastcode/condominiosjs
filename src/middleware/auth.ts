// src/middleware/auth.ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  // Rutas públicas
  const publicRoutes = ['/', '/login', '/unauthorized'];
  const isPublicRoute = publicRoutes.some(route => 
    context.url.pathname === route || 
    context.url.pathname === '/favicon.ico'
  );

  // Si es ruta pública, permitir acceso
  if (isPublicRoute) {
    return next();
  }

  // TODAS LAS DEMÁS RUTAS SON ACCESIBLES
  // Esto incluye /dashboard, /admin, /propietarios, /pagos
  // Por ahora, permitimos todo para que puedas entrar
  console.log('🔓 Acceso permitido a:', context.url.pathname);
  
  return next();
});