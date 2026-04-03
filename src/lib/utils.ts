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
  // Example format: QRCODE|SO|RPRO|KH|BoxType|Qty|Location
  // This is a flexible parser. We can adjust based on actual QR formats.
  // For now, let's assume a pipe-separated format or JSON.
  
  try {
    if (qrData.startsWith('{')) {
      return JSON.parse(qrData);
    }
    
    const parts = qrData.split('|');
    if (parts.length >= 5) {
      return {
        qrCode: parts[0],
        so: parts[1],
        rpro: parts[2],
        kh: parts[3],
        boxType: parts[4],
        quantity: parseInt(parts[5]) || 1,
        location: parts[6] || '',
        date: parts[7] || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error('Failed to parse QR code', e);
  }
  
  // Fallback: treat whole string as QR code
  return {
    qrCode: qrData,
    so: '',
    rpro: '',
    kh: '',
    boxType: '',
    quantity: 1,
    location: '',
    date: new Date().toISOString(),
  };
}
