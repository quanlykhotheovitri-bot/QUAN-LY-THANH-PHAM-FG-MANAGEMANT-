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
  // 2. SO-260202-0336|RPRO-260203-0325
  // 3. SO-260202-0336|
  
  try {
    if (qrData.startsWith('{')) {
      return JSON.parse(qrData);
    }

    const parts = qrData.split('|').map(p => p.trim());
    const so = parts[0] || '';
    const rpro = parts[1] || '';
    let totalBoxes = 1;

    // Check if the last part is a box indicator like "1/9"
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.includes('/')) {
        const totalStr = lastPart.split('/')[1];
        totalBoxes = parseInt(totalStr) || 1;
      }
    }

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
