import { useState, useEffect, ChangeEvent, useRef, useMemo, memo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLoading } from '../contexts/LoadingContext';
import { parseQRCode, clearAppCache } from '../lib/utils';
import QRScanner from '../components/QRScanner';
import { 
  Scan, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Trash2,
  Package,
  MapPin,
  User,
  Hash,
  Download,
  Upload,
  Settings,
  History as HistoryIcon,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation, SourceImportLine } from '../types';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

// Memoized Row Component to prevent unnecessary re-renders of the large table
const HistoryRow = memo(({ 
  item, 
  isAdmin, 
  isSelected, 
  status, 
  onToggleSelect, 
  onDelete 
}: { 
  item: any, 
  isAdmin: boolean, 
  isSelected: boolean, 
  status: string,
  onToggleSelect: (id: string) => void,
  onDelete: (id: string) => void
}) => {
  return (
    <tr className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 45px' }}>
      <td className="px-2 py-3 border-b border-r border-slate-200 text-center">
        {isAdmin && (
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={() => onToggleSelect(item.id)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        )}
      </td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 font-medium text-slate-700">{item.qr_code}</td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center">{item.so}</td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center">{item.rpro}</td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center sm:table-cell hidden">{item.kh || 'N/A'}</td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center font-medium text-slate-600">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
          status === 'Đủ đơn' 
            ? 'bg-emerald-100 text-emerald-700' 
            : 'bg-rose-100 text-rose-700'
        }`}>
          {status || 'Đang kiểm tra...'}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center">{item.box_type}</td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center font-bold">
        {item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity}
      </td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center">{item.location_path || 'N/A'}</td>
      <td className="px-4 py-3 text-[11px] border-b border-r border-slate-200 text-center">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
      <td className="px-2 py-3 border-b border-slate-200 text-center">
        {isAdmin && (
          <button 
            onClick={() => onDelete(item.id)}
            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
  );
});

export default function Inbound() {
  const { user: authUser } = useAuth();
  const { setIsLoading } = useLoading();
  const isAdmin = authUser?.role === 'admin';
  const isViewer = authUser?.role === 'viewer';
  const [scannedItems, setScannedItems] = useState<any[]>(() => {
    const saved = localStorage.getItem('inbound_scanned_items');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('inbound_scanned_items', JSON.stringify(scannedItems));
  }, [scannedItems]);
  const [selectedScanned, setSelectedScanned] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [selectedBoxType, setSelectedBoxType] = useState<'Nhựa' | 'Giấy'>('Nhựa');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [manualQR, setManualQR] = useState('');
  const [scannedSearch, setScannedSearch] = useState('');
  const [scannedStatusFilter, setScannedStatusFilter] = useState<'all' | 'ok' | 'wrong'>('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [orderStatusMap, setOrderStatusMap] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const historyPageSize = 20000;
  const fetchLockRef = useRef(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      const timer = setTimeout(() => {
        fetchHistory(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab, historySearch, statusFilter, startDate, endDate]);

  const filteredHistory = useMemo(() => {
    return historyData.filter(item => {
      const status = orderStatusMap[`${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`] || '';
      
      // Status filter (dropdown)
      let matchesStatus = true;
      if (statusFilter === 'complete') matchesStatus = status === 'Đủ đơn';
      else if (statusFilter === 'incomplete') {
        matchesStatus = status !== '' && status !== 'Đủ đơn' && status !== 'Đang kiểm tra...';
      }
      
      if (!matchesStatus) return false;

      // Search filter (text)
      if (!historySearch.trim()) return true;
      
      const searchLower = historySearch.toLowerCase().trim();
      return (
        item.so?.toLowerCase().includes(searchLower) ||
        item.rpro?.toLowerCase().includes(searchLower) ||
        item.qr_code?.toLowerCase().includes(searchLower) ||
        item.kh?.toLowerCase().includes(searchLower) ||
        status.toLowerCase().includes(searchLower)
      );
    });
  }, [historyData, orderStatusMap, statusFilter, historySearch]);

  const exportHistory = (format: 'xlsx' | 'csv') => {
    const dataToExport = filteredHistory;
    const data = dataToExport.map(item => ({
      'QRCODE': item.qr_code,
      'SO': item.so,
      'RPRO': item.rpro,
      'KHÁCH HÀNG': item.kh || 'N/A',
      'TÌNH TRẠNG': orderStatusMap[`${item.so}|${item.rpro}`] || '',
      'LOẠI THÙNG': item.box_type,
      'SỐ THÙNG ĐƠN HÀNG': item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity,
      'VỊ TRÍ': item.location_path,
      'NGÀY NHẬP': formatDate(item.created_at),
      'NGƯỜI NHẬP': item.user_email
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InboundHistory');
    XLSX.writeFile(wb, `InboundHistory_${new Date().toISOString().split('T')[0]}.${format}`);
  };

  const exportAllHistory = async (format: 'xlsx' | 'csv') => {
    setIsLoading(true);
    try {
      let allData: any[] = [];
      let currentOffset = 0;
      const pageSize = 1000;
      let finished = false;
      const maxRows = 500000; // Increased limit to download "all data"

      while (!finished) {
        let query = supabase
          .from('inbound_transactions')
          .select('*', { count: 'exact' });

        if (historySearch.trim()) {
          const search = historySearch.trim();
          query = query.or(`so.ilike.%${search}%,rpro.ilike.%${search}%,kh.ilike.%${search}%,qr_code.ilike.%${search}%`);
        }

        if (startDate) {
          query = query.gte('created_at', `${startDate}T00:00:00`);
        }
        if (endDate) {
          query = query.lte('created_at', `${endDate}T23:59:59`);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) {
          finished = true;
        } else {
          allData = [...allData, ...data];
          currentOffset += data.length;
          const total = count || 0;
          if (currentOffset >= total || allData.length >= maxRows) finished = true;
          // Progress feedback could go here if needed
        }
      }

      if (allData.length > maxRows) {
        allData = allData.slice(0, maxRows);
      }

      // Deduplicate to avoid row shifting overlap during all-data fetch
      const seenIdsExport = new Set();
      allData = allData.filter(item => {
        if (seenIdsExport.has(item.id)) return false;
        seenIdsExport.add(item.id);
        return true;
      });

      const uniqueItems = Array.from(new Set(allData.map(item => `${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`)));
      const fullStatusMap: Record<string, string> = {};

      const chunkSize = 50;
      for (let i = 0; i < uniqueItems.length; i += chunkSize) {
        const chunk = uniqueItems.slice(i, i + chunkSize);
        const { data: allRelated } = await supabase
          .from('inbound_transactions')
          .select('qr_code, so, rpro')
          .or(chunk.map(key => {
            const [so, rpro] = key.split('|');
            return `and(so.eq."${so || ''}",rpro.eq."${rpro || ''}")`;
          }).join(','));

        chunk.forEach(key => {
          const [so, rpro] = key.split('|');
          const relatedBoxes = allRelated?.filter(b => (b.so?.trim() || '') === so && (b.rpro?.trim() || '') === rpro) || [];
          const itemExample = allData.find(d => (d.so?.trim() || '') === so && (d.rpro?.trim() || '') === rpro);
          const total = itemExample?.total_boxes || 0;
          
          if (total <= 0) {
            fullStatusMap[key] = 'Đủ đơn';
          } else {
            const presentBoxes = new Set<number>();
            relatedBoxes.forEach(b => {
              const parsed = parseQRCode(b.qr_code);
              presentBoxes.add(parsed.quantity);
            });
            const missing = [];
            for (let j = 1; j <= total; j++) {
              if (!presentBoxes.has(j)) missing.push(j);
            }
            fullStatusMap[key] = missing.length === 0 ? 'Đủ đơn' : `Thiếu thùng số ${missing.join(', ')}`;
          }
        });
      }

      if (statusFilter !== 'all') {
        allData = allData.filter(item => {
          const status = fullStatusMap[`${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`] || '';
          if (statusFilter === 'complete') return status === 'Đủ đơn';
          if (statusFilter === 'incomplete') return status !== '' && status !== 'Đủ đơn' && status !== 'Đang kiểm tra...';
          return true;
        });
      }

      const data = allData.map(item => ({
        'QRCODE': item.qr_code,
        'SO': item.so,
        'RPRO': item.rpro,
        'KHÁCH HÀNG': item.kh || 'N/A',
        'TÌNH TRẠNG': fullStatusMap[`${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`] || 'N/A',
        'LOẠI THÙNG': item.box_type,
        'SỐ THÙNG ĐƠN HÀNG': item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity,
        'VỊ TRÍ': item.location_path,
        'NGÀY NHẬP': formatDate(item.created_at),
        'NGƯỜI NHẬP': item.user_email
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'InboundHistory_Full');
      XLSX.writeFile(wb, `InboundHistory_Full_${new Date().toISOString().split('T')[0]}.${format}`);
      setMessage({ type: 'success', text: 'Tải xuống hoàn thành.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi xuất dữ liệu: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatus = (item: any) => {
    const statusText = orderStatusMap[`${item.so}|${item.rpro}`];
    if (!statusText) return { status: 'Chưa có thông tin', class: 'text-slate-400' };
    if (statusText === 'Đủ đơn') return { status: 'OK', class: 'text-emerald-600' };
    return { status: 'Wrong', class: 'text-rose-600' };
  };

  const filteredScanned = scannedItems.filter(item => {
    // Search filter
    if (scannedSearch.trim()) {
      const searchLower = scannedSearch.toLowerCase().trim();
      const matchesSearch = 
        item.qrCode?.toLowerCase().includes(searchLower) ||
        item.so?.toLowerCase().includes(searchLower) ||
        item.rpro?.toLowerCase().includes(searchLower) ||
        item.kh?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status filter
    const status = getStatus(item).status;
    if (scannedStatusFilter === 'ok') return status === 'OK' || status === 'Đúng';
    if (scannedStatusFilter === 'wrong') return status === 'Wrong' || status === 'Sai' || status === 'Chưa có thông tin';
    
    return true;
  });

  async function fetchHistory(isNew = false, pageOverride?: number) {
    if (historyLoading || fetchLockRef.current) return;
    fetchLockRef.current = true;
    setHistoryLoading(true);
    setIsLoading(true);
    
    try {
      const targetPage = pageOverride !== undefined ? pageOverride : (isNew ? 1 : historyPage);
      const startRange = (targetPage - 1) * historyPageSize;
      
      // Step 1: Get total count first to know how many chunks to fetch in parallel
      let query = supabase
        .from('inbound_transactions')
        .select('*', { count: 'exact', head: true });

      if (historySearch.trim()) {
        const search = historySearch.trim();
        query = query.or(`so.ilike.%${search}%,rpro.ilike.%${search}%,kh.ilike.%${search}%,qr_code.ilike.%${search}%`);
      }

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      const { count } = await query;
      const totalCount = count || 0;
      setHistoryTotal(totalCount);
      setHasMore(totalCount > targetPage * historyPageSize);

      if (totalCount === 0) {
        setHistoryData([]);
        setHistoryLoading(false);
        setIsLoading(false);
        fetchLockRef.current = false;
        return;
      }

      // Step 2: Fetch data in parallel chunks for maximum speed
      const CHUNK_SIZE = 2500;
      const totalNeeded = Math.min(historyPageSize, totalCount - startRange);
      const numChunks = Math.ceil(totalNeeded / CHUNK_SIZE);
      const fetchPromises = [];

      for (let i = 0; i < numChunks; i++) {
        const offset = startRange + (i * CHUNK_SIZE);
        const limit = Math.min(CHUNK_SIZE, totalNeeded - (i * CHUNK_SIZE));
        
        let chunkQuery = supabase
          .from('inbound_transactions')
          .select('*');

        if (historySearch.trim()) {
          const search = historySearch.trim();
          chunkQuery = chunkQuery.or(`so.ilike.%${search}%,rpro.ilike.%${search}%,kh.ilike.%${search}%,qr_code.ilike.%${search}%`);
        }

        if (startDate) {
          chunkQuery = chunkQuery.gte('created_at', `${startDate}T00:00:00`);
        }
        if (endDate) {
          chunkQuery = chunkQuery.lte('created_at', `${endDate}T23:59:59`);
        }

        fetchPromises.push(
          chunkQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)
        );
      }

      const results = await Promise.all(fetchPromises);
      const allFetchedData = results.flatMap(r => r.data || []);

      // Deduplicate to avoid React key errors
      const seenIds = new Set();
      const uniqueFetchedData = [];
      for (const item of allFetchedData) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          uniqueFetchedData.push(item);
        }
      }
      
      const data = uniqueFetchedData;

      // Step 3: RENDER IMMEDIATELY so the user sees the data right away
      const formattedData = data.map(item => ({
        ...item,
        so: item.so?.trim() || '',
        rpro: item.rpro?.trim() || '',
        qr_code: item.qr_code?.trim() || ''
      }));

      setHistoryData(formattedData);
      if (isNew) setHistoryPage(1);
      
      // Stop the global loader, keep historyLoading true while calculating statuses if needed
      // But actually, we want the UI to be responsive now.
      setHistoryLoading(false);
      setIsLoading(false);

      // Step 4: Calculate statuses in background so it doesn't block the UI
      const uniqueSORPRO = Array.from(new Set(data.map(item => `${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`)));
      const statusMap: Record<string, string> = { ...orderStatusMap };

      if (uniqueSORPRO.length > 0) {
        const itemLookup: Record<string, any> = {};
        data.forEach(item => {
          const key = `${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`;
          if (!itemLookup[key]) itemLookup[key] = item;
        });

        // Optimization for complete local datasets
        const inMemoryBoxMap: Record<string, Set<number>> = {};
        if (data.length >= totalCount && !historySearch.trim()) {
          data.forEach(item => {
            const key = `${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`;
            if (!inMemoryBoxMap[key]) inMemoryBoxMap[key] = new Set();
            const parsed = parseQRCode(item.qr_code);
            inMemoryBoxMap[key].add(parsed.quantity);
          });
        }

        const statusChunkSize = 50; 
        for (let i = 0; i < uniqueSORPRO.length; i += statusChunkSize) {
          const chunk = uniqueSORPRO.slice(i, i + statusChunkSize);
          
          let boxesForChunk: any[] = [];
          if (data.length >= totalCount && !historySearch.trim()) {
            // Already handled via inMemoryBoxMap
          } else {
            const { data: allRelated } = await supabase
              .from('inbound_transactions')
              .select('qr_code, so, rpro')
              .or(chunk.map(key => {
                const [so, rpro] = key.split('|');
                return `and(so.eq."${so || ''}",rpro.eq."${rpro || ''}")`;
              }).join(','));
            if (allRelated) boxesForChunk = allRelated;
          }

          chunk.forEach(key => {
            const [so, rpro] = key.split('|');
            const itemInPage = itemLookup[key];
            const total = itemInPage?.total_boxes || 0;
            
            if (total <= 0) {
              statusMap[key] = 'Đủ đơn';
            } else {
              const presentBoxes = new Set<number>();
              if (data.length >= totalCount && !historySearch.trim()) {
                (inMemoryBoxMap[key] || new Set()).forEach(b => presentBoxes.add(b));
              } else {
                boxesForChunk.filter(b => (b.so?.trim() || '') === so && (b.rpro?.trim() || '') === rpro)
                  .forEach(b => {
                    const parsed = parseQRCode(b.qr_code);
                    presentBoxes.add(parsed.quantity);
                  });
              }

              const missing = [];
              for (let j = 1; j <= total; j++) {
                if (!presentBoxes.has(j)) missing.push(j);
              }
              statusMap[key] = missing.length === 0 ? 'Đủ đơn' : `Thiếu thùng số ${missing.join(', ')}`;
            }
          });

          // Sync state incrementally for responsiveness
          setOrderStatusMap({ ...statusMap });
          // Short delay to let the UI breathe
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi khi tải lịch sử: ' + err.message });
    } finally {
      setHistoryLoading(false);
      setIsLoading(false);
      fetchLockRef.current = false;
    }
  }

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*');
    if (data) setLocations(data);
  }

  const matchedLocation = locations.find(l => l.full_path.trim().toLowerCase() === locationInput.trim().toLowerCase());

  const handleScan = async (qrData: string) => {
    const trimmedQR = qrData.trim();
    const matchedLoc = locations.find(l => l.full_path.trim().toLowerCase() === trimmedQR.toLowerCase());
    
    if (matchedLoc) {
      setLocationInput(matchedLoc.full_path);
      setMessage({ type: 'success', text: `Đã nhận diện vị trí: ${matchedLoc.full_path}` });
      setIsScanning(false);
      return;
    }

    processSingleQR(trimmedQR);
    setIsScanning(false);
  };

  const processSingleQR = async (qrData: string) => {
    const parsed = parseQRCode(qrData);
    
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) {
      return;
    }

    // 1. Check if already in inventory
    const { data: existingInDB } = await supabase
      .from('inventory_balances')
      .select('id')
      .eq('qr_code', parsed.qrCode)
      .single();

    if (existingInDB) {
      setMessage({ type: 'error', text: `Kiện hàng ${parsed.qrCode} đã tồn tại trong kho.` });
      return;
    }

    // 2. Fetch matching info and check quantity
    const { data: sourceMatches } = await supabase
      .from('source_import_lines')
      .select('kh, quantity')
      .or(`rpro.eq."${parsed.rpro}",so.eq."${parsed.so}"`);

    const sourceMatch = sourceMatches?.[0];
    let kh = '';
    let totalBoxes = parsed.totalBoxes;

    if (sourceMatch) {
      kh = sourceMatch.kh || '';
      const expectedQty = sourceMatch.quantity || 0;
      
      if (totalBoxes <= 1 && expectedQty > 0) {
        totalBoxes = expectedQty;
      }

      // Check current count in DB
      const { count: dbCount } = await supabase
        .from('inventory_balances')
        .select('*', { count: 'exact', head: true })
        .eq('so', parsed.so)
        .eq('rpro', parsed.rpro);

      // Check count in current waiting list
      const waitingCount = scannedItems.filter(item => 
        item.so === parsed.so && 
        item.rpro === parsed.rpro && 
        item.qrCode !== parsed.qrCode
      ).length;

      const currentTotal = (dbCount || 0) + waitingCount;

      if (expectedQty > 0 && currentTotal >= expectedQty) {
        setMessage({ 
          type: 'error', 
          text: `CHẶN NHẬP: RPRO ${parsed.rpro} đã đủ số lượng (${expectedQty}/${expectedQty}). Không thể nhập thêm kiện hàng này.` 
        });
        return;
      }
    }

    const newItem = {
      ...parsed,
      kh,
      totalBoxes,
      boxType: selectedBoxType,
      locationPath: matchedLocation?.full_path || locationInput,
    };

    setScannedItems(prev => [newItem, ...prev]);
  };

  const [skippedItems, setSkippedItems] = useState<any[]>([]);
  const [showWarning, setShowWarning] = useState(false);

  const handleProcessManual = () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').filter(line => line.trim() !== '');
    processLines(lines);
  };

  const handleImportExcel = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (rawRows.length === 0) {
          setMessage({ type: 'error', text: 'File Excel không có dữ liệu.' });
          setIsLoading(false);
          return;
        }

        const lines: string[] = [];
        rawRows.forEach(row => {
          const rowValues = row.map(v => String(v || '').trim()).filter(Boolean);
          if (rowValues.length === 0) return;
          
          const qrValue = rowValues.find(v => v.includes('|'));
          if (qrValue) {
            lines.push(qrValue);
          } else {
            lines.push(rowValues[0]);
          }
        });

        processLines(lines);
      } catch (err: any) {
        setMessage({ type: 'error', text: 'Lỗi đọc file Excel: ' + err.message });
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  const processLines = async (lines: string[]) => {
    setLoading(true);
    setIsLoading(true);
    setSkippedItems([]);
    
    let currentLocation = matchedLocation?.full_path || locationInput || '';
    
    // Use a local set to track what we've added in this session to avoid duplicates
    const existingQRs = new Set(scannedItems.map(item => item.qrCode));
    const currentSkipped: any[] = [];

    // 1. Pre-extract all SO/RPRO to fetch counts in bulk
    const uniqueSORPRO = new Set<string>();
    lines.forEach(line => {
      if (line.includes('|')) {
        const parsed = parseQRCode(line);
        if (parsed.so || parsed.rpro) {
          uniqueSORPRO.add(`${parsed.so || ''}|${parsed.rpro || ''}`);
        }
      }
    });

    // 2. Fetch expected quantities and current counts in chunks
    const expectedMap: Record<string, number> = {};
    const currentCountMap: Record<string, number> = {};
    const existingInDBSet = new Set<string>();
    let sourceData: any[] = [];

    if (uniqueSORPRO.size > 0) {
      const sorproArray = Array.from(uniqueSORPRO);
      const queryChunkSize = 200; // Small chunk size for complex OR queries

      for (let i = 0; i < sorproArray.length; i += queryChunkSize) {
        const chunk = sorproArray.slice(i, i + queryChunkSize);
        const soList = chunk.map(key => key.split('|')[0]).filter(Boolean);
        const rproList = chunk.map(key => key.split('|')[1]).filter(Boolean);

        if (soList.length === 0 && rproList.length === 0) continue;

        // Fetch expected from source_import_lines
        const { data: sData, error: sError } = await supabase
          .from('source_import_lines')
          .select('so, rpro, quantity, kh')
          .or(`so.in.(${soList.map(s => `"${s}"`).join(',')}),rpro.in.(${rproList.map(r => `"${r}"`).join(',')})`);

        if (sError) console.error('Error fetching source data chunk:', sError);
        if (sData) sourceData = [...sourceData, ...sData];

        // Fetch current from inventory_balances
        const { data: balanceData, error: bError } = await supabase
          .from('inventory_balances')
          .select('so, rpro, qr_code')
          .or(`so.in.(${soList.map(s => `"${s}"`).join(',')}),rpro.in.(${rproList.map(r => `"${r}"`).join(',')})`);

        if (bError) console.error('Error fetching balance data chunk:', bError);
        if (balanceData) {
          balanceData.forEach(item => {
            const key = `${item.so || ''}|${item.rpro || ''}`;
            currentCountMap[key] = (currentCountMap[key] || 0) + 1;
            if (item.qr_code) existingInDBSet.add(item.qr_code);
          });
        }
      }

      sourceData.forEach(item => {
        const key = `${item.so || ''}|${item.rpro || ''}`;
        expectedMap[key] = item.quantity || 0;
      });
    }

    // 3. Track counts including what's already in the waiting list
    const trackingCountMap = { ...currentCountMap };
    scannedItems.forEach(item => {
      const key = `${item.so || ''}|${item.rpro || ''}`;
      trackingCountMap[key] = (trackingCountMap[key] || 0) + 1;
    });
    
    const newItems: any[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      if (!trimmedLine.includes('|')) {
        currentLocation = trimmedLine;
        if (!locationInput) setLocationInput(currentLocation);
        continue;
      }

      const parsed = parseQRCode(trimmedLine);
      if (existingQRs.has(parsed.qrCode)) continue;

      // Check if already in DB
      if (existingInDBSet.has(parsed.qrCode)) {
        currentSkipped.push({
          qrCode: parsed.qrCode,
          so: parsed.so,
          rpro: parsed.rpro,
          reason: 'Mã QR đã tồn tại trong kho'
        });
        continue;
      }

      const key = `${parsed.so || ''}|${parsed.rpro || ''}`;
      const expected = expectedMap[key] || 0;
      const current = trackingCountMap[key] || 0;

      // Check if already full
      if (expected > 0 && current >= expected) {
        currentSkipped.push({
          qrCode: parsed.qrCode,
          so: parsed.so,
          rpro: parsed.rpro,
          reason: `CHẶN: Đã đủ số lượng (${expected}/${expected})`
        });
        continue;
      }

      // Fetch KH if not in expectedMap (though it should be if found in source)
      let kh = '';
      const sourceMatch = sourceData?.find(s => s.so === parsed.so && s.rpro === parsed.rpro);
      if (sourceMatch) kh = sourceMatch.kh || '';

      const newItem = {
        ...parsed,
        kh,
        totalBoxes: expected || parsed.totalBoxes,
        boxType: selectedBoxType,
        locationPath: currentLocation,
      };

      newItems.push(newItem);
      existingQRs.add(parsed.qrCode);
      trackingCountMap[key] = (trackingCountMap[key] || 0) + 1;
    }

    if (newItems.length > 0) {
      setScannedItems(prev => [...newItems, ...prev]);
    }

    if (currentSkipped.length > 0) {
      setSkippedItems(currentSkipped);
      setShowWarning(true);
    }

    setManualQR('');
    setLoading(false);
    setIsLoading(false);
  };

  const handleConfirmInbound = async () => {
    if (scannedItems.length === 0) return;
    
    // Check if all items have a location
    const missingLocation = scannedItems.some(item => !item.locationPath?.trim());
    if (missingLocation) {
      setMessage({ type: 'error', text: 'Vui lòng nhập vị trí lưu kho cho tất cả kiện hàng.' });
      return;
    }

    setLoading(true);
    setIsLoading(true);
    setMessage(null);
    
    try {
      // Use items as they are in the list (copy-paste to DB)
      const itemsToProcess = scannedItems;

      // Call Batch RPC (This handles all 3 steps: Inbound, Balance, Movement)
      const chunkSize = 1000;
      for (let i = 0; i < itemsToProcess.length; i += chunkSize) {
        const chunk = itemsToProcess.slice(i, i + chunkSize);
        const { error: batchError } = await supabase.rpc('process_inbound_v5', {
          p_data: {
            device_info: navigator.userAgent,
            items: chunk
          }
        });

        if (batchError) {
          console.error('Batch process error at chunk:', i, batchError);
          throw new Error(`Lỗi xử lý hàng loạt: ${batchError.message}`);
        }
      }

      setMessage({ type: 'success', text: `Đã nhập kho thành công ${scannedItems.length} kiện hàng.` });
      setScannedItems([]);
      setSelectedScanned(new Set());
      clearAppCache();
      
      if (activeTab === 'history') {
        fetchHistory();
      }
    } catch (error: any) {
      console.error('Inbound process error:', error);
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: errorMsg || 'Có lỗi xảy ra khi nhập kho.' });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const toggleSelectScanned = (qrCode: string) => {
    const newSelected = new Set(selectedScanned);
    if (newSelected.has(qrCode)) {
      newSelected.delete(qrCode);
    } else {
      newSelected.add(qrCode);
    }
    setSelectedScanned(newSelected);
  };

  const toggleSelectAllScanned = () => {
    if (selectedScanned.size === scannedItems.length) {
      setSelectedScanned(new Set());
    } else {
      setSelectedScanned(new Set(scannedItems.map(item => item.qrCode)));
    }
  };

  const deleteSelectedScanned = () => {
    setScannedItems(prev => prev.filter(item => !selectedScanned.has(item.qrCode)));
    setSelectedScanned(new Set());
  };

  const toggleSelectHistory = (id: string) => {
    const newSelected = new Set(selectedHistory);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedHistory(newSelected);
  };

  const toggleSelectAllHistory = () => {
    if (selectedHistory.size === historyData.length) {
      setSelectedHistory(new Set());
    } else {
      setSelectedHistory(new Set(historyData.map(item => item.id)));
    }
  };

  const deleteHistoryItem = async (id: string) => {
    const { error } = await supabase.from('inbound_transactions').delete().eq('id', id);
    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + errorMsg });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa bản ghi thành công.' });
      fetchHistory();
    }
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistory.size === 0) return;
    
    const { error } = await supabase
      .from('inbound_transactions')
      .delete()
      .in('id', Array.from(selectedHistory));

    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + errorMsg });
    } else {
      setMessage({ type: 'success', text: `Đã xóa ${selectedHistory.size} bản ghi thành công.` });
      setSelectedHistory(new Set());
      fetchHistory();
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Modal for Skipped Items */}
      <AnimatePresence>
        {showWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200"
            >
              <div className="bg-rose-600 p-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <AlertCircle className="w-8 h-8" />
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Cảnh báo nhập thừa</h3>
                    <p className="text-rose-100 text-xs font-bold">Phát hiện {skippedItems.length} kiện hàng đã đủ số lượng trong kho</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowWarning(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-3">
                  {skippedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <div className="space-y-1">
                        <div className="text-xs font-black text-rose-900 uppercase tracking-wider">{item.qrCode}</div>
                        <div className="flex gap-3 text-[10px] font-bold text-rose-600">
                          <span>SO: {item.so}</span>
                          <span>RPRO: {item.rpro}</span>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-rose-600 text-white text-[10px] font-black rounded-full uppercase">
                        {item.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowWarning(false)}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg"
                >
                  ĐÃ HIỂU VÀ ĐÓNG
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex p-1 bg-slate-100 rounded-2xl w-fit border border-slate-200">
          <button 
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'scan' 
                ? 'bg-white text-blue-600 shadow-sm border border-blue-100' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Scan className="w-4 h-4" />
            Nhập kho hàng hóa
          </button>
          {(isAdmin || isViewer) && (
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'history' 
                  ? 'bg-white text-blue-600 shadow-sm border border-blue-100' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <HistoryIcon className="w-4 h-4" />
              DATA NHẬP KHO
            </button>
          )}
        </div>
        {activeTab === 'scan' && (
          <div className="flex flex-wrap gap-2">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <button
                onClick={() => setSelectedBoxType('Nhựa')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  selectedBoxType === 'Nhựa' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                THÙNG NHỰA
              </button>
              <button
                onClick={() => setSelectedBoxType('Giấy')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  selectedBoxType === 'Giấy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                THÙNG GIẤY
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'scan' ? (
        <>
          <AnimatePresence>
            {isScanning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-slate-900 p-4 rounded-2xl mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-bold uppercase tracking-wider">
                      Đang ở chế độ: Scan
                    </span>
                    <span className="text-emerald-400 text-sm font-bold">
                      Loại thùng: {selectedBoxType}
                    </span>
                  </div>
                  <QRScanner onScan={handleScan} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Manual Input & Settings */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg">
                <div className="flex items-center gap-2 mb-6 bg-blue-600 p-3 rounded-xl shadow-md">
                  <Settings className="w-5 h-5 text-white" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Cấu hình quét</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dán mã QR (Thủ công)</label>
                    <textarea
                      value={manualQR}
                      onChange={(e) => setManualQR(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-24"
                      placeholder="Dán dữ liệu QR tại đây... (Mỗi dòng 1 mã)"
                    />
                    <button
                      onClick={handleProcessManual}
                      className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md"
                    >
                      Xử lý mã
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nhập từ Excel</label>
                    <label className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
                      <Upload className="w-4 h-4 text-blue-600" />
                      CHỌN FILE EXCEL
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleImportExcel}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vị trí lưu kho</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        placeholder="Nhập hoặc scan vị trí..."
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <div className="absolute right-3 top-2.5">
                        <MapPin className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400 italic">Gợi ý: Bạn có thể scan mã vị trí trực tiếp vào ô này.</p>
                  </div>
                </div>
              </div>

              {scannedItems.length > 0 && (
                <button
                  onClick={handleConfirmInbound}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-6 h-6" />
                      LƯU VÀO KHO {scannedSearch || scannedStatusFilter !== 'all' ? `(${filteredScanned.length}/${scannedItems.length})` : `(${scannedItems.length})`}
                    </>
                  )}
                </button>
              )}

              {message && (
                <div className={`p-4 rounded-xl flex items-center gap-3 ${
                  message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}>
                  {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <p className="text-sm font-medium">{message.text}</p>
                </div>
              )}
            </div>

            {/* Scanned List */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-emerald-100 flex items-center justify-between bg-emerald-600 shadow-md">
                  <h2 className="text-lg font-bold text-white uppercase tracking-tight">
                    Danh sách chờ nhập {scannedSearch || scannedStatusFilter !== 'all' ? `(${filteredScanned.length}/${scannedItems.length})` : `(${scannedItems.length})`}
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                      <input
                        type="text"
                        placeholder="Tìm kiếm SO, RPRO, Khách hàng..."
                        value={scannedSearch}
                        onChange={(e) => setScannedSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder:text-white/50 focus:bg-white/20 outline-none w-32 md:w-48 transition-all"
                      />
                    </div>
                    <select
                      value={scannedStatusFilter}
                      onChange={(e: any) => setScannedStatusFilter(e.target.value)}
                      className="px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:bg-white/20 outline-none cursor-pointer appearance-none min-w-[80px]"
                    >
                      <option value="all" className="text-slate-900">TẤT CẢ STATUS</option>
                      <option value="ok" className="text-emerald-600 font-bold">OK</option>
                      <option value="wrong" className="text-rose-600 font-bold">WRONG</option>
                    </select>
                    {isAdmin && selectedScanned.size > 0 && (
                      <button
                        onClick={deleteSelectedScanned}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white rounded-lg text-xs font-black hover:bg-white/30 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        XÓA ĐÃ CHỌN ({selectedScanned.size})
                      </button>
                    )}
                    {scannedItems.length > 0 && (
                      <button
                        onClick={handleConfirmInbound}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-600 rounded-xl text-sm font-black hover:bg-emerald-50 transition-all disabled:opacity-50 shadow-md"
                      >
                        <Save className="w-4 h-4" />
                        LƯU VÀO KHO
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={() => setScannedItems([])}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                        title="Xóa tất cả"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  {scannedItems.length === 0 ? (
                    <div className="p-12 text-center">
                      <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400">Chưa có kiện hàng nào được scan</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-[#002060] text-white">
                          <th className="px-2 py-3 border border-slate-300 text-center">
                            {isAdmin && (
                              <input 
                                type="checkbox" 
                                checked={selectedScanned.size === scannedItems.length && scannedItems.length > 0}
                                onChange={toggleSelectAllScanned}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                          </th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">TÌNH TRẠNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ THÙNG ĐƠN HÀNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
                          <th className="px-2 py-3 border border-slate-300"></th>
                        </tr>
                      </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredScanned.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-12 text-center">
                            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-400 italic text-sm">Không tìm thấy dữ liệu phù hợp</p>
                          </td>
                        </tr>
                      ) : (
                        filteredScanned.map((item, index) => (
                          <tr 
                            key={item.qrCode}
                            className={`hover:bg-slate-50 transition-colors ${selectedScanned.has(item.qrCode) ? 'bg-blue-50' : ''}`}
                          >
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              {isAdmin && (
                                <input 
                                  type="checkbox" 
                                  checked={selectedScanned.has(item.qrCode)}
                                  onChange={() => toggleSelectScanned(item.qrCode)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm border border-slate-200 font-medium text-slate-700">{item.qrCode}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.so}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.rpro}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center font-medium text-slate-600">
                              {orderStatusMap[`${item.so}|${item.rpro}`] || 'Đang kiểm tra...'}
                            </td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.boxType}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center font-bold">
                              {item.totalBoxes > 0 ? `1 / ${item.totalBoxes}` : '1'}
                            </td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.locationPath}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{new Date(item.date).toLocaleString('vi-VN')}</td>
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              {isAdmin && (
                                <button 
                                  onClick={() => setScannedItems(prev => prev.filter(i => i.qrCode !== item.qrCode))}
                                  className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                      {filteredScanned.length > 100 && (
                        <tr>
                          <td colSpan={10} className="px-4 py-6 text-center text-slate-400 italic bg-slate-50">
                            Đang hiển thị 100/{filteredScanned.length} kiện hàng.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100 bg-blue-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
              <h2 className="text-lg font-bold text-blue-900">Lịch sử nhập kho ({historyTotal.toLocaleString()} bản ghi)</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex items-center gap-2 bg-white border-2 border-blue-100 rounded-lg px-3 py-1 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Từ</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs font-bold text-blue-900 outline-none"
                  />
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Đến</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs font-bold text-blue-900 outline-none"
                  />
                  {(startDate || endDate) && (
                    <button 
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                      className="ml-2 p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                      title="Xóa lọc ngày"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 bg-white border-2 border-blue-100 text-blue-900 rounded-lg text-xs font-bold focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                >
                  <option value="all">Tất cả tình trạng</option>
                  <option value="complete">Đủ đơn</option>
                  <option value="incomplete">Thiếu thùng</option>
                </select>
                <div className="relative flex-1 sm:min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm SO, RPRO, Khách hàng..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border-2 border-blue-100 text-blue-900 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 mr-2">
                <button
                  onClick={() => {
                    const newPage = Math.max(1, historyPage - 1);
                    if (newPage !== historyPage) {
                      setHistoryPage(newPage);
                      fetchHistory(false, newPage);
                    }
                  }}
                  disabled={historyPage === 1 || historyLoading}
                  className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-xs font-bold px-2 text-blue-900">Trang {historyPage}</span>
                <button
                  onClick={() => {
                    if (hasMore) {
                      const newPage = historyPage + 1;
                      setHistoryPage(newPage);
                      fetchHistory(false, newPage);
                    }
                  }}
                  disabled={!hasMore || historyLoading}
                  className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => exportAllHistory('xlsx')}
                  className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  Excel
                </button>
                <button 
                  onClick={() => exportAllHistory('csv')}
                  className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  CSV
                </button>
                <button 
                  onClick={() => fetchHistory(true)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                >
                  <CheckCircle2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar border-b border-slate-200">
            {historyLoading && historyData.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Đang tải dữ liệu...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">Chưa có dữ liệu nhập kho</p>
              </div>
            ) : (
              <table className="w-full text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr className="bg-[#002060] text-white">
                    <th className="px-2 py-3 border-b border-r border-slate-300 text-center">
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={selectedHistory.size === filteredHistory.length && filteredHistory.length > 0}
                          onChange={toggleSelectAllHistory}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">SO</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">RPRO</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap sm:table-cell hidden">KHÁCH HÀNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">TÌNH TRẠNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">SỐ THÙNG ĐƠN HÀNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b border-r border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
                    <th className="px-2 py-3 border-b border-slate-300"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white" style={{ contentVisibility: 'auto' }}>
                  {filteredHistory.map((item) => (
                    <HistoryRow 
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      isSelected={selectedHistory.has(item.id)}
                      status={orderStatusMap[`${item.so?.trim() || ''}|${item.rpro?.trim() || ''}`]}
                      onToggleSelect={toggleSelectHistory}
                      onDelete={deleteHistoryItem}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100 max-h-[500px] overflow-y-auto custom-scrollbar">
            {historyLoading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Đang tải dữ liệu...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">Chưa có dữ liệu nhập kho</p>
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div key={item.id} className={`p-4 space-y-3 ${selectedHistory.has(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={selectedHistory.has(item.id)}
                          onChange={() => toggleSelectHistory(item.id)}
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.so}</div>
                        <div className="text-xs font-bold text-blue-600">{item.rpro}</div>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => deleteHistoryItem(item.id)}
                        className="p-2 text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Tình trạng</div>
                      <div className="mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          orderStatusMap[`${item.so}|${item.rpro}`] === 'Đủ đơn' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {orderStatusMap[`${item.so}|${item.rpro}`] || 'Đang kiểm tra...'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Loại thùng</div>
                      <div className="text-xs font-bold text-slate-700">{item.box_type}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Số lượng</div>
                      <div className="text-xs font-black text-blue-700">
                        {item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Vị trí</div>
                      <div className="flex items-center gap-1 text-xs font-black text-emerald-600">
                        <MapPin className="w-3 h-3" />
                        {item.location_path || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold italic">
                    <span>Mã: {item.qr_code}</span>
                    <span>{new Date(item.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {filteredHistory.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t-2 border-slate-200 sticky bottom-0 z-30">
              <div className="text-xs font-black text-slate-500 uppercase tracking-wider">
                Hiển thị {filteredHistory.length.toLocaleString()} / {historyTotal.toLocaleString()} bản ghi
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, historyPage - 1);
                      if (newPage !== historyPage) {
                        setHistoryPage(newPage);
                        fetchHistory(false, newPage);
                      }
                    }}
                    disabled={historyPage === 1 || historyLoading}
                    className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-all rounded-lg"
                    title="Trang trước"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  <div className="px-4 text-xs font-black text-blue-900 border-x border-slate-100 flex items-center gap-2">
                    <span>TRANG</span>
                    <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm">{historyPage}</span>
                  </div>

                  <button
                    onClick={() => {
                      if (hasMore) {
                        const newPage = historyPage + 1;
                        setHistoryPage(newPage);
                        fetchHistory(false, newPage);
                      }
                    }}
                    disabled={!hasMore || historyLoading}
                    className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-all rounded-lg"
                    title="Trang sau"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={() => exportAllHistory('xlsx')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-emerald-700 transition-all uppercase whitespace-nowrap flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  XUẤT EXCEL TẤT CẢ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
