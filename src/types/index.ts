// src/types/index.ts

export type TipoPropiedad = 'edificio' | 'torre' | 'bloque' | 'casa' | 'otro';

export interface Propiedad {
  id: string;
  nombre: string;
  tipo: TipoPropiedad;
  direccion: string;
  ciudad: string;
  estado: string;
  descripcion?: string;
  tiene_torres: boolean;
  // Datos bancarios
  banco_nombre?: string;
  banco_cuenta?: string;
  banco_tipo_cuenta?: string;
  banco_cedula_rif?: string;
  // Datos de pago móvil
  pago_movil_telefono?: string;
  pago_movil_cedula?: string;
  pago_movil_banco?: string;
  // Datos de contacto
  telefono_contacto?: string;
  email_contacto?: string;
  horario_atencion?: string;
  created_at: string;
  updated_at: string;
  torres?: Torre[];
}

export interface Torre {
  id: string;
  propiedad_id: string;
  nombre: string;
  numero_pisos: number;
  created_at: string;
  updated_at: string;
}

 

export interface Propietario {
  id: string;
  nombre: string;
  apartamento: string;
  telefono: string;
  email: string;
  cuota_mensual: number;
  propiedad_id: string;
  torre_id?: string;
  piso?: string;
  numero_apartamento?: string;
  wallet_bs: number; // Saldo en Bs
  wallet_usd: number; // Saldo en USD
  ultima_recarga?: string;
  created_at: string;
  updated_at: string;
  propiedad?: Propiedad;
  torre?: Torre;
}

export interface RecargaWallet {
  id: string;
  propietario_id: string;
  monto_bs: number;
  monto_usd: number;
  tasa_cambio: number;
  forma_pago: 'transferencia' | 'pago_movil' | 'efectivo';
  banco_origen?: string;
  banco_destino?: string;
  numero_referencia?: string;
  fecha_recarga: string;
  created_at: string;
}

export interface Pago {
  id: string;
  propietario_id: string;
  propiedad_id: string;
  monto_usd: number;
  monto_bs: number;
  tasa_cambio: number;
  forma_pago: 'transferencia' | 'pago_movil' | 'efectivo';
  banco_origen: string;
  banco_destino: string;
  numero_referencia: string;
  fecha_pago: string;
  fecha_registro: string; // Fecha cuando el admin registra en el sistema
  mes: string;
  estado: 'completo' | 'parcial' | 'pendiente';
  abono_restante: number;
  distribuido?: boolean; // ✅ Agregar propiedad
  fecha_distribucion?: string; // ✅ Agregar propiedad
  meses_cubiertos?: string[];
  desglose_pagos?: DesglosePago[];
  created_at: string;
  propietarios?: {
    nombre: string;
    apartamento: string;
    propiedad_id: string;
    torre_id: string;
    wallet_bs: number;
    wallet_usd: number;
  };
  propiedades?: {
    id: string;
    nombre: string;
    banco_nombre: string;
    banco_cuenta: string;
  };
}
export interface Configuracion {
  id: string;
  cuota_mensual: number;
  canon_actual: number;
  dia_cobro: number;
  tasa_cambio: number;
  created_at: string;
  updated_at: string;
  fecha_inicio_operaciones: string; 
}

// Tasa de cambio historial
export interface TasaCambioHistorial {
  id: string;
  tasa: number;
  fecha: string;
  creado_por?: string | null; // Permitir null;
  created_at: string;
}

export interface DesglosePago {
  mes: string;
  monto_usd: number;
  monto_bs: number;
  tasa_cambio: number;
  estado: 'completo' | 'parcial' | 'pendiente';
  abono_restante?: number;
}

 

export interface EstadisticasPagos {
  total: number;
  completos: number;
  parciales: number;
  pendientes: number;
  recaudado: number;
  recaudado_bs: number;
}

export interface ResumenPropietario extends Propietario {
  estado_pago: 'al_dia' | 'moroso' | 'parcial';
  deuda_pendiente: number;
  ultimo_pago: string | null;
}

export interface EstadoPagoMensual {
  propietario_id: string;
  nombre: string;
  apartamento: string;
  deuda_anterior: number; // Deuda o saldo a favor del año anterior
  meses: {
    [key: string]: { // key: "2024-01", "2024-02", etc.
      estado: 'completo' | 'parcial' | 'pendiente' | 'abono';
      monto_usd: number;
      monto_bs: number;
      fecha_pago?: string;
      abono_restante?: number;
      desglose?: DesglosePago[];
    }
  };
  total_deuda: number;
  total_pagado: number;
  saldo_actual: number;
}

export interface HistorialPropietario {
  propietario: Propietario;
  pagos: Pago[];
  resumen: {
    total_pagado_usd: number;
    total_pagado_bs: number;
    total_deuda: number;
    meses_al_dia: number;
    meses_morosos: number;
    meses_parciales: number;
    ultimo_pago: string | null;
    primer_pago: string | null;
  };
  meses_estado: {
    mes: string;
    estado: 'completo' | 'parcial' | 'pendiente';
    monto_usd: number;
    monto_bs: number;
    fecha_pago?: string;
  }[];
}

export interface CanonHistorial {
  id: string;
  canon_usd: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  activo: boolean;
  creado_por?: string;
  created_at: string;
  updated_at: string;
}