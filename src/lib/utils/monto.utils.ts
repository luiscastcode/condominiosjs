// src/lib/utils/monto.utils.ts

export interface EvaluacionPago {
  estado: 'PAGADO' | 'ABONO_PARCIAL' | 'CONSULTAR';
  requiereConfirmacion: boolean;
  mensaje?: string;
  montoRedondeado?: number;
  montoExacto: number;
  diferencia: number;
}

/**
 * Evalúa si un monto en USD debe considerarse como pago completo o abono parcial
 */
export function evaluarPago(montoUSD: number, canon: number = 15): EvaluacionPago {
  const resultado: EvaluacionPago = {
    estado: 'ABONO_PARCIAL',
    requiereConfirmacion: false,
    montoExacto: montoUSD,
    diferencia: canon - montoUSD
  };

  // Caso 1: Pago completo o superior
  if (montoUSD >= canon) {
    return {
      ...resultado,
      estado: 'PAGADO',
      montoRedondeado: Math.min(montoUSD, canon),
      diferencia: 0
    };
  }

  // Caso 2: Conversión aceptable para redondeo (entre $14.60 y $14.99)
  if (montoUSD >= 14.60 && montoUSD < canon) {
    return {
      ...resultado,
      estado: 'PAGADO',
      requiereConfirmacion: false,
      montoRedondeado: canon,
      diferencia: canon - montoUSD,
      mensaje: `El monto de $${montoUSD.toFixed(2)} se redondeará a $${canon.toFixed(2)} para considerar el mes como PAGADO.`
    };
  }

  // Caso 3: Zona de consulta (entre $14.10 y $14.59)
  if (montoUSD >= 14.10 && montoUSD < 14.60) {
    return {
      ...resultado,
      estado: 'CONSULTAR',
      requiereConfirmacion: true,
      mensaje: `El monto equivale a $${montoUSD.toFixed(2)}. ¿Deseas considerar este mes como PAGADO (redondeando a $${canon.toFixed(2)}) o como ABONO PARCIAL?`
    };
  }

  // Caso 4: Abono parcial (menor a $14.10)
  return {
    ...resultado,
    estado: 'ABONO_PARCIAL',
    requiereConfirmacion: false,
    mensaje: `El monto de $${montoUSD.toFixed(2)} se registrará como ABONO PARCIAL.`
  };
}

/**
 * Formatea un monto en Bs con 2 decimales
 */
export function formatBs(monto: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(monto);
}

/**
 * Formatea un monto en USD con 2 decimales
 */
export function formatUSD(monto: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(monto);
}

/**
 * Formatea una fecha
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * Componente de visualización de monto
 */
export interface MontoDisplayProps {
  montoBs: number;
  montoUSD: number;
  tasa?: number;
  showUSD?: boolean;
  showTasa?: boolean;
  className?: string;
}

/**
 * Hook para redondear montos y obtener información de redondeo
 */
export function useRedondeo(montoUSD: number, canon: number = 15) {
  const evaluacion = evaluarPago(montoUSD, canon);
  
  const montoFinalUSD = evaluacion.estado === 'PAGADO' && evaluacion.montoRedondeado 
    ? evaluacion.montoRedondeado 
    : montoUSD;
  
  const montoFinalBs = montoUSD > 0 
    ? (montoFinalUSD / montoUSD) * (montoUSD * (montoUSD / montoFinalUSD))
    : 0;

  return {
    evaluacion,
    montoFinalUSD,
    montoFinalBs,
    esPagoCompleto: evaluacion.estado === 'PAGADO',
    esAbonoParcial: evaluacion.estado === 'ABONO_PARCIAL',
    requiereConfirmacion: evaluacion.requiereConfirmacion,
    mensaje: evaluacion.mensaje
  };
}