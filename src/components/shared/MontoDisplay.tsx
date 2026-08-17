// src/components/shared/MontoDisplay.tsx
import React from 'react';
import { formatBs, formatUSD, formatDate } from '../../lib/utils/monto.utils';

interface MontoDisplayProps {
  montoBs: number;
  montoUSD: number;
  tasa?: number;
  fecha?: string;
  showUSD?: boolean;
  showTasa?: boolean;
  showFecha?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const MontoDisplay: React.FC<MontoDisplayProps> = ({
  montoBs,
  montoUSD,
  tasa,
  fecha,
  showUSD = true,
  showTasa = false,
  showFecha = false,
  className = '',
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <span className="font-medium text-blue-600">
        Bs {formatBs(montoBs)}
      </span>
      {showUSD && (
        <span className="text-gray-600 ml-1">
          (${formatUSD(montoUSD)})
        </span>
      )}
      {showTasa && tasa && (
        <span className="text-xs text-gray-400 block mt-0.5">
          Tasa: {formatUSD(tasa)} Bs/$
        </span>
      )}
      {showFecha && fecha && (
        <span className="text-xs text-gray-400 block mt-0.5">
          {formatDate(fecha)}
        </span>
      )}
    </div>
  );
};

export default MontoDisplay;