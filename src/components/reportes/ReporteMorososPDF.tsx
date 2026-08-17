// src/components/reportes/ReporteMorososPDF.tsx
import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { supabase } from '../../lib/supabase/client';
import { propietariosService } from '../../lib/services/propietarios.service';
import { propiedadesService } from '../../lib/services/propiedades.service';
import { configuracionService } from '../../lib/services/configuracion.service';
import { dolarapiService } from '../../lib/services/dolarapi.service';
import { formatBs, formatUSD } from '../../lib/utils/monto.utils';

interface MorosoData {
  propietario_id: string;
  nombre: string;
  apartamento: string;
  torre: string;
  edificio: string;
  deuda_usd: number;
  meses_morosos: number;
  meses_detalle: string[];
  estado: 'al_dia' | 'un_mes' | 'moroso';
  observaciones: string;
  abonos: { mes: string; monto: number; restante: number; nombreMes: string; year: string }[];
}

interface ReporteMorososPDFProps {
  edificioId?: string;
  onClose: () => void;
}

const ReporteMorososPDF: React.FC<ReporteMorososPDFProps> = ({ edificioId, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const generarPDF = async () => {
    setIsLoading(true);
    setError('');

    try {
      // 1. Obtener tasa del día
      const tasaData = await dolarapiService.getTasaActual();
      const tasaDia = tasaData?.promedio || 0;

      // 2. Obtener propietarios y propiedades
      const [propietariosData, propiedadesData] = await Promise.all([
        propietariosService.getAll(),
        propiedadesService.getAll()
      ]);

      // 3. Obtener pagos de todos los propietarios
      const { data: pagosData } = await supabase
        .from('pagos')
        .select('*');

      // 4. Procesar datos de morosos
      const hoy = new Date();
      const mesActual = hoy.getMonth() + 1;
      const añoActual = hoy.getFullYear();

      const morososPorEdificio: { [key: string]: MorosoData[] } = {};

      for (const prop of propietariosData) {
        const propiedad = propiedadesData.find(p => p.id === prop.propiedad_id);
        const edificio = propiedad?.nombre || 'Sin edificio';
        const torre = prop.torre?.nombre || 'Sin torre';

        let deudaTotal = 0;
        let mesesMorosos = 0;
        let mesesDetalle: string[] = [];
        let observaciones = '';
        let abonosPorMes: { mes: string; monto: number; restante: number; nombreMes: string; year: string }[] = [];
        let estado: 'al_dia' | 'un_mes' | 'moroso' = 'al_dia';

        const fechaInicio = await configuracionService.getFechaInicioOperaciones();
        const [yearInicio, monthInicio] = fechaInicio.split('-').map(Number);

        let año = yearInicio;
        let mes = monthInicio;
        const mesesLista: string[] = [];

        while (año < añoActual || (año === añoActual && mes <= mesActual)) {
          mesesLista.push(`${año}-${String(mes).padStart(2, '0')}`);
          mes++;
          if (mes > 12) {
            mes = 1;
            año++;
          }
        }

        for (const mesKey of mesesLista) {
          const canon = await configuracionService.getCanonPorFecha(mesKey);
          let pagado = 0;

          const pagosProp = pagosData?.filter(p => p.propietario_id === prop.id) || [];
          pagosProp.forEach(pago => {
            if (pago.desglose_pagos && Array.isArray(pago.desglose_pagos)) {
              pago.desglose_pagos.forEach((item: any) => {
                if (item.mes === mesKey) {
                  pagado += item.monto_usd || 0;
                }
              });
            }
          });

          const deuda = Math.max(0, canon - pagado);
          const deudaRedondeada = deuda <= 0.50 ? 0 : deuda;

          if (deudaRedondeada > 0) {
            deudaTotal += deudaRedondeada;
            mesesMorosos++;
            
            const [year, month] = mesKey.split('-');
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const mesNombre = meses[parseInt(month) - 1];
            mesesDetalle.push(`${mesNombre} ${year}`);

            if (pagado > 0 && deudaRedondeada > 0) {
              abonosPorMes.push({
                mes: mesKey,
                monto: pagado,
                restante: deudaRedondeada,
                nombreMes: mesNombre,
                year: year
              });
            }
          }
        }

        // Determinar estado
        if (mesesMorosos === 0) {
          estado = 'al_dia';
          observaciones = 'SOLVENTE A LA FECHA';
        } else if (mesesMorosos === 1) {
          estado = 'un_mes';
          // Verificar si es el mes actual
          const mesActualKey = `${añoActual}-${String(mesActual).padStart(2, '0')}`;
          const deudaMesActual = mesesDetalle.some(m => {
            const [nombre, year] = m.split(' ');
            const mesNum = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
                           .indexOf(nombre) + 1;
            return mesNum === mesActual && parseInt(year) === añoActual;
          });
          
          if (!deudaMesActual) {
            estado = 'moroso';
          }
        } else {
          estado = 'moroso';
        }

        // ✅ Construir observaciones según las reglas
        if (estado === 'al_dia') {
          observaciones = 'SOLVENTE A LA FECHA';
        } else {
          const mesesOrdenados = mesesDetalle.sort((a, b) => {
            const [mesA, yearA] = a.split(' ');
            const [mesB, yearB] = b.split(' ');
            const numA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
                         .indexOf(mesA) + 1;
            const numB = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
                         .indexOf(mesB) + 1;
            return (parseInt(yearA) * 12 + numA) - (parseInt(yearB) * 12 + numB);
          });

          // ✅ Si solo hay un mes moroso, mostrar solo ese mes con su resto si tiene abono
          if (mesesOrdenados.length === 1) {
            const mesUnico = mesesOrdenados[0];
            
            // Buscar si tiene abono en ese mes
            const abono = abonosPorMes.find(a => `${a.nombreMes} ${a.year}` === mesUnico);
            
            if (abono) {
              observaciones = `${mesUnico}: Resta $${abono.restante.toFixed(2)}`;
            } else {
              observaciones = mesUnico;
            }
          } else {
            // ✅ Si hay 2 o más meses, mostrar "Desde X a Y"
            const primerMes = mesesOrdenados[0];
            const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];
            observaciones = `Desde ${primerMes} a ${ultimoMes}`;
            
            // ✅ Si hay abonos, agregarlos al final
            if (abonosPorMes.length > 0) {
              const abonosTexto = abonosPorMes.map(a => {
                return `${a.nombreMes} ${a.year}: Resta $${a.restante.toFixed(2)}`;
              }).join(' | ');
              observaciones += ` (${abonosTexto})`;
            }
          }
        }

        const morosoData: MorosoData = {
          propietario_id: prop.id,
          nombre: prop.nombre,
          apartamento: prop.apartamento,
          torre: torre,
          edificio: edificio,
          deuda_usd: deudaTotal,
          meses_morosos: mesesMorosos,
          meses_detalle: mesesDetalle,
          estado: estado,
          observaciones: observaciones,
          abonos: abonosPorMes
        };

        const key = `${edificio}-${torre}`;
        if (!morososPorEdificio[key]) {
          morososPorEdificio[key] = [];
        }
        morososPorEdificio[key].push(morosoData);
      }

      for (const key of Object.keys(morososPorEdificio)) {
        morososPorEdificio[key].sort((a, b) => {
          return a.apartamento.localeCompare(b.apartamento);
        });
      }

      // 5. Generar PDF
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const margin = 10;
      let yPos = 15;

      // Título
      doc.setFontSize(18);
      doc.setTextColor(40, 40, 80);
      doc.text('REPORTE DE RELACIÓN DE MOROSOS', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Fecha y Tasa
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const fechaStr = new Date().toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.text(`Fecha de corte: ${fechaStr}`, margin, yPos);
      yPos += 5;
      doc.text(`Tasa de cambio: Bs ${formatUSD(tasaDia)}`, margin, yPos);
      yPos += 8;

      // Procesar cada edificio/torre
      const edificios = Object.keys(morososPorEdificio).sort();

      for (let i = 0; i < edificios.length; i++) {
        const key = edificios[i];
        const data = morososPorEdificio[key];
        const [edificio, torre] = key.split('-');

        // Verificar si necesitamos nueva página
        if (yPos > 250) {
          doc.addPage();
          yPos = 15;
        }

        // Encabezado de edificio/torre
        doc.setFontSize(14);
        doc.setTextColor(30, 30, 80);
        doc.text(`Edificio: ${edificio} - Torre: ${torre}`, margin, yPos);
        yPos += 8;

        // ✅ Definir columnas ajustadas (observaciones más ancha)
        const col1 = 22;  // Apartamento
        const col2 = 38;  // Propietario (más pequeño)
        const col3 = 25;  // Deuda
        const col4 = 20;  // Meses
        const col5 = 80;  // Observaciones (más ancha)

        // Encabezados
        const headerY = yPos;
        doc.setFillColor(40, 40, 80);
        doc.rect(margin, headerY, pageWidth - margin * 2, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Apartamento', margin + 1, headerY + 5);
        doc.text('Propietario', margin + col1 + 2, headerY + 5);
        doc.text('Deuda ($)', margin + col1 + col2 + 2, headerY + 5);
        doc.text('Meses', margin + col1 + col2 + col3 + 2, headerY + 5);
        doc.text('Observaciones', margin + col1 + col2 + col3 + col4 + 2, headerY + 5);
        yPos += 7;

        // Datos
        let totalDeuda = 0;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);

        for (const item of data) {
          // Verificar espacio
          if (yPos > 260) {
            doc.addPage();
            yPos = 15;
            // Re-dibujar encabezado en nueva página
            doc.setFillColor(40, 40, 80);
            doc.rect(margin, yPos, pageWidth - margin * 2, 7, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text('Apartamento', margin + 1, yPos + 5);
            doc.text('Propietario', margin + col1 + 2, yPos + 5);
            doc.text('Deuda ($)', margin + col1 + col2 + 2, yPos + 5);
            doc.text('Meses', margin + col1 + col2 + col3 + 2, yPos + 5);
            doc.text('Observaciones', margin + col1 + col2 + col3 + col4 + 2, yPos + 5);
            yPos += 7;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
          }

          // ✅ Asignar colores según estado
          let bgColor = [255, 255, 255];
          let textColor = [0, 0, 0];

          if (item.estado === 'al_dia') {
            bgColor = [220, 255, 220];
            textColor = [0, 100, 0];
          } else if (item.estado === 'un_mes') {
            bgColor = [255, 255, 200];
            textColor = [150, 100, 0];
          } else if (item.estado === 'moroso') {
            bgColor = [255, 200, 200];
            textColor = [150, 0, 0];
          }

          // Dibujar fila con color de fondo
          doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
          doc.rect(margin, yPos, pageWidth - margin * 2, 5.5, 'F');
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);

          // Apartamento
          doc.text(item.apartamento, margin + 1, yPos + 4);
          // Propietario (truncar si es muy largo)
          let nombre = item.nombre;
          if (nombre.length > 20) {
            nombre = nombre.substring(0, 18) + '...';
          }
          doc.text(nombre, margin + col1 + 2, yPos + 4);
          // Deuda
          doc.text(`$${item.deuda_usd.toFixed(2)}`, margin + col1 + col2 + 2, yPos + 4);
          // Meses
          doc.text(item.meses_morosos > 0 ? item.meses_morosos.toString() : '0', margin + col1 + col2 + col3 + 2, yPos + 4);
          // Observaciones (truncar si es muy largo)
          let obs = item.observaciones;
          if (obs.length > 55) {
            obs = obs.substring(0, 53) + '...';
          }
          doc.text(obs, margin + col1 + col2 + col3 + col4 + 2, yPos + 4);

          totalDeuda += item.deuda_usd;
          yPos += 5.5;
        }

        // Fila de total
        if (yPos > 260) {
          doc.addPage();
          yPos = 15;
        }

        const totalDeudaBs = totalDeuda * tasaDia;
        doc.setFillColor(200, 200, 220);
        doc.rect(margin, yPos, pageWidth - margin * 2, 6, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text('TOTAL:', margin + col1 + 2, yPos + 4);
        doc.text(`$${totalDeuda.toFixed(2)}`, margin + col1 + col2 + 2, yPos + 4);
        doc.text(`Bs ${totalDeudaBs.toFixed(2)}`, margin + col1 + col2 + col3 + 2, yPos + 4);
        yPos += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);

        // Espacio entre tablas
        yPos += 6;
      }

      // Pie de página
      const pageCount = doc.internal.pages.length;
      for (let i = 1; i < pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generado el ${fechaStr} - Página ${i} de ${pageCount - 1}`, pageWidth / 2, 290, { align: 'center' });
      }

      // Descargar PDF
      doc.save(`Reporte_Morosos_${fechaStr.replace(/\//g, '-')}.pdf`);

    } catch (err) {
      console.error('Error generando PDF:', err);
      setError('Error al generar el reporte. Por favor, intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">📄 Generar Reporte de Morosos</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Se generará un reporte en PDF con la relación de propietarios morosos,
            organizados por edificio y torre.
          </p>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <strong>Leyenda de colores:</strong>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-200 border border-green-300 rounded"></div>
                <span>🟢 Al día (Solvente)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-200 border border-yellow-300 rounded"></div>
                <span>🟡 1 mes de deuda</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-200 border border-red-300 rounded"></div>
                <span>🔴 Moroso (2+ meses)</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">
            ❌ {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={generarPDF}
            disabled={isLoading}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generando...
              </>
            ) : (
              '📄 Generar PDF'
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReporteMorososPDF;