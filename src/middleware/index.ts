// src/middleware/index.ts
import { onRequest as authMiddleware } from './auth';

export const onRequest = authMiddleware;