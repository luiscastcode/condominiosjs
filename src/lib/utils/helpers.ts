// src/lib/utils/helpers.ts
export const formatCurrency = (amount: number, currency: 'USD' | 'VES' = 'USD') => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'VES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (date: string | Date) => {
  return new Intl.DateTimeFormat('es-VE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
};

export const getMonthName = (month: string) => {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const [year, monthNum] = month.split('-');
  return `${months[parseInt(monthNum) - 1]} ${year}`;
};

export const generateUUID = () => {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
};