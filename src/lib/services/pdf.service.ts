// src/lib/services/pdf.service.ts
import jsPDF from 'jspdf';

export interface ReciboData {
  propietario: {
    nombre: string;
    apartamento: string;
    torre?: string;
    telefono: string;
    email: string;
    cuota_mensual: number;
  };
  propiedad: {
    nombre: string;
    direccion: string;
    ciudad: string;
    estado: string;
    banco_nombre: string;
    banco_cuenta: string;
    banco_tipo_cuenta: string;
    banco_cedula_rif: string;
    telefono_contacto: string;
    email_contacto: string;
    horario_atencion: string;
  };
  pago: {
    id: string;
    monto_usd: number;
    monto_bs: number;
    tasa_cambio: number;
    forma_pago: string;
    banco_origen?: string;
    banco_destino?: string;
    numero_referencia?: string;
    fecha_pago: string;
    fecha_registro: string;
    mes: string;
    estado: string;
    administrador?: string;
  };
  distribucion?: {
    meses: Array<{
      mes: string;
      monto_usd: number;
      monto_bs: number;
      estado: string;
      canon_mensual: number;
    }>;
    total_asignado_usd: number;
    total_asignado_bs: number;
  };
}

export const pdfService = {
  async generarRecibo(data: ReciboData): Promise<void> {
    // ✅ Log para depuración
    console.log('📄 PDF - Generando recibo con datos:', {
      banco_nombre: data.propiedad.banco_nombre,
      banco_cuenta: data.propiedad.banco_cuenta,
      banco_tipo_cuenta: data.propiedad.banco_tipo_cuenta,
      banco_cedula_rif: data.propiedad.banco_cedula_rif,
      telefono_contacto: data.propiedad.telefono_contacto,
      email_contacto: data.propiedad.email_contacto
    });

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const marginLeft = 20;
    const marginRight = pageWidth - 20;
    let yPos = 15;

    // Colores
    const colorPrimary = [0, 51, 102];
    const colorGray = [120, 120, 120];
    const colorText = [40, 40, 40];

    // ============ ENCABEZADO ============
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimary[0], colorPrimary[1], colorPrimary[2]);
    doc.text(data.propiedad.nombre.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
    yPos += 7;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorGray[0], colorGray[1], colorGray[2]);
    doc.text(`CONDOMINIO ${data.propiedad.direccion}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
    doc.text(`MUNICIPIO ${data.propiedad.ciudad}, ${data.propiedad.estado}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // ============ NÚMERO DE RECIBO Y FECHA ============
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimary[0], colorPrimary[1], colorPrimary[2]);
    doc.text(`RECIBO ELECTRONICO N° ${data.pago.id.slice(0, 8)}`, marginLeft, yPos);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorText[0], colorText[1], colorText[2]);
    doc.text(`FECHA RECIBO`, pageWidth - 50, yPos);
    const fechaEmision = new Date().toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    doc.text(fechaEmision, pageWidth - 50, yPos + 5);
    yPos += 15;

    // ============ SOLVENCIA ============
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimary[0], colorPrimary[1], colorPrimary[2]);
    doc.text(`SOLVENCIA HASTA:`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorText[0], colorText[1], colorText[2]);
    
    let solvenciaMes = '--';
    if (data.distribucion && data.distribucion.meses.length > 0) {
      const mesesCompletos = data.distribucion.meses
        .filter(m => m.estado === 'completo')
        .sort((a, b) => a.mes.localeCompare(b.mes));
      
      if (mesesCompletos.length > 0) {
        const ultimoMesCompleto = mesesCompletos[mesesCompletos.length - 1];
        solvenciaMes = formatMes(ultimoMesCompleto.mes);
      }
    }
    doc.text(`${solvenciaMes}`, marginLeft + 50, yPos);
    yPos += 10;

    // ============ DATOS DEL INMUEBLE ============
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorText[0], colorText[1], colorText[2]);
    doc.text(`INMUEBLE N°`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${data.propietario.apartamento}`, marginLeft + 30, yPos);
    
    if (data.propietario.torre) {
      doc.setFont('helvetica', 'bold');
      doc.text(`TORRE`, marginLeft + 80, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.propietario.torre}`, marginLeft + 100, yPos);
    }
    yPos += 8;

    doc.setFont('helvetica', 'bold');
    doc.text(`PROPIETARIO`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${data.propietario.nombre.toUpperCase()}`, marginLeft + 30, yPos);
    yPos += 12;

    // ============ LÍNEA SEPARADORA ============
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, yPos, marginRight, yPos);
    yPos += 8;

    

    // ============ DETALLE DEL PAGO ============
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorText[0], colorText[1], colorText[2]);
    
    const tieneDistribucion = data.distribucion && data.distribucion.meses.length > 0;
    const mesesPagos = tieneDistribucion ? data.distribucion!.meses : [{ 
      mes: data.pago.mes, 
      monto_bs: data.pago.monto_bs,
      monto_usd: data.pago.monto_usd,
      estado: data.pago.estado,
      canon_mensual: data.propietario.cuota_mensual || 15
    }];
    
    const mesesOrdenados = [...mesesPagos].sort((a, b) => a.mes.localeCompare(b.mes));

    if (mesesOrdenados.length === 1) {
      const mes = mesesOrdenados[0];
      const canon = mes.canon_mensual || data.propietario.cuota_mensual || 15;
      doc.text(`PAGO CONDOMINIO ${formatMes(mes.mes)} CUOTA ${canon}$ A TASA BCV`, marginLeft, yPos);
      yPos += 6;
    } else {
      doc.text(`PAGO CONDOMINIO A TASA BCV`, marginLeft, yPos);
      yPos += 5;
      
      doc.setFontSize(7);
      mesesOrdenados.forEach((mes) => {
        const canon = mes.canon_mensual || data.propietario.cuota_mensual || 15;
        const estadoIcon = mes.estado === 'completo' ? 'Pagado' : 
                           mes.estado === 'parcial' ? 'Abono' : '⏳';
        const linea = `${estadoIcon} ${formatMes(mes.mes)} - CUOTA ${canon}$ - MONTO: Bs ${formatNumber(mes.monto_bs)} ($${mes.monto_usd.toFixed(2)})`;
        doc.text(linea, marginLeft + 3, yPos);
        yPos += 4.5;
      });
      
      const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];
      if (ultimoMes.estado === 'completo') {
        doc.setFontSize(7);
        doc.text(`SOLVENCIA HASTA: ${formatMes(ultimoMes.mes)}`, marginLeft + 3, yPos);
        yPos += 4.5;
      }
      yPos += 3;
    }

    // ============ SEPARADOR ============
    doc.setFontSize(8);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, yPos, marginRight, yPos);
    yPos += 8;

    // ============ DATOS DE PAGO ============
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorText[0], colorText[1], colorText[2]);
    doc.text(`FORMA DE PAGO`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(getFormaPagoTexto(data.pago.forma_pago), marginLeft + 35, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.text(`MONTO TOTAL PAGO`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatNumber(data.pago.monto_bs)}`, marginLeft + 35, yPos);
    if (data.pago.forma_pago === 'efectivo') {
      doc.text(`($${data.pago.monto_usd.toFixed(2)})`, marginLeft + 70, yPos);
    }
    yPos += 6;

    if (data.pago.banco_origen) {
      doc.setFont('helvetica', 'bold');
      doc.text(`BANCO EMISOR`, marginLeft, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(data.pago.banco_origen, marginLeft + 35, yPos);
      yPos += 6;
    }

    // ✅ BANCO RECEPTOR - Usar datos de la propiedad
    doc.setFont('helvetica', 'bold');
    doc.text(`BANCO RECEPTOR`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    const bancoReceptor = data.propiedad.banco_nombre || 'No especificado';
    doc.text(bancoReceptor, marginLeft + 35, yPos);
    yPos += 6;

    if (data.pago.numero_referencia) {
      doc.setFont('helvetica', 'bold');
      doc.text(`REFERENCIA`, marginLeft, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(data.pago.numero_referencia, marginLeft + 35, yPos);
      yPos += 6;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`FECHA PAGO`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(data.pago.fecha_pago), marginLeft + 35, yPos);
    yPos += 10;

    // ============ ADMINISTRADOR ============
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimary[0], colorPrimary[1], colorPrimary[2]);
    doc.text(`ADMINISTRADOR`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorText[0], colorText[1], colorText[2]);
    doc.text(data.pago.administrador || 'JEAN CARLOS SANCHEZ', marginLeft + 35, yPos);
    yPos += 10;

    // ============ INSTRUCCIONES CON DATOS DE LA PROPIEDAD ============
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(colorGray[0], colorGray[1], colorGray[2]);
    
    // ✅ Usar TODOS los datos de la propiedad
    const bancoNombre = data.propiedad.banco_nombre || 'Banco';
    const bancoCuenta = data.propiedad.banco_cuenta || '0000-0000-00-0000000000';
    const bancoTipo = data.propiedad.banco_tipo_cuenta || 'corriente';
    const rif = data.propiedad.banco_cedula_rif || 'J-00000000-0';
    const telefono = data.propiedad.telefono_contacto || '0412-0000000';
    const email = data.propiedad.email_contacto || 'admin@condominio.com';
    const nombrePropiedad = data.propiedad.nombre || 'Condominio';

    

    const instrucciones = [
      `Para Transferencias bancarias favor emitir pago a la cuenta ${bancoTipo}`,
      `del ${bancoNombre} ${bancoCuenta}`,
      `a nombre de ${nombrePropiedad} Rif ${rif}`,
      `y enviar soportes de pago al numero ${telefono}`,
      `al correo ${email}`
    ];

    instrucciones.forEach((line, index) => {
      doc.text(line, marginLeft, yPos + (index * 3.5));
    });
    yPos += (instrucciones.length * 3.5) + 8;

    // ============ PIE DE PÁGINA ============
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text(
      `Recibo generado el ${new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })} - Sistema Condominio Manager v1.0`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

    doc.save(`recibo-${data.pago.id.slice(0, 8)}.pdf`);
  }
};

// ============ FUNCIONES AUXILIARES ============

function formatDate(date: string): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatMes(mes: string): string {
  if (!mes) return '-';
  const [year, month] = mes.split('-');
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${meses[parseInt(month) - 1]} ${year}`.toUpperCase();
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function getFormaPagoTexto(forma: string): string {
  switch (forma) {
    case 'transferencia': return 'TRANSFERENCIA';
    case 'pago_movil': return 'PAGO MÓVIL';
    case 'efectivo': return 'EFECTIVO';
    default: return forma.toUpperCase();
  }
}