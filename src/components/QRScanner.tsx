import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect, useRef } from 'react';

interface QRScannerProps {
  onScan: (data: string) => void;
  fps?: number;
  qrbox?: number;
}

export default function QRScanner({ onScan, fps = 10, qrbox = 250 }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps, qrbox, rememberLastUsedCamera: true },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScan(decodedText);
        // Optional: scanner.clear(); // Stop after first scan
      },
      (error) => {
        // console.warn(error);
      }
    );

    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Failed to clear html5QrcodeScanner. ", error);
        });
      }
    };
  }, [onScan, fps, qrbox]);

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div id="qr-reader" className="w-full"></div>
    </div>
  );
}
