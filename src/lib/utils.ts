import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function parseQRCode(qrData: string) {
  // Flexible formats: 
  // 1. SO-260202-0336|RPRO-260203-0325|1/9
  // 2. SLT-260210-182|RPRO-260225-0740|3/5
  // 3. CSUP-260210-182|RPRO-260225-0740
  
  try {
    if (qrData.startsWith('{')) {
      return JSON.parse(qrData);
    }

    const parts = qrData.split('|').map(p => p.trim());
    let so = '';
    let rpro = '';
    let totalBoxes = 1;

    // Check for box indicator in any part
    const boxIndicatorPart = parts.find(p => p.includes('/'));
    if (boxIndicatorPart) {
      const totalStr = boxIndicatorPart.split('/')[1];
      totalBoxes = parseInt(totalStr) || 1;
    }

    // Smart assignment based on prefixes
    parts.forEach(part => {
      if (part.includes('/')) return; // Skip box indicator part
      if (!part) return;
      
      const upperPart = part.toUpperCase();
      // Treat SO, SLT, CSUP as SO
      if (upperPart.startsWith('SO-') || upperPart.startsWith('SLT-') || upperPart.startsWith('CSUP-')) {
        so = part;
      } else if (upperPart.startsWith('RPRO-')) {
        rpro = part;
      } else {
        // Fallback for parts without known prefixes
        if (!so && !rpro) {
          // If first part and no SO/RPRO yet, assume it's SO if it doesn't look like RPRO
          if (upperPart.startsWith('RPRO')) rpro = part;
          else so = part;
        } else if (so && !rpro) {
          rpro = part;
        } else if (!so && rpro) {
          so = part;
        }
      }
    });

    return {
      qrCode: qrData,
      so: so,
      rpro: rpro,
      kh: '', 
      boxType: '', 
      quantity: 1, 
      totalBoxes: totalBoxes,
      location: '',
      date: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Failed to parse QR code', e);
  }
  
  return {
    qrCode: qrData,
    so: '',
    rpro: '',
    kh: '',
    boxType: '',
    quantity: 1,
    totalBoxes: 1,
    location: '',
    date: new Date().toISOString(),
  };
}
