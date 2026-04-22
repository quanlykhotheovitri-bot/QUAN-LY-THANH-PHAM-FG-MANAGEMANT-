import { useState, useEffect, useMemo, ChangeEvent } from 'react';
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
  Search,
  AlertTriangle,
  FileText,
  History as HistoryIcon,
  Upload,
  Download,
  Filter,
  ArrowUpDown,
  Copy,
  Printer,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation, InventoryBalance } from '../types';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

export default function Outbound() {
  const { user: authUser } = useAuth();
  const { setIsLoading } = useLoading();
  const isAdmin = authUser?.role === 'admin';
  const isViewer = authUser?.role === 'viewer';

  const cleanId = (id: string | null | undefined) => {
    if (!id) return '';
    return id.toString().replace(/\s/g, '').toUpperCase();
  };

  const [activeTab, setActiveTab] = useState<'scan' | 'pl' | 'data'>('scan');
  const [scannedItems, setScannedItems] = useState<any[]>(() => {
    const saved = localStorage.getItem('outbound_scanned_items');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('outbound_scanned_items', JSON.stringify(scannedItems));
  }, [scannedItems]);
  const [selectedScanned, setSelectedScanned] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Scan configuration state
  const [manualQR, setManualQR] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [plNoInput, setPlNoInput] = useState('');

  // Data xuất state
  const [outboundData, setOutboundData] = useState<any[]>([]);
  const [selectedOutbound, setSelectedOutbound] = useState<Set<string>>(new Set());
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [outboundPage, setOutboundPage] = useState(1);
  const [outboundTotal, setOutboundTotal] = useState(0);
  const outboundPageSize = 50;
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // PL state
  const [plItems, setPlItems] = useState<any[]>([]);
  const [selectedPlItems, setSelectedPlItems] = useState<Set<string>>(new Set());
  const [plNumbers, setPlNumbers] = useState<string[]>([]);
  const [selectedPlNoFilter, setSelectedPlNoFilter] = useState<string>('ALL');
  const [sourceFiles, setSourceFiles] = useState<Array<{ name: string, status: 'pending' | 'success' | 'error', data: any[], error?: string }>>([]);
  const [inventoryBalances, setInventoryBalances] = useState<InventoryBalance[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editingType, setEditingType] = useState<'scan' | 'pl' | null>(null);
  const [dataSubTab, setDataSubTab] = useState<'scan' | 'pl'>('scan');

  // Search states
  const [scannedSearch, setScannedSearch] = useState('');
  const [scannedStatusFilter, setScannedStatusFilter] = useState<'ALL' | 'OK' | 'Wrong'>('ALL');
  const [plSearch, setPlSearch] = useState('');
  const [plStatusFilter, setPlStatusFilter] = useState<'ALL' | 'OK' | 'THIEU' | 'DU'>('ALL');
  const [outboundSearch, setOutboundSearch] = useState('');
  const [outboundStatusFilter, setOutboundStatusFilter] = useState<'ALL' | 'OK' | 'Wrong' | 'THIEU' | 'DU'>('ALL');

  useEffect(() => {
    setOutboundPage(1);
  }, [dataSubTab, activeTab]);

  useEffect(() => {
    fetchLocations();
    fetchInventoryBalances();
    fetchCurrentPLItems();
    fetchCurrentScannedItems();
    fetchOutboundData();
  }, [activeTab, outboundPage, dataSubTab, outboundSearch, startDate, endDate]);

  const enrichedScannedItems = useMemo(() => {
    return scannedItems.map(item => {
      const cleanedSo = cleanId(item.so);
      const cleanedRpro = cleanId(item.rpro);
      const cleanedPlNo = cleanId(item.plNo);

      // 1. Match with PL automatically - USE COMBINED KEY (PL + SO/RPRO)
      let plMatch = null;
      if (plItems.length > 0) {
        plMatch = plItems.find(p => {
          const pPlNo = cleanId(p.plNo);
          // Only match if PL No matches or if we are in "global" mode (but ideally strict)
          const plMatches = !cleanedPlNo || !pPlNo || cleanedPlNo === pPlNo;
          if (!plMatches) return false;

          return (cleanedRpro && p.rpro ? cleanId(p.rpro) === cleanedRpro : cleanId(p.so) === cleanedSo);
        });
      }

      // 2. Find in Inventory
      const inventory = inventoryBalances.find(inv => inv.qr_code === item.qrCode);

      let status = plMatch ? 'OK' : 'Wrong';
      let note = plMatch ? '' : 'Không khớp danh sách PL';

      if (!inventory) {
        note = note ? note + ' & Không có trong tồn kho' : 'Không có trong tồn kho';
      } else if (item.outQty > inventory.quantity) {
        note = note ? note + ' & Xuất vượt tồn' : 'Xuất vượt tồn';
      }

      return {
        ...item,
        status,
        note,
        kh: plMatch ? plMatch.kh : item.kh,
        totalBoxes: plMatch ? plMatch.totalBoxes : item.totalBoxes,
        plNo: plMatch ? plMatch.plNo : item.plNo,
        inventory_id: inventory?.id || item.inventory_id,
        locationPath: inventory?.location_path || item.locationPath
      };
    });
  }, [scannedItems, plItems, inventoryBalances]);

  const filteredScannedItems = useMemo(() => {
    let result = enrichedScannedItems;
    
    // Search filter
    if (scannedSearch.trim()) {
      const searchLower = scannedSearch.toLowerCase().trim();
      result = result.filter(item => 
        (item.so?.toLowerCase().includes(searchLower)) || 
        (item.rpro?.toLowerCase().includes(searchLower)) ||
        (item.kh?.toLowerCase().includes(searchLower)) ||
        (item.plNo?.toLowerCase().includes(searchLower))
      );
    }
    
    // Status filter
    if (scannedStatusFilter !== 'ALL') {
      result = result.filter(item => item.status === scannedStatusFilter);
    }
    
    return result;
  }, [enrichedScannedItems, scannedSearch, scannedStatusFilter]);

  const plItemStats = useMemo(() => {
    const rproCounts = new Map<string, number>();
    const soCounts = new Map<string, number>();
    
    scannedItems.forEach(s => {
      const cleanedRpro = cleanId(s.rpro);
      const cleanedSo = cleanId(s.so);
      const cleanedPlNo = cleanId(s.plNo);
      
      // Virtual key for RPRO and SO within a PL
      const rproKey = `${cleanedPlNo}|${cleanedRpro}`;
      const soKey = `${cleanedPlNo}|${cleanedSo}`;
      
      if (cleanedRpro) {
        rproCounts.set(rproKey, (rproCounts.get(rproKey) || 0) + 1);
      }
      if (cleanedSo) {
        soCounts.set(soKey, (soCounts.get(soKey) || 0) + 1);
      }
    });

    const rproInv = new Map<string, InventoryBalance>();
    const soInv = new Map<string, InventoryBalance>();
    const compositeInv = new Map<string, InventoryBalance>();
    
    inventoryBalances.forEach(inv => {
      if (inv.quantity <= 0) return;
      
      const cleanedRpro = cleanId(inv.rpro);
      const cleanedSo = cleanId(inv.so);
      const loc = inv.location_path?.trim() || 'N/A';
      
      if (cleanedRpro) {
        if (!rproInv.has(cleanedRpro)) {
          rproInv.set(cleanedRpro, { ...inv, locations: new Set([loc]) });
        } else {
          rproInv.get(cleanedRpro)!.locations!.add(loc);
        }
      }
      
      if (cleanedSo) {
        if (!soInv.has(cleanedSo)) {
          soInv.set(cleanedSo, { ...inv, locations: new Set([loc]) });
        } else {
          soInv.get(cleanedSo)!.locations!.add(loc);
        }
      }

      if (cleanedSo && cleanedRpro) {
        const key = `${cleanedSo}|${cleanedRpro}`;
        if (!compositeInv.has(key)) {
          compositeInv.set(key, { ...inv, locations: new Set([loc]) });
        } else {
          compositeInv.get(key)!.locations!.add(loc);
        }
      }
    });

    return { rproCounts, soCounts, rproInv, soInv, compositeInv };
  }, [scannedItems, inventoryBalances]);

  const filteredPlItems = useMemo(() => {
    let result = plItems;
    
    // PL No filter
    if (selectedPlNoFilter !== 'ALL') {
      result = result.filter(item => cleanId(item.plNo) === cleanId(selectedPlNoFilter));
    }

    // Search filter
    if (plSearch.trim()) {
      const searchLower = plSearch.toLowerCase().trim();
      result = result.filter(item => 
        (item.so?.toLowerCase().includes(searchLower)) || 
        (item.rpro?.toLowerCase().includes(searchLower)) ||
        (item.kh?.toLowerCase().includes(searchLower)) ||
        (item.plNo?.toLowerCase().includes(searchLower))
      );
    }

    if (plStatusFilter !== 'ALL') {
      result = result.filter(item => {
        const cleanedSo = cleanId(item.so);
        const cleanedRpro = cleanId(item.rpro);
        const cleanedPlNo = cleanId(item.plNo);
        
        const rproKey = `${cleanedPlNo}|${cleanedRpro}`;
        const soKey = `${cleanedPlNo}|${cleanedSo}`;

        const scanCount = cleanedRpro ? (plItemStats.rproCounts.get(rproKey) || 0) : (plItemStats.soCounts.get(soKey) || 0);
        const diff = item.totalBoxes - scanCount;
        
        if (plStatusFilter === 'OK') return diff === 0;
        if (plStatusFilter === 'THIEU') return diff > 0;
        if (plStatusFilter === 'DU') return diff < 0;
        return true;
      });
    }
    
    return result;
  }, [plItems, plSearch, plStatusFilter, plItemStats, selectedPlNoFilter]);

  const plTableTotals = useMemo(() => {
    return filteredPlItems.reduce((acc, item) => {
      const cleanedSo = cleanId(item.so);
      const cleanedRpro = cleanId(item.rpro);
      const cleanedPlNo = cleanId(item.plNo);
      const rproKey = `${cleanedPlNo}|${cleanedRpro}`;
      const soKey = `${cleanedPlNo}|${cleanedSo}`;
      const scanCount = cleanedRpro ? (plItemStats.rproCounts.get(rproKey) || 0) : (plItemStats.soCounts.get(soKey) || 0);
      
      return {
        totalBoxes: acc.totalBoxes + (Number(item.totalBoxes) || 0),
        scanCount: acc.scanCount + scanCount
      };
    }, { totalBoxes: 0, scanCount: 0 });
  }, [filteredPlItems, plItemStats]);

  const scanTableTotals = useMemo(() => {
    return filteredScannedItems.reduce((acc, item) => {
      return {
        totalBoxes: acc.totalBoxes + (Number(item.totalBoxes) || 0)
      };
    }, { totalBoxes: 0 });
  }, [filteredScannedItems]);

  const filteredOutbound = useMemo(() => {
    let result = outboundData;
    
    // Status Filter for History
    if (outboundStatusFilter !== 'ALL') {
      result = result.filter(item => {
        const itemStatus = item.status?.toUpperCase();
        if (outboundStatusFilter === 'OK') return itemStatus === 'OK' || itemStatus === 'ĐỦ';
        if (outboundStatusFilter === 'Wrong') return itemStatus === 'WRONG' || itemStatus === 'SAI';
        if (outboundStatusFilter === 'THIEU') return itemStatus?.includes('THIẾU');
        if (outboundStatusFilter === 'DU') return itemStatus?.includes('DƯ');
        return true;
      });
    }

    return result;
  }, [outboundData, outboundStatusFilter]);

  async function fetchCurrentScannedItems() {
    try {
      let allData: any[] = [];
      let hasMore = true;
      let offset = 0;
      const limit = 1000;

      while (hasMore) {
        const { data, error } = await supabase
          .from('current_scanned_items')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < limit) hasMore = false;
          else offset += limit;
        } else {
          hasMore = false;
        }
      }

      const items = allData.map(item => ({
        id: item.id,
        qrCode: item.qr_code?.trim() || '',
        so: item.so?.trim() || '',
        rpro: item.rpro?.trim() || '',
        kh: item.kh?.trim() || '',
        totalBoxes: item.total_boxes,
        status: item.status,
        note: item.note,
        outQty: item.out_qty,
        plNo: item.pl_no?.trim() || '',
        locationPath: item.location_path?.trim() || '',
        isSaved: item.is_saved,
        date: item.scan_date,
        inventory_id: item.inventory_id,
        inventory: item.inventory_id ? { id: item.inventory_id, location_path: item.location_path } : null 
      }));
      setScannedItems(items);
      setHasUnsavedChanges(items.some(item => !item.isSaved));
    } catch (error: any) {
      console.error('Error fetching scanned items:', error);
    }
  }

  async function fetchCurrentPLItems() {
    try {
      let allData: any[] = [];
      let hasMore = true;
      let offset = 0;
      const limit = 1000;

      while (hasMore) {
        const { data, error } = await supabase
          .from('current_pl_items')
          .select('*')
          .order('pl_no', { ascending: false })
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < limit) hasMore = false;
          else offset += limit;
        } else {
          hasMore = false;
        }
      }

      setPlItems(allData.map(item => ({
        id: item.id,
        plNo: item.pl_no?.trim() || '',
        so: item.so?.trim() || '',
        rpro: item.rpro?.trim() || '',
        kh: item.kh?.trim() || '',
        qty: item.qty,
        totalBoxes: item.total_boxes
      })));
      
      const uniquePLs = Array.from(new Set(allData.map(item => item.pl_no?.trim()).filter(pl => pl)));
      setPlNumbers(uniquePLs);
      if (plNoInput === '' && uniquePLs.length > 0) setPlNoInput(uniquePLs[0]);
    } catch (error: any) {
      console.error('Error fetching PL items:', error);
    }
  }

  const exportOutboundData = async (format: 'xlsx' | 'csv') => {
    setLoading(true);
    setIsLoading(true);
    try {
      let query = supabase
        .from('outbound_transactions')
        .select('*')
        .eq('type', dataSubTab === 'scan' ? 'SCAN' : 'PL');

      if (outboundSearch.trim()) {
        query = query.or(`so.ilike.%${outboundSearch.trim()}%,rpro.ilike.%${outboundSearch.trim()}%,kh.ilike.%${outboundSearch.trim()}%,pl_no.ilike.%${outboundSearch.trim()}%`);
      }

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      const { data: allData, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      if (!allData || allData.length === 0) {
        setMessage({ type: 'error', text: 'Không có dữ liệu để xuất kho.' });
        return;
      }

      // Filter by status on the client side since status is complex
      let finalData = allData;
      if (outboundStatusFilter !== 'ALL') {
        finalData = allData.filter(item => {
          const itemStatus = item.status?.toUpperCase();
          if (outboundStatusFilter === 'OK') return itemStatus === 'OK' || itemStatus === 'ĐỦ';
          if (outboundStatusFilter === 'Wrong') return itemStatus === 'WRONG' || itemStatus === 'SAI';
          if (outboundStatusFilter === 'THIEU') return itemStatus?.includes('THIẾU');
          if (outboundStatusFilter === 'DU') return itemStatus?.includes('DƯ');
          return true;
        });
      }

      const exportRows = finalData.map(item => {
        if (dataSubTab === 'scan') {
          return {
            'QRCODE': item.qr_code,
            'DATE': formatDate(item.created_at),
            'OVN Order No': item.so,
            'RPRO': item.rpro,
            'KHÁCH HÀNG': item.kh,
            'PL No': item.pl_no,
            'Total Box': item.quantity,
            'STATUS': item.status
          };
        } else {
          return {
            'DATE': formatDate(item.created_at),
            'OVN Order No': item.so,
            'RPRO': item.rpro,
            'KHÁCH HÀNG': item.kh,
            'PL No': item.pl_no,
            'Total Box': item.quantity,
            'Scan Xuất': item.scan_count,
            'Status': item.status,
            'Location': item.location_path
          };
        }
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, dataSubTab === 'scan' ? 'ScanData' : 'PLData');
      XLSX.writeFile(wb, `Outbound_${dataSubTab}_${new Date().toISOString().split('T')[0]}.${format}`);
      setMessage({ type: 'success', text: `Đã xuất ${exportRows.length} dòng dữ liệu.` });
    } catch (err: any) {
      console.error('Export error:', err);
      setMessage({ type: 'error', text: 'Lỗi khi xuất dữ liệu: ' + err.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const exportCurrentPL = (format: 'xlsx' | 'csv') => {
    const data = plItems.map(item => ({
      'OVN Order No': item.so,
      'RPRO': item.rpro,
      'KHÁCH HÀNG': item.kh,
      'PL No': item.plNo,
      'Total Box': item.totalBoxes,
      'Scan Xuất': item.rpro ? (plItemStats.rproCounts.get(item.rpro) || 0) : (plItemStats.soCounts.get(item.so) || 0),
      'Status': (item.rpro ? (plItemStats.rproCounts.get(item.rpro) || 0) : (plItemStats.soCounts.get(item.so) || 0)) >= (item.totalBoxes || 0) ? 'ĐỦ' : 'THIẾU'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CurrentPL');
    XLSX.writeFile(wb, `CurrentPL_${new Date().toISOString().split('T')[0]}.${format}`);
  };

  async function fetchInventoryBalances() {
    try {
      let allData: any[] = [];
      let hasMore = true;
      let offset = 0;
      const limit = 1000;

      while (hasMore) {
        const { data, error } = await supabase
          .from('inventory_balances')
          .select('*')
          .gt('quantity', 0)
          .order('last_updated', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < limit) hasMore = false;
          else offset += limit;
        } else {
          hasMore = false;
        }
      }

      const trimmedData = allData.map(inv => ({
        ...inv,
        so: inv.so?.trim() || '',
        rpro: inv.rpro?.trim() || '',
      }));
      setInventoryBalances(trimmedData);
    } catch (error: any) {
      console.error('Error fetching inventory balances:', error);
    }
  }

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*');
    if (data) setLocations(data);
  }

  const handleProcessManual = async () => {
    if (!manualQR.trim()) return;
    setLoading(true);
    setIsLoading(true);
    try {
      const lines = manualQR.split('\n').filter(line => line.trim() !== '');
      const parsedItems = lines.map(line => parseQRCode(line.trim()));
      
      const qrCodes = parsedItems.map(p => p.qrCode);

      // 1. Chunked QR lookup
      const inventories: any[] = [];
      const qrChunkSize = 500;
      for (let i = 0; i < qrCodes.length; i += qrChunkSize) {
        const chunk = qrCodes.slice(i, i + qrChunkSize);
        const { data } = await supabase.from('inventory_balances').select('*').in('qr_code', chunk);
        if (data) inventories.push(...data);
      }
      
      const sos = parsedItems.map(p => p.so).filter(Boolean);
      const rpros = parsedItems.map(p => p.rpro).filter(Boolean);
      
      const sourceMatches: any[] = [];
      const filterChunkSize = 200; // Even smaller for complex or filters
      
      // 2. Chunked SO lookup
      for (let i = 0; i < sos.length; i += filterChunkSize) {
        const chunk = sos.slice(i, i + filterChunkSize);
        const { data } = await supabase.from('source_import_lines').select('*').in('so', chunk);
        if (data) sourceMatches.push(...data);
      }
      
      // 3. Chunked RPRO lookup
      for (let i = 0; i < rpros.length; i += filterChunkSize) {
        const chunk = rpros.slice(i, i + filterChunkSize);
        const { data } = await supabase.from('source_import_lines').select('*').in('rpro', chunk);
        if (data) sourceMatches.push(...data);
      }

      const itemsToInsert = parsedItems.map(parsed => {
        const inventory = inventories?.find(i => i.qr_code === parsed.qrCode);
        const sourceMatch = sourceMatches.find(s => 
          (parsed.rpro && s.rpro === parsed.rpro) || (parsed.so && s.so === parsed.so)
        );
        const plMatch = plItems.find(item => 
          (parsed.rpro && item.rpro ? item.rpro === parsed.rpro : item.so === parsed.so)
        );

        let status = plMatch ? 'OK' : 'Wrong';
        let note = plMatch ? '' : 'Không khớp danh sách PL';
        if (!inventory) note = note ? note + ' & Không có trong tồn kho' : 'Không có trong tồn kho';
        else if (parsed.quantity > inventory.quantity) note = note ? note + ' & Xuất vượt tồn' : 'Xuất vượt tồn';

        return {
          qr_code: parsed.qrCode,
          so: parsed.so,
          rpro: parsed.rpro,
          kh: plMatch ? plMatch.kh : (sourceMatch ? sourceMatch.kh : 'N/A'),
          pl_no: plMatch ? plMatch.plNo : 'N/A',
          out_qty: parsed.quantity,
          total_boxes: plMatch ? plMatch.totalBoxes : (sourceMatch ? sourceMatch.totalBoxes : 0),
          location_path: inventory?.location_path || 'N/A',
          status,
          note,
          inventory_id: inventory?.id || null,
          is_saved: false,
          scan_date: new Date().toISOString()
        };
      });

      const { data: insertData, error } = await supabase
        .from('current_scanned_items')
        .insert(itemsToInsert)
        .select();

      if (error) throw error;

      if (insertData) {
        const newItemsForState = insertData.map(dbItem => ({
          id: dbItem.id,
          qrCode: dbItem.qr_code,
          so: dbItem.so,
          rpro: dbItem.rpro,
          kh: dbItem.kh,
          totalBoxes: dbItem.total_boxes,
          status: dbItem.status,
          note: dbItem.note,
          outQty: dbItem.out_qty,
          plNo: dbItem.pl_no,
          locationPath: dbItem.location_path,
          isSaved: dbItem.is_saved,
          date: dbItem.scan_date,
          inventory_id: dbItem.inventory_id,
          inventory: dbItem.inventory_id ? { id: dbItem.inventory_id, location_path: dbItem.location_path } : null
        }));
        setScannedItems(prev => [...newItemsForState, ...prev]);
        setHasUnsavedChanges(true);
      }

      setMessage({ type: 'success', text: `Đã xử lý và thêm ${itemsToInsert.length} kiện hàng vào danh sách chờ xuất.` });
      setManualQR('');
    } catch (error: any) {
      console.error('Manual process error:', error);
      setMessage({ type: 'error', text: 'Lỗi xử lý mã: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleSaveScannedToHistory = async () => {
    const unsavedItems = enrichedScannedItems.filter(item => !item.isSaved);
    if (unsavedItems.length === 0) return;
    
    setLoading(true);
    setIsLoading(true);
    try {
      // Chunking for large datasets to avoid Supabase batch size limits
      const chunkSize = 200;
      const itemsToInsert = unsavedItems.map(item => ({
        type: 'SCAN',
        qr_code: item.qrCode,
        so: item.so,
        rpro: item.rpro,
        kh: item.kh,
        pl_no: item.plNo,
        quantity: item.outQty,
        location_path: item.locationPath,
        status: item.status === 'OK' ? 'completed' : 'warning',
        note: item.note,
        device_info: navigator.userAgent
      }));

      for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
        const chunk = itemsToInsert.slice(i, i + chunkSize);
        const { error: txError } = await supabase.from('outbound_transactions').insert(chunk);
        if (txError) throw txError;
      }

      // Update is_saved in current_scanned_items (batch update is usually safer than massive in() for thousands)
      const idsToUpdate = unsavedItems.map(item => item.id);
      for (let i = 0; i < idsToUpdate.length; i += chunkSize) {
        const chunkIds = idsToUpdate.slice(i, i + chunkSize);
        const { error: updateError } = await supabase
          .from('current_scanned_items')
          .update({ is_saved: true })
          .in('id', chunkIds);
        if (updateError) throw updateError;
      }

      setMessage({ type: 'success', text: `Đã lưu ${unsavedItems.length} mã vào Data xuất.` });
      await fetchCurrentScannedItems();
    } catch (error: any) {
      console.error('Save error:', error);
      setMessage({ type: 'error', text: 'Lỗi khi lưu dữ liệu: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      
      let finalMapped: any[] = [];
      let foundSheet = false;

      // 1. Sort sheets to prioritize those naturally named or containing "DELIVERY"
      const sortedSheetNames = [...wb.SheetNames].sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        if (aLower.includes('delivery') || aLower.includes('note')) return -1;
        if (bLower.includes('delivery') || bLower.includes('note')) return 1;
        return 0;
      });

      for (const wsname of sortedSheetNames) {
        // Skip hidden sheets - these are often where duplicate ERP data hides
        const wsIdx = wb.SheetNames.indexOf(wsname);
        const isHidden = wb.Workbook?.Sheets?.[wsIdx]?.Hidden !== 0 && wb.Workbook?.Sheets?.[wsIdx]?.Hidden !== undefined;
        if (isHidden) continue;

        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        if (rows.length < 5) continue;

        // Check if sheet content actually looks like a Delivery Note
        const sheetStr = rows.slice(0, 15).map(r => r.join(' ')).join(' ').toLowerCase();
        if (!sheetStr.includes('delivery note') && !sheetStr.includes('packing list') && wb.SheetNames.length > 1) {
          // If there are other sheets, skip this one if it doesn't look like a delivery note
          continue; 
        }

        // 1. Find Table Headers first (Try Row 7, 8, 9 - Indices 6, 7, 8)
        const headerIndices = [6, 7, 8]; 
        let tableHeaderRow = -1;
        let soIdx = -1;

        for (const idx of headerIndices) {
          const headers = rows[idx] || [];
          const foundIdx = headers.findIndex(h => 
            String(h || '').trim().toLowerCase().includes('ovn order no')
          );
          if (foundIdx !== -1) {
            tableHeaderRow = idx;
            soIdx = foundIdx;
            break;
          }
        }

        if (tableHeaderRow !== -1) {
          // 1. Find PL No by scanning top rows (indices 2 to 7)
          let plNo = '';
          for (let r = 2; r <= 7; r++) {
            const row = rows[r] || [];
            for (const cell of row) {
              const cellStr = String(cell || '').trim();
              if (cellStr.toUpperCase().includes('PL-')) {
                const match = cellStr.match(/PL-[\w-]+/i);
                if (match && !plNo) {
                  plNo = match[0];
                  break;
                }
              }
            }
            if (plNo) break;
          }

          // 2. Find Customer info by scanning top rows (indices 2 to 10)
          let customer = '';
          for (let r = 2; r <= 10; r++) {
            const row = rows[r] || [];
            const rowString = row.map(c => String(c || '').trim()).join(' ');
            if (rowString.toLowerCase().includes('customer:')) {
              const parts = rowString.split(/customer:/i);
              if (parts[1]) {
                // Split by labels that might be on the same row in Excel
                customer = parts[1]
                  .split(/erp/i)[0]
                  .split(/delivery/i)[0]
                  .split(/date/i)[0]
                  .split(/address/i)[0]
                  .split(/pl-/i)[0]
                  .split(/\d{2}-/)[0] // Split by delivery note numbers like 02-
                  .trim();
                if (customer.endsWith(',')) customer = customer.slice(0, -1).trim();
                // If there's an address label later in the rowString, cut it off
                if (customer.toLowerCase().includes('address:')) {
                  customer = customer.split(/address:/i)[0].trim();
                }
                if (customer) break;
              }
            }
          }

          const headers = rows[tableHeaderRow].map(h => String(h || '').trim().toLowerCase());
          
          // Strict header mapping as requested
          let soIdx = headers.findIndex(h => h === 'ovn order no' || h.includes('ovn order no'));
          const rproIdx = headers.indexOf('rpro');
          let boxIdx = headers.findIndex(h => h === 'total box' || h.includes('total box'));
          const qtyIdx = headers.indexOf('qty');

          if (soIdx === -1 || qtyIdx === -1 || boxIdx === -1) {
            // Fallback for slightly different naming but prioritize user's names
            const fallbackSo = headers.findIndex(h => h.includes('order no') || h.includes('batch no'));
            const fallbackBox = headers.findIndex(h => h.includes('box') || h.includes('c/no'));
            
            if (soIdx === -1) soIdx = fallbackSo;
            if (boxIdx === -1) boxIdx = fallbackBox;
            
            if (soIdx === -1) continue; // Still not found
          }

          const mapped = [];
          const seenInThisFile = new Set<string>();
          let currentPlNo = plNo;
          let currentCustomer = customer;
          let emptyRowCount = 0;

          for (let i = tableHeaderRow + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => cell === null || cell === '')) {
              emptyRowCount++;
              if (emptyRowCount >= 3) break; // End of table
              continue;
            }
            emptyRowCount = 0;
            
            const rowStr = row.map(c => String(c || '').trim()).join(' ');
            const rowStrLower = rowStr.toLowerCase();

            // ALWAYS BREAK at 'Total' row - Critical fix for duplication issues
            if (rowStrLower === 'total' || rowStrLower.startsWith('total ') || (rowStrLower.includes('total') && (rowStrLower.includes('qty') || rowStrLower.includes('box')))) {
               break; 
            }

            const soValue = String(row[soIdx] || '').trim();
            if (!soValue || soValue === '') continue;
            
            const soUpper = soValue.toUpperCase();
            if (soUpper.startsWith('SO-') || soUpper.startsWith('SLT-') || soUpper.startsWith('CSUP-') || soUpper.startsWith('OV-')) {
              // Ensure we have a PL number associated, otherwise ignore random SOs outside tables
              if (!currentPlNo) continue; 

              const compositeKey = `${cleanId(currentPlNo)}|${cleanId(soValue)}|${rproIdx !== -1 ? cleanId(String(row[rproIdx] || '')) : ''}`;
              
              if (seenInThisFile.has(compositeKey)) continue;
              seenInThisFile.add(compositeKey);

              mapped.push({
                plNo: currentPlNo,
                so: soValue,
                rpro: rproIdx !== -1 ? String(row[rproIdx] || '').trim() : '',
                kh: currentCustomer,
                qty: parseFloat(String(row[qtyIdx] || '0').replace(/,/g, '')) || 0,
                totalBoxes: parseInt(String(row[boxIdx] || '0').replace(/,/g, '')) || 0,
              });
            }
          }

          if (mapped.length > 0) {
            finalMapped = mapped;
            foundSheet = true;
            break; // Found the correct sheet
          }
        }
      }

      if (foundSheet) {
        setPlItems(finalMapped);
        const uniquePLs = Array.from(new Set(finalMapped.map(item => item.plNo).filter(pl => pl !== '')));
        setPlNumbers(uniquePLs);
        if (uniquePLs.length > 0) setPlNoInput(uniquePLs[0]);
        setMessage({ type: 'success', text: `Đã tìm thấy và tải lên ${finalMapped.length} dòng dữ liệu từ file PL.` });
      } else {
        setMessage({ type: 'error', text: 'Không tìm thấy Sheet nào có định dạng "DELIVERY NOTE" hợp lệ.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSourceFilesUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    const newSourceFiles: any[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const data = await new Promise<any[]>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
              try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                
                let sheetMapped: any[] = [];
                let foundInSheet = false;

                for (const wsname of wb.SheetNames) {
                  // Skip hidden sheets
                  const wsIdx = wb.SheetNames.indexOf(wsname);
                  const isHidden = wb.Workbook?.Sheets?.[wsIdx]?.Hidden !== 0 && wb.Workbook?.Sheets?.[wsIdx]?.Hidden !== undefined;
                  if (isHidden) continue;

                  const ws = wb.Sheets[wsname];
                  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                  
                  if (rows.length < 5) continue;

                  // 1. Find Table Headers first (Try Row 7, 8, 9 - Indices 6, 7, 8)
                  const headerIndices = [6, 7, 8]; 
                  let tableHeaderRow = -1;
                  let soIdx = -1;

                  for (const idx of headerIndices) {
                    const headers = rows[idx] || [];
                    const foundIdx = headers.findIndex(h => 
                      String(h || '').trim().toLowerCase().includes('ovn order no')
                    );
                    if (foundIdx !== -1) {
                      tableHeaderRow = idx;
                      soIdx = foundIdx;
                      break;
                    }
                  }

                  if (tableHeaderRow !== -1) {
                    // 1. Find PL No by scanning top rows (indices 2 to 7)
                    let plNo = '';
                    for (let r = 2; r <= 7; r++) {
                      const row = rows[r] || [];
                      for (const cell of row) {
                        const cellStr = String(cell || '').trim();
                        if (cellStr.toUpperCase().includes('PL-')) {
                          const match = cellStr.match(/PL-[\w-]+/i);
                          if (match && !plNo) {
                            plNo = match[0];
                            break;
                          }
                        }
                      }
                      if (plNo) break;
                    }

                    // 2. Find Customer info by scanning top rows (indices 2 to 10)
                    let customer = '';
                    for (let r = 2; r <= 10; r++) {
                      const row = rows[r] || [];
                      const rowString = row.map(c => String(c || '').trim()).join(' ');
                      if (rowString.toLowerCase().includes('customer:')) {
                        const parts = rowString.split(/customer:/i);
                        if (parts[1]) {
                          customer = parts[1]
                            .split(/erp/i)[0]
                            .split(/delivery/i)[0]
                            .split(/date/i)[0]
                            .split(/address/i)[0]
                            .split(/pl-/i)[0]
                            .split(/\d{2}-/)[0]
                            .trim();
                          if (customer.endsWith(',')) customer = customer.slice(0, -1).trim();
                          if (customer.toLowerCase().includes('address:')) {
                            customer = customer.split(/address:/i)[0].trim();
                          }
                          if (customer) break;
                        }
                      }
                    }

                    const headers = rows[tableHeaderRow].map(h => String(h || '').trim().toLowerCase());
                    
                    // Strict header mapping as requested
                    let soIdxMap = headers.findIndex(h => h === 'ovn order no' || h.includes('ovn order no'));
                    const rproIdx = headers.indexOf('rpro');
                    let boxIdxMap = headers.findIndex(h => h === 'total box' || h.includes('total box'));
                    const qtyIdx = headers.indexOf('qty');

                    if (soIdxMap === -1 || qtyIdx === -1 || boxIdxMap === -1) {
                      const fallbackSo = headers.findIndex(h => h.includes('order no') || h.includes('batch no'));
                      const fallbackBox = headers.findIndex(h => h.includes('box') || h.includes('c/no'));
                      if (soIdxMap === -1) soIdxMap = fallbackSo;
                      if (boxIdxMap === -1) boxIdxMap = fallbackBox;
                      if (soIdxMap === -1) continue;
                    }

                    const mapped = [];
                    const seenInThisFile = new Set<string>();
                    let currentPlNo = plNo;
                    let currentCustomer = customer;

                    for (let j = tableHeaderRow + 1; j < rows.length; j++) {
                      const row = rows[j];
                      if (!row) continue;
                      
                      const rowStr = row.map(c => String(c || '').trim()).join(' ');
                      const rowStrLower = rowStr.toLowerCase();

                      // Robust break for total rows
                      if (rowStrLower === 'total' || rowStrLower.startsWith('total ') || (rowStrLower.includes('total') && (rowStrLower.includes('qty') || rowStrLower.includes('box')))) {
                         break;
                      }

                      const soValue = String(row[soIdxMap] || '').trim();
                      if (!soValue) continue;
                      
                      const soUpper = soValue.toUpperCase();
                      if (soUpper.startsWith('SO-') || soUpper.startsWith('SLT-') || soUpper.startsWith('CSUP-') || soUpper.startsWith('OV-')) {
                        const compositeKey = `${cleanId(currentPlNo)}|${cleanId(soValue)}|${rproIdx !== -1 ? cleanId(String(row[rproIdx] || '')) : ''}`;
                        if (seenInThisFile.has(compositeKey)) continue;
                        seenInThisFile.add(compositeKey);

                        mapped.push({
                          date: new Date().toISOString(),
                          so: soValue,
                          rpro: rproIdx !== -1 ? String(row[rproIdx] || '').trim() : '',
                          kh: currentCustomer,
                          plNo: currentPlNo,
                          totalBoxes: parseInt(String(row[boxIdxMap] || '0').replace(/,/g, '')) || 0,
                          outQty: parseFloat(String(row[qtyIdx] || '0').replace(/,/g, '')) || 0,
                          status: 'ok',
                          note: '',
                          inventory: null
                        });
                      }
                    }
                    if (mapped.length > 0) {
                      sheetMapped = mapped;
                      foundInSheet = true;
                      break;
                    }
                  }
                }
                resolve(sheetMapped);
              } catch (err) {
                reject(err);
              }
            };
            reader.onerror = () => reject(new Error('Lỗi đọc file'));
            reader.readAsBinaryString(file);
          });
          
          newSourceFiles.push({
            name: file.name,
            status: data.length > 0 ? 'success' : 'error',
            data: data,
            error: data.length === 0 ? 'Không tìm thấy dữ liệu đơn hàng hợp lệ' : undefined
          });
        } catch (err: any) {
          newSourceFiles.push({
            name: file.name,
            status: 'error',
            data: [],
            error: err.message
          });
        }
      }

      setSourceFiles(prev => [...prev, ...newSourceFiles]);
      setMessage({ type: 'success', text: `Đã tải lên ${newSourceFiles.length} file nguồn vào danh sách.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xử lý file: ' + err.message });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleCopyPasteSourceFiles = async () => {
    const successFiles = sourceFiles.filter(f => f.status === 'success');
    if (successFiles.length === 0) {
      setMessage({ type: 'error', text: 'Không có file nguồn hợp lệ để sao chép.' });
      return;
    }

    const allPlItemsToInsert: any[] = [];
    
    // Virtual key check to prevent duplicate insertion of the same items if already in current list
    const existingKeys = new Set(plItems.map(item => 
      `${cleanId(item.plNo)}|${cleanId(item.so)}|${cleanId(item.rpro)}`
    ));

    successFiles.forEach(file => {
      file.data.forEach(item => {
        const itemPlNo = item.plNo?.trim() || 'N/A';
        const itemSo = item.so?.trim() || '';
        const itemRpro = item.rpro?.trim() || '';
        const key = `${cleanId(itemPlNo)}|${cleanId(itemSo)}|${cleanId(itemRpro)}`;
        
        if (!existingKeys.has(key)) {
          allPlItemsToInsert.push({
            pl_no: itemPlNo,
            so: itemSo,
            rpro: itemRpro,
            kh: item.kh?.trim() || '',
            qty: item.outQty,
            total_boxes: item.totalBoxes
          });
          existingKeys.add(key); // Also track within the batch
        }
      });
    });

    if (allPlItemsToInsert.length === 0) {
      setMessage({ type: 'success', text: 'Dữ liệu đã tồn tại trong danh sách PL hiện tại.' });
      setSourceFiles([]);
      return;
    }

    const { error } = await supabase.from('current_pl_items').insert(allPlItemsToInsert);
    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi lưu danh sách PL: ' + errorMsg });
      return;
    }

    await fetchCurrentPLItems();
    setMessage({ type: 'success', text: `Đã sao chép ${allPlItemsToInsert.length} dòng vào danh sách PL hiện tại.` });
    // Clear source files after successful copy
    setSourceFiles([]);
  };

  async function fetchOutboundData() {
    setOutboundLoading(true);
    setIsLoading(true);
    const from = (outboundPage - 1) * outboundPageSize;
    const to = from + outboundPageSize - 1;

    let query = supabase
      .from('outbound_transactions')
      .select('*', { count: 'exact' })
      .eq('type', dataSubTab === 'scan' ? 'SCAN' : 'PL');

    if (outboundSearch.trim()) {
      query = query.or(`so.ilike.%${outboundSearch.trim()}%,rpro.ilike.%${outboundSearch.trim()}%,kh.ilike.%${outboundSearch.trim()}%,pl_no.ilike.%${outboundSearch.trim()}%`);
    }

    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00`);
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59`);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (data) {
      setOutboundData(data);
      if (count !== null) setOutboundTotal(count);
    }
    setOutboundLoading(false);
    setIsLoading(false);
  }

  const deleteOutbound = async (id: string) => {
    const { error } = await supabase.from('outbound_transactions').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa bản ghi xuất kho.' });
      fetchOutboundData();
    }
  };

  const toggleSelectPlItem = (id: string) => {
    const newSelected = new Set(selectedPlItems);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedPlItems(newSelected);
  };

  const toggleSelectAllPlItems = () => {
    if (selectedPlItems.size === filteredPlItems.length) {
      setSelectedPlItems(new Set());
    } else {
      setSelectedPlItems(new Set(filteredPlItems.map(item => item.id)));
    }
  };

  const handleDeleteSelectedPlItems = async () => {
    if (selectedPlItems.size === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedPlItems.size} mục PL đã chọn?`)) return;

    setLoading(true);
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('current_pl_items')
        .delete()
        .in('id', Array.from(selectedPlItems));

      if (error) throw error;

      setMessage({ type: 'success', text: `Đã xóa ${selectedPlItems.size} mục PL thành công.` });
      setSelectedPlItems(new Set());
      await fetchCurrentPLItems();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa các mục PL: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const deleteSelectedOutbound = async () => {
    if (selectedOutbound.size === 0) return;
    const { error } = await supabase
      .from('outbound_transactions')
      .delete()
      .in('id', Array.from(selectedOutbound));

    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: `Đã xóa ${selectedOutbound.size} bản ghi xuất kho.` });
      setSelectedOutbound(new Set());
      fetchOutboundData();
    }
  };

  const handleScan = async (qrData: string) => {
    const parsed = parseQRCode(qrData);
    
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) return;

    // 1. Find in Inventory (Local lookup for speed)
    const inventory = inventoryBalances.find(inv => inv.qr_code === parsed.qrCode);

    // 2. Match with Source Data (Remote lookup as this table might be large)
    let sourceMatchQuery = supabase.from('source_import_lines').select('*');
    if (parsed.rpro && parsed.so) {
      sourceMatchQuery = sourceMatchQuery.or(`rpro.eq.${parsed.rpro},so.eq.${parsed.so}`);
    } else if (parsed.rpro) {
      sourceMatchQuery = sourceMatchQuery.eq('rpro', parsed.rpro);
    } else if (parsed.so) {
      sourceMatchQuery = sourceMatchQuery.eq('so', parsed.so);
    } else {
      sourceMatchQuery = sourceMatchQuery.eq('id', 'none');
    }
    const { data: sourceMatch } = await sourceMatchQuery.limit(1).single();

    // 3. Match with PL automatically if available
    let plMatch = null;
    if (plItems.length > 0) {
      plMatch = plItems.find(item => 
        (parsed.rpro && item.rpro ? item.rpro === parsed.rpro : item.so === parsed.so)
      );
    }

    let status = plMatch ? 'OK' : 'Wrong';
    let note = plMatch ? '' : 'Không khớp danh sách PL';

    // Additional checks for internal warnings, but status is primarily PL match
    if (!inventory) {
      note = note ? note + ' & Không có trong tồn kho' : 'Không có trong tồn kho';
    } else if (parsed.quantity > inventory.quantity) {
      note = note ? note + ' & Xuất vượt tồn' : 'Xuất vượt tồn';
    }

    const newItem = {
      qr_code: parsed.qrCode,
      so: parsed.so,
      rpro: parsed.rpro,
      kh: plMatch ? plMatch.kh : (sourceMatch ? sourceMatch.kh : 'N/A'),
      total_boxes: plMatch ? plMatch.totalBoxes : (sourceMatch ? sourceMatch.totalBoxes : 0),
      status,
      note,
      out_qty: parsed.quantity,
      pl_no: plMatch ? plMatch.plNo : 'N/A',
      location_path: inventory?.location_path || 'N/A',
      is_saved: false,
      scan_date: new Date().toISOString(),
      inventory_id: inventory?.id || null
    };

    const { data: insertData, error: insertError } = await supabase
      .from('current_scanned_items')
      .insert(newItem)
      .select();

    if (insertError) {
      setMessage({ type: 'error', text: 'Lỗi khi lưu mã quét: ' + insertError.message });
      return;
    }

    if (insertData && insertData.length > 0) {
      const dbItem = insertData[0];
      const newItemForState = {
        id: dbItem.id,
        qrCode: dbItem.qr_code,
        so: dbItem.so,
        rpro: dbItem.rpro,
        kh: dbItem.kh,
        totalBoxes: dbItem.total_boxes,
        status: dbItem.status,
        note: dbItem.note,
        outQty: dbItem.out_qty,
        plNo: dbItem.pl_no,
        locationPath: dbItem.location_path,
        isSaved: dbItem.is_saved,
        date: dbItem.scan_date,
        inventory_id: dbItem.inventory_id,
        inventory: dbItem.inventory_id ? { id: dbItem.inventory_id, location_path: dbItem.location_path } : null
      };
      setScannedItems(prev => [newItemForState, ...prev]);
      setHasUnsavedChanges(true);
    }
    setIsScanning(false);
  };

  const handleConfirmOutbound = async () => {
    if (enrichedScannedItems.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        device_info: navigator.userAgent,
        items: enrichedScannedItems.map(item => ({
          qrCode: item.qrCode,
          so: item.so,
          rpro: item.rpro,
          kh: item.kh,
          plNo: item.plNo,
          outQty: item.outQty,
          locationPath: item.locationPath,
          status: item.status,
          note: item.note,
          inventoryId: item.inventory_id,
          isSaved: item.isSaved
        }))
      };

      const { error } = await supabase.rpc('process_outbound_v1', { p_data: payload });

      if (error) throw error;

      // Clear current scanned items from database
      await supabase.from('current_scanned_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setMessage({ type: 'success', text: `Đã xuất kho thành công ${scannedItems.length} kiện hàng.` });
      setScannedItems([]);
      setSelectedScanned(new Set());
      clearAppCache();
      fetchOutboundData();
    } catch (error: any) {
      console.error('Outbound error:', error);
      setMessage({ type: 'error', text: error.message || 'Có lỗi xảy ra khi xuất kho.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectScanned = (id: string) => {
    const newSelected = new Set(selectedScanned);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedScanned(newSelected);
  };

  const deleteSelectedScanned = async () => {
    const idsToDelete = Array.from(selectedScanned);
    if (idsToDelete.length === 0) return;
    
    setLoading(true);
    try {
      const chunkSize = 200;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        const { error } = await supabase.from('current_scanned_items').delete().in('id', chunk);
        if (error) throw error;
      }
      
      await fetchCurrentScannedItems();
      setSelectedScanned(new Set());
      setMessage({ type: 'success', text: `Đã xóa ${idsToDelete.length} mã quét thành công.` });
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa mã quét: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: any, index: number, type: 'scan' | 'pl') => {
    setEditingItem({ ...item, index });
    setEditingType(type);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingType) return;

    if (editingType === 'scan') {
      const { error } = await supabase
        .from('current_scanned_items')
        .update({
          qr_code: editingItem.qrCode?.trim(),
          so: editingItem.so?.trim(),
          rpro: editingItem.rpro?.trim(),
          kh: editingItem.kh?.trim(),
          total_boxes: editingItem.totalBoxes,
          status: editingItem.status,
          note: editingItem.note,
          out_qty: editingItem.outQty,
          pl_no: editingItem.plNo?.trim(),
          location_path: editingItem.locationPath?.trim(),
          is_saved: false
        })
        .eq('id', editingItem.id);

      if (error) {
        setMessage({ type: 'error', text: 'Lỗi khi cập nhật mã quét: ' + error.message });
        return;
      }
      await fetchCurrentScannedItems();
    } else {
      const { error } = await supabase
        .from('current_pl_items')
        .update({
          pl_no: editingItem.plNo?.trim(),
          so: editingItem.so?.trim(),
          rpro: editingItem.rpro?.trim(),
          kh: editingItem.kh?.trim(),
          qty: editingItem.qty,
          total_boxes: editingItem.totalBoxes
        })
        .eq('id', editingItem.id);

      if (error) {
        setMessage({ type: 'error', text: 'Lỗi khi cập nhật PL: ' + error.message });
        return;
      }
      await fetchCurrentPLItems();
    }
    setEditingItem(null);
    setEditingType(null);
  };

  const handleDeletePLItem = async (id: string) => {
    const { error } = await supabase.from('current_pl_items').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa PL: ' + error.message });
    } else {
      setSelectedPlItems(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchCurrentPLItems();
    }
  };

  const handleSavePLToOutbound = async () => {
    if (filteredPlItems.length === 0) return;
    setLoading(true);
    try {
      // Pre-calculate scan counts and inventory matches to avoid O(N*M) in the map
      const itemsToSave = filteredPlItems.map(item => {
        const cleanedSo = cleanId(item.so);
        const cleanedRpro = cleanId(item.rpro);
        
        const scanCount = cleanedRpro ? (plItemStats.rproCounts.get(cleanedRpro) || 0) : (plItemStats.soCounts.get(cleanedSo) || 0);

        const diff = item.totalBoxes - scanCount;
        let statusText = 'OK';
        if (diff > 0) statusText = `Thiếu (${diff})`;
        else if (diff < 0) statusText = `Dư (${Math.abs(diff)})`;

        const invMatch = cleanedRpro 
          ? plItemStats.rproInv.get(cleanedRpro) 
          : (cleanedSo ? plItemStats.soInv.get(cleanedSo) : null);

        return {
          type: 'PL',
          qr_code: `${cleanedSo}|${cleanedRpro}`,
          so: cleanedSo,
          rpro: cleanedRpro,
          kh: item.kh,
          pl_no: item.plNo,
          quantity: item.totalBoxes,
          scan_count: scanCount,
          status: statusText,
          location_path: invMatch ? Array.from(invMatch.locations!).join(', ') : 'N/A',
          note: 'Lưu từ Danh sách PL hiện tại',
          device_info: navigator.userAgent
        };
      });

      // Chunking for large datasets
      const chunkSize = 200;
      for (let i = 0; i < itemsToSave.length; i += chunkSize) {
        const chunk = itemsToSave.slice(i, i + chunkSize);
        const { error } = await supabase.from('outbound_transactions').insert(chunk);
        if (error) {
          const errorMsg = error.message.includes('Failed to fetch')
            ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
            : error.message;
          throw new Error(errorMsg);
        }
      }

      setMessage({ type: 'success', text: `Đã lưu ${itemsToSave.length} dòng dữ liệu PL vào Data xuất.` });
      fetchOutboundData();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi lưu dữ liệu PL: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshPLLocations = async () => {
    setLoading(true);
    setIsLoading(true);
    try {
      await Promise.all([
        fetchInventoryBalances(),
        fetchCurrentPLItems()
      ]);
      setMessage({ type: 'success', text: 'Đã cập nhật vị trí từ tồn kho mới nhất.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi cập nhật vị trí: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handlePrintPL = () => {
    if (filteredPlItems.length === 0) return;

    // Group items by PL No
    const plGroups = new Map<string, any[]>();
    
    filteredPlItems.forEach(item => {
      const plNo = item.plNo || 'N/A';
      if (!plGroups.has(plNo)) {
        plGroups.set(plNo, []);
      }
      
      const invMatch = (item.so && item.rpro) 
        ? plItemStats.compositeInv.get(`${item.so}|${item.rpro}`)
        : item.rpro 
          ? plItemStats.rproInv.get(item.rpro) 
          : plItemStats.soInv.get(item.so);
      const location = invMatch ? Array.from(invMatch.locations!).join(', ') : 'N/A';
      const scanCount = item.rpro ? (plItemStats.rproCounts.get(item.rpro) || 0) : (plItemStats.soCounts.get(item.so) || 0);
      
      plGroups.get(plNo)?.push({
        ...item,
        location,
        scanCount
      });
    });

    // Convert to array of groups and sort each group by location
    const specialPrefixes = ['Logo', 'Vai', 'PU', 'FB', 'FM'];
    const isSpecial = (loc: string) => {
      if (!loc || loc === 'N/A') return false;
      const l = loc.toLowerCase();
      return specialPrefixes.some(p => l.startsWith(p.toLowerCase()));
    };

    const allSpecialItems: any[] = [];
    const sortedGroups = Array.from(plGroups.entries()).map(([plNo, items]) => {
      const sortedItems = items.sort((a, b) => a.location.localeCompare(b.location));
      const regular = sortedItems.filter(item => !isSpecial(item.location));
      const special = sortedItems.filter(item => isSpecial(item.location));
      allSpecialItems.push(...special);
      return { plNo, regular };
    }).sort((a, b) => a.plNo.localeCompare(b.plNo));

    // Create print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const renderTable = (items: any[], titleSuffix: string = "") => {
      if (items.length === 0) return "";
      
      // Ensure items are sorted by PL No A-Z, then by Location A-Z
      const sortedItems = [...items].sort((a, b) => {
        const plCompare = (a.plNo || '').localeCompare(b.plNo || '');
        if (plCompare !== 0) return plCompare;
        return (a.location || '').localeCompare(b.location || '');
      });

      return `
        ${titleSuffix ? `<h3 style="color: #e67e22; margin-top: 20px; font-size: 14px; text-align: left; border-bottom: 2px solid #e67e22; padding-bottom: 5px;">DANH SÁCH ${titleSuffix}</h3>` : ''}
        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">STT</th>
              <th style="width: 80px;">PL No</th>
              <th style="white-space: nowrap;">OVN Order No</th>
              <th style="white-space: nowrap;">RPRO</th>
              <th style="text-align: center; width: 60px;">Total Box</th>
              <th style="width: 100px;">Location</th>
              <th>Khách Hàng</th>
            </tr>
          </thead>
          <tbody>
            ${sortedItems.map((item, index) => `
              <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td style="font-size: 8px; color: #666;">${item.plNo || 'N/A'}</td>
                <td style="font-weight: bold; white-space: nowrap;">${item.so || 'N/A'}</td>
                <td style="color: #e67e22; font-weight: bold; white-space: nowrap;">${item.rpro || ''}</td>
                <td style="text-align: center; font-weight: bold;">${item.totalBoxes}</td>
                <td class="location-tag">${item.location}</td>
                <td style="font-size: 9px; line-height: 1.1; word-break: break-all;">${(item.kh || 'N/A').substring(0, 30)}${(item.kh || '').length > 30 ? '...' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background-color: #f8f9fa; font-weight: bold;">
              <td colspan="4" style="text-align: right; font-size: 12px;">TỔNG CỘNG:</td>
              <td style="text-align: center; font-size: 12px;">${sortedItems.reduce((sum, item) => sum + (item.totalBoxes || 0), 0)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      `;
    };

    const html = `
      <html>
        <head>
          <title>In Danh Sách PL</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            .pl-section { page-break-after: always; margin-bottom: 40px; }
            .pl-section:last-child { page-break-after: auto; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; overflow: hidden; }
            th { background-color: #f8f9fa; font-weight: bold; text-transform: uppercase; }
            h2 { text-align: center; color: #002060; margin-bottom: 5px; }
            .header-info { margin-bottom: 10px; font-size: 11px; color: #666; display: flex; justify-content: space-between; }
            .footer { margin-top: 20px; font-size: 10px; text-align: right; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
            .location-tag { background-color: #fff9f0; font-weight: bold; }
            
            /* Column widths */
            th:nth-child(1), td:nth-child(1) { width: 30px; }
            th:nth-child(2), td:nth-child(2) { width: 80px; }
            th:nth-child(3), td:nth-child(3) { width: 120px; }
            th:nth-child(4), td:nth-child(4) { width: 100px; }
            th:nth-child(5), td:nth-child(5) { width: 60px; }
            th:nth-child(6), td:nth-child(6) { width: 100px; }
            th:nth-child(7), td:nth-child(7) { width: auto; }

            @media print {
              body { padding: 0; }
              @page { size: portrait; margin: 1cm; }
              .pl-section { page-break-after: always; }
            }
          </style>
        </head>
        <body>
          ${sortedGroups.map((group) => {
            if (group.regular.length === 0) return '';
            return `
              <div class="pl-section">
                <h2 style="margin-top: 0;">DANH SÁCH LỆNH XUẤT (PL: ${group.plNo})</h2>
                <div class="header-info">
                  <span>Ngày in: ${new Date().toLocaleString('vi-VN')}</span>
                  <span>Tổng số dòng: ${group.regular.length}</span>
                </div>
                ${renderTable(group.regular)}
                <div class="footer">Hệ thống Quản lý Kho</div>
              </div>
            `;
          }).join('')}
          
          ${allSpecialItems.length > 0 ? `
            <div class="pl-section">
              <h2 style="margin-top: 0;">DANH SÁCH HÀNG LOGO/VẢI/PU/FB/FM TỔNG HỢP</h2>
              <div class="header-info">
                <span>Ngày in: ${new Date().toLocaleString('vi-VN')}</span>
                <span>Tổng số dòng: ${allSpecialItems.length}</span>
              </div>
              ${renderTable(allSpecialItems, "HÀNG LOGO/VẢI/PU/FB/FM")}
              <div class="footer">Hệ thống Quản lý Kho</div>
            </div>
          ` : ''}
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 w-full md:w-auto">
          <div className="p-3 bg-orange-100 rounded-xl">
            <Package className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-none">Xuất kho hàng hóa</h1>
            <p className="text-slate-500 text-sm mt-1">Quản lý quy trình xuất kho và đối chiếu</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex p-1 bg-slate-100 rounded-2xl w-fit border border-slate-200">
        <button
          onClick={() => setActiveTab('scan')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'scan' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Scan className="w-4 h-4" />
          Scan xuất
        </button>
        {(isAdmin || isViewer) && (
          <>
            <button
              onClick={() => setActiveTab('pl')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'pl' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              PL (Packing List)
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'data' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <HistoryIcon className="w-4 h-4" />
              Data xuất
            </button>
          </>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          <Package className="w-5 h-5" />
          <p className="text-sm font-medium">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase">Đóng</button>
        </div>
      )}

      {activeTab === 'scan' && (
        <div className="space-y-6">
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
                      Đang ở chế độ: Scan Xuất
                    </span>
                  </div>
                  <QRScanner onScan={handleScan} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Configuration Section */}
            <div className="xl:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl border-2 border-orange-500 shadow-lg">
                <div className="flex items-center gap-2 mb-6 bg-orange-600 p-3 rounded-xl shadow-md">
                  <Settings className="w-5 h-5 text-white" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Cấu hình quét</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider ml-1 mb-2">Dán mã QR (Thủ công)</label>
                    <textarea
                      value={manualQR}
                      onChange={(e) => setManualQR(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black focus:border-orange-400 focus:ring-4 focus:ring-orange-100 outline-none h-32 transition-all"
                      placeholder="Dán dữ liệu QR tại đây... (Mỗi dòng 1 mã)"
                    />
                    <button
                      onClick={handleProcessManual}
                      className="w-full mt-4 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black transition-all shadow-lg active:scale-95"
                    >
                      XỬ LÝ MÃ
                    </button>
                  </div>
                </div>
              </div>

              {enrichedScannedItems.length > 0 && (
                <button
                  onClick={handleConfirmOutbound}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-6 h-6" />
                      XÁC NHẬN XUẤT ({enrichedScannedItems.length})
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Scanned List Section */}
            <div className="xl:col-span-3">
              <div className="bg-white rounded-2xl border-2 border-blue-500 shadow-lg overflow-hidden">
                <div className="p-4 md:p-6 border-b border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-blue-600 shadow-md">
                  <h2 className="text-lg font-bold text-white uppercase tracking-tight">
                    Scan Xuất {scannedStatusFilter !== 'ALL' || scannedSearch ? `(${filteredScannedItems.length}/${enrichedScannedItems.length})` : `(${enrichedScannedItems.length})`}
                  </h2>
                  
                  <div className="flex-1 max-w-md relative flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm kiếm SO, RPRO, Khách hàng..."
                        value={scannedSearch}
                        onChange={(e) => setScannedSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/50 focus:bg-white/20 focus:ring-2 focus:ring-white/30 outline-none transition-all"
                      />
                    </div>
                    <select
                      value={scannedStatusFilter}
                      onChange={(e: any) => setScannedStatusFilter(e.target.value)}
                      className="px-3 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white focus:bg-white/20 focus:ring-2 focus:ring-white/30 outline-none transition-all appearance-none cursor-pointer min-w-[100px]"
                    >
                      <option value="ALL" className="text-slate-900">TẤT CẢ STATUS</option>
                      <option value="OK" className="text-emerald-600 font-bold">OK</option>
                      <option value="Wrong" className="text-rose-600 font-bold">WRONG</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {scannedItems.length > 0 && (
                      <button
                        onClick={handleSaveScannedToHistory}
                        disabled={loading || !hasUnsavedChanges}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        <Save className="w-4 h-4" />
                        LƯU DATA
                      </button>
                    )}
                    {isAdmin && selectedScanned.size > 0 && (
                      <button
                        onClick={deleteSelectedScanned}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-sm font-medium hover:bg-rose-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Xóa ({selectedScanned.size})
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={async () => {
                          const { error } = await supabase.from('current_scanned_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                          if (error) {
                            setMessage({ type: 'error', text: 'Lỗi khi xóa danh sách: ' + error.message });
                          } else {
                            setScannedItems([]);
                            setSelectedScanned(new Set());
                            setMessage({ type: 'success', text: 'Đã xóa toàn bộ danh sách chờ xuất.' });
                          }
                        }}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                        title="Xóa danh sách"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-[#002060] text-white">
                        <th className="px-2 py-3 border border-slate-300 text-center">
                          {isAdmin && (
                            <input 
                              type="checkbox" 
                              checked={selectedScanned.size === filteredScannedItems.length && filteredScannedItems.length > 0}
                              onChange={() => {
                                if (selectedScanned.size === filteredScannedItems.length) setSelectedScanned(new Set());
                                else setSelectedScanned(new Set(filteredScannedItems.map(item => item.id)));
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          )}
                        </th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">DATE</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">OVN Order No</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KHÁCH HÀNG</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">PL No</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Total Box</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">STATUS</th>
                        <th className="px-2 py-3 border border-slate-300"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredScannedItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-12 text-center">
                            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-400 italic text-sm">Không tìm thấy dữ liệu phù hợp</p>
                          </td>
                        </tr>
                      ) : (
                        filteredScannedItems.map((item, index) => (
                          <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedScanned.has(item.id) ? 'bg-blue-50' : ''} ${item.status === 'Wrong' ? 'bg-yellow-100' : ''}`}>
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              {isAdmin && (
                                <input 
                                  type="checkbox" 
                                  checked={selectedScanned.has(item.id)}
                                  onChange={() => toggleSelectScanned(item.id)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px] font-medium text-slate-700">
                              {item.qrCode}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px] whitespace-nowrap">
                              {new Date(item.date).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px] font-medium text-slate-700">
                              {item.so}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px] font-bold text-orange-600">
                              {item.rpro}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px]">
                              {item.kh || 'N/A'}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px]">
                              {item.plNo}
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-center text-[11px] font-bold">
                              {item.totalBoxes}
                            </td>
                            <td className={`px-4 py-3 border border-slate-200 text-center text-[11px] font-bold ${item.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.status}
                            </td>
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {!isViewer && (
                                  <button 
                                    onClick={() => handleEditItem(item, index, 'scan')}
                                    className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                )}
                                {isAdmin && (
                                  <button 
                                    onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== index))}
                                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredScannedItems.length > 0 && (
                      <tfoot className="bg-slate-50 font-bold sticky bottom-0 z-10 border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={7} className="px-4 py-3 border border-slate-200 text-right text-[11px] uppercase tracking-wider font-bold">Tổng cộng:</td>
                          <td className="px-4 py-3 border border-slate-200 text-[11px] text-center text-blue-700 font-extrabold">
                            {scanTableTotals.totalBoxes}
                          </td>
                          <td colSpan={2} className="px-4 py-3 border border-slate-200"></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredScannedItems.length === 0 ? (
                    <div className="p-12 text-center">
                      <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 italic text-sm">Không tìm thấy dữ liệu phù hợp</p>
                    </div>
                  ) : (
                    filteredScannedItems.map((item, index) => (
                      <div key={item.id} className={`p-4 space-y-3 ${selectedScanned.has(item.id) ? 'bg-blue-50' : 'bg-white'} ${item.status === 'Wrong' ? 'bg-yellow-100' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            {isAdmin && (
                              <input 
                                type="checkbox" 
                                checked={selectedScanned.has(item.id)}
                                onChange={() => toggleSelectScanned(item.id)}
                                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                            <div>
                              <div className="text-sm font-black text-slate-900">{item.so}</div>
                              <div className="text-xs font-bold text-orange-600">{item.rpro}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!isViewer && (
                              <button 
                                onClick={() => handleEditItem(item, index, 'scan')}
                                className="p-2 text-slate-300 hover:text-blue-500"
                              >
                                <FileText className="w-5 h-5" />
                              </button>
                            )}
                            {isAdmin && (
                              <button 
                                onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== index))}
                                className="p-2 text-slate-300 hover:text-rose-500"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase">Khách hàng</div>
                            <div className="text-xs font-bold text-slate-700 truncate">{item.kh || 'N/A'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase">PL NO</div>
                            <div className="text-xs font-bold text-slate-700">{item.plNo}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase">Số thùng</div>
                            <div className="text-xs font-black text-slate-900">{item.totalBoxes}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase">Status</div>
                            <div className={`text-xs font-black ${item.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.status}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold italic">
                          <span>Mã: {item.qrCode}</span>
                          <span>{new Date(item.date).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pl' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-1 space-y-6">
              {!isViewer && (
                <div className="bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                  <div className="w-16 h-16 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Tải lên PL nguồn</h3>
                  <p className="text-slate-500 mb-6 text-sm">
                    Chọn một hoặc nhiều file Excel để nạp vào danh sách chờ xử lý.
                  </p>
                  <label className="bg-orange-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-orange-700 transition-all cursor-pointer inline-block w-full">
                    Chọn file Excel
                    <input type="file" multiple className="hidden" accept=".xlsx, .xls" onChange={handleSourceFilesUpload} />
                  </label>
                </div>
              )}

              {sourceFiles.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Danh sách PL nguồn</h3>
                    <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-full font-bold text-slate-500">
                      {sourceFiles.length} FILE
                    </span>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {sourceFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-700 truncate">{file.name}</span>
                          <span className="text-[10px] text-slate-400">{file.data.length} dòng dữ liệu</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {file.status === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <div title={file.error}>
                              <AlertCircle className="w-5 h-5 text-rose-500" />
                            </div>
                          )}
                          <button 
                            onClick={() => setSourceFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleCopyPasteSourceFiles}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100 transition-all"
                  >
                    <Copy className="w-5 h-5" />
                    SAO CHÉP & DÁN VÀO PL HIỆN TẠI
                  </button>
                </div>
              )}
            </div>

            <div className="xl:col-span-3">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-orange-600 shadow-sm">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Danh sách PL hiện tại {plStatusFilter !== 'ALL' || plSearch ? `(${filteredPlItems.length}/${plItems.length})` : `(${plItems.length})`}
                      </h2>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Current Packing List Data</p>
                    </div>
                  </div>

                  <div className="flex-1 max-w-2xl relative flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm SO, RPRO, Khách hàng, PL..."
                        value={plSearch}
                        onChange={(e) => setPlSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    
                    <select
                      value={selectedPlNoFilter}
                      onChange={(e) => setSelectedPlNoFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer min-w-[120px]"
                    >
                      <option value="ALL">TẤT CẢ PL</option>
                      {plNumbers.map(pl => (
                        <option key={pl} value={pl}>{pl}</option>
                      ))}
                    </select>

                    <select
                      value={plStatusFilter}
                      onChange={(e: any) => setPlStatusFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer min-w-[100px]"
                    >
                      <option value="ALL">TẤT CẢ</option>
                      <option value="OK" className="text-emerald-600">ĐỦ (OK)</option>
                      <option value="THIEU" className="text-rose-600">THIẾU</option>
                      <option value="DU" className="text-amber-600">DƯ</option>
                    </select>
                  </div>

                  {plItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 mr-2">
                        {filteredPlItems.length} dòng ({plTableTotals.totalBoxes} thùng)
                      </span>
                      <button 
                        onClick={() => exportCurrentPL('xlsx')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-all"
                      >
                        <Download className="w-3 h-3 text-blue-600" />
                        EXCEL
                      </button>
                      <button 
                        onClick={() => exportCurrentPL('csv')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-all"
                      >
                        <Download className="w-3 h-3 text-emerald-600" />
                        CSV
                      </button>
                      <button 
                        onClick={handleRefreshPLLocations}
                        disabled={loading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-bold hover:bg-amber-600 transition-all disabled:opacity-50"
                      >
                        <MapPin className="w-3 h-3" />
                        CẬP NHẬT VỊ TRÍ
                      </button>
                      <button 
                        onClick={handlePrintPL}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-all"
                      >
                        <Printer className="w-3 h-3" />
                        IN PL
                      </button>
                      <button 
                        onClick={handleSavePLToOutbound}
                        disabled={loading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" />
                        LƯU DATA XUẤT
                      </button>
                      {isAdmin && selectedPlItems.size > 0 && (
                        <button 
                          onClick={handleDeleteSelectedPlItems}
                          disabled={loading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-bold hover:bg-rose-700 transition-all disabled:opacity-50 animate-in fade-in zoom-in"
                        >
                          <Trash2 className="w-3 h-3" />
                          XÓA ĐÃ CHỌN ({selectedPlItems.size})
                        </button>
                      )}
                      {isAdmin && (
                        <button 
                          onClick={async () => { 
                            if (!window.confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách PL hiện tại?')) return;
                            const { error } = await supabase.from('current_pl_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                            if (error) {
                              setMessage({ type: 'error', text: 'Lỗi khi xóa tất cả PL: ' + error.message });
                            } else {
                              setPlItems([]); 
                              setPlNumbers([]); 
                              setPlNoInput(''); 
                              setSelectedPlItems(new Set());
                              setMessage({ type: 'success', text: 'Đã xóa toàn bộ danh sách PL hiện tại.' });
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          XÓA TẤT CẢ
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {plItems.length === 0 ? (
                  <div className="p-20 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <HistoryIcon className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-slate-400 italic text-sm">Chưa có dữ liệu Packing List được nạp</p>
                    <p className="text-slate-300 text-xs mt-1">Hãy tải file nguồn và thực hiện "Sao chép & Dán"</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-[#002060] text-white">
                          <th className="px-2 py-3 border border-slate-300 text-center">
                            <input 
                              type="checkbox" 
                              checked={selectedPlItems.size === filteredPlItems.length && filteredPlItems.length > 0}
                              onChange={toggleSelectAllPlItems}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">OVN Order No</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KHÁCH HÀNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">PL No</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Total Box</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Scan Xuất</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Status</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Location</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPlItems.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-6 py-12 text-center">
                              <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                              <p className="text-slate-400 italic text-sm">Không tìm thấy dữ liệu phù hợp</p>
                            </td>
                          </tr>
                        ) : (
                          filteredPlItems.map((item, index) => {
                          const cleanedSo = cleanId(item.so);
                          const cleanedRpro = cleanId(item.rpro);
                          const cleanedPlNo = cleanId(item.plNo);
                          
                          const rproKey = `${cleanedPlNo}|${cleanedRpro}`;
                          const soKey = `${cleanedPlNo}|${cleanedSo}`;

                          const scanCount = cleanedRpro ? (plItemStats.rproCounts.get(rproKey) || 0) : (plItemStats.soCounts.get(soKey) || 0);

                          const diff = item.totalBoxes - scanCount;
                          let statusText = 'ok';
                          let statusColor = 'text-emerald-600';
                          
                          if (diff > 0) {
                            statusText = `Thiếu (${diff})`;
                            statusColor = 'text-rose-600';
                          } else if (diff < 0) {
                            statusText = `Dư (${Math.abs(diff)})`;
                            statusColor = 'text-amber-600';
                          }

                          const invMatch = cleanedRpro 
                            ? plItemStats.rproInv.get(cleanedRpro) 
                            : (cleanedSo ? plItemStats.soInv.get(cleanedSo) : null);
                          const location = invMatch ? Array.from(invMatch.locations!).join(', ') : 'N/A';

                          return (
                            <tr key={index} className={`hover:bg-slate-50 transition-colors ${selectedPlItems.has(item.id) ? 'bg-blue-50/50' : ''}`}>
                              <td className="px-2 py-4 border border-slate-200 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={selectedPlItems.has(item.id)}
                                  onChange={() => toggleSelectPlItem(item.id)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-4 border border-slate-200 text-sm text-center">{item.so}</td>
                              <td className="px-4 py-4 border border-slate-200 text-sm text-center font-bold text-orange-600">{item.rpro}</td>
                              <td className="px-4 py-4 border border-slate-200 text-xs text-center">{item.kh}</td>
                              <td className="px-4 py-4 border border-slate-200 text-sm text-center">{item.plNo}</td>
                              <td className="px-4 py-4 border border-slate-200 text-sm text-center font-bold">{item.totalBoxes}</td>
                              <td className="px-4 py-4 border border-slate-200 text-sm text-center font-bold text-blue-600">{scanCount}</td>
                              <td className={`px-4 py-4 border border-slate-200 text-sm text-center font-bold ${statusColor}`}>{statusText}</td>
                              <td className="px-4 py-4 border border-slate-200 text-xs text-center text-slate-500">{location}</td>
                              <td className="px-4 py-4 border border-slate-200 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleEditItem(item, index, 'pl')}
                                    className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                  {isAdmin && (
                                    <button 
                                      onClick={() => handleDeletePLItem(item.id)}
                                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                      </tbody>
                      {filteredPlItems.length > 0 && (
                        <tfoot className="bg-slate-50 font-bold sticky bottom-0 z-10 border-t-2 border-slate-200">
                          <tr>
                            <td colSpan={5} className="px-4 py-4 border border-slate-200 text-right text-sm uppercase tracking-wider">Tổng cộng:</td>
                            <td className="px-4 py-4 border border-slate-200 text-sm text-center text-blue-700">
                              {plTableTotals.totalBoxes}
                            </td>
                            <td className="px-4 py-4 border border-slate-200 text-sm text-center text-blue-700">
                              {plTableTotals.scanCount}
                            </td>
                            <td colSpan={3} className="px-4 py-4 border border-slate-200"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 bg-white p-1 rounded-2xl border border-slate-200 w-fit">
              <button
                onClick={() => setDataSubTab('scan')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  dataSubTab === 'scan'
                    ? 'bg-[#002060] text-white shadow-lg'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                1. Danh sách scan
              </button>
              <button
                onClick={() => setDataSubTab('pl')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  dataSubTab === 'pl'
                    ? 'bg-[#002060] text-white shadow-lg'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                2. Danh sách PL
              </button>
            </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Từ</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-sm font-bold text-slate-700 outline-none"
                  />
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Đến</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-sm font-bold text-slate-700 outline-none"
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
                <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo SO, RPRO, KH..."
                  value={outboundSearch}
                  onChange={(e) => setOutboundSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <select
                value={outboundStatusFilter}
                onChange={(e: any) => setOutboundStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer min-w-[100px]"
              >
                <option value="ALL">TẤT CẢ STATUS</option>
                <option value="OK">OK / ĐỦ</option>
                <option value="Wrong">WRONG</option>
                <option value="THIEU">THIẾU</option>
                <option value="DU">DƯ</option>
              </select>
              {isAdmin && selectedOutbound.size > 0 && (
                <button
                  onClick={deleteSelectedOutbound}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-sm font-medium hover:bg-rose-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa đã chọn ({selectedOutbound.size})
                </button>
              )}
              <button className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl flex items-center gap-2 text-sm font-medium">
                <Filter className="w-4 h-4" />
                Lọc
              </button>
              <button 
                onClick={() => exportOutboundData('xlsx')}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-slate-50 transition-all"
              >
                <Download className="w-4 h-4 text-blue-600" />
                Excel
              </button>
              <button 
                onClick={() => exportOutboundData('csv')}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-slate-50 transition-all"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                CSV
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-orange-600 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-orange-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-orange-900">Lịch sử xuất kho (DATA XUẤT KHO)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-[#002060] text-white">
                    <th className="px-2 py-3 border border-slate-300 text-center">
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={selectedOutbound.size === filteredOutbound.length && filteredOutbound.length > 0}
                          onChange={() => {
                            if (selectedOutbound.size === filteredOutbound.length) setSelectedOutbound(new Set());
                            else setSelectedOutbound(new Set(filteredOutbound.map(item => item.id)));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                    </th>
                    {dataSubTab === 'scan' ? (
                      <>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">DATE</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">OVN Order No</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KHÁCH HÀNG</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">PL No</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Total Box</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">STATUS</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">DATE</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">OVN Order No</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KHÁCH HÀNG</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">PL No</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Total Box</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Scan Xuất</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Status</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">Location</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">THAO TÁC</th>
                  </tr>
                </thead>
                    <tbody className="divide-y divide-slate-100">
                      {outboundLoading ? (
                        <tr>
                          <td colSpan={11} className="px-6 py-12 text-center">
                            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
                          </td>
                        </tr>
                      ) : filteredOutbound.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-6 py-12 text-center">
                            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-400">Chưa có dữ liệu {dataSubTab === 'scan' ? 'scan' : 'PL'} lưu trữ</p>
                          </td>
                        </tr>
                      ) : (
                        filteredOutbound.map((item) => (
                            <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedOutbound.has(item.id) ? 'bg-blue-50' : ''} ${dataSubTab === 'scan' && item.status === 'Wrong' ? 'bg-yellow-100' : ''}`}>
                              <td className="px-2 py-3 border border-slate-200 text-center">
                                {isAdmin && (
                                  <input 
                                    type="checkbox" 
                                    checked={selectedOutbound.has(item.id)}
                                    onChange={() => {
                                      const newSelected = new Set(selectedOutbound);
                                      if (newSelected.has(item.id)) newSelected.delete(item.id);
                                      else newSelected.add(item.id);
                                      setSelectedOutbound(newSelected);
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                )}
                              </td>
                              {dataSubTab === 'scan' ? (
                                <>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 font-medium text-slate-700">{item.qr_code}</td>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                                    {formatDate(item.created_at)}
                                  </td>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold text-orange-600">{item.rpro}</td>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.kh || 'N/A'}</td>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.pl_no || 'N/A'}</td>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">{item.quantity}</td>
                                  <td className={`px-4 py-3 text-[11px] border border-slate-200 text-center font-bold ${item.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {item.status}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                                    {formatDate(item.created_at)}
                                  </td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center">{item.so}</td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center font-bold text-orange-600">{item.rpro}</td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center">{item.kh}</td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center">{item.pl_no}</td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center font-bold">{item.quantity}</td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center font-bold text-blue-600">{item.scan_count}</td>
                                  <td className={`px-4 py-2 border border-slate-200 text-[11px] text-center font-bold ${item.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {item.status}
                                  </td>
                                  <td className="px-4 py-2 border border-slate-200 text-[11px] text-center">
                                    <div className="flex items-center justify-center gap-1 text-blue-600 font-bold">
                                      <MapPin className="w-3 h-3" />
                                      {item.location_path}
                                    </div>
                                  </td>
                                </>
                              )}
                              <td className="px-4 py-3 border border-slate-200 text-center">
                                {isAdmin && (
                                  <button 
                                    onClick={() => deleteOutbound(item.id)}
                                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
              </table>
            </div>
            {outboundData.length > 0 && (
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t-2 border-slate-200">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Hiển thị {Math.min(outboundTotal, (outboundPage - 1) * outboundPageSize + 1)}-{Math.min(outboundTotal, outboundPage * outboundPageSize)} trong {outboundTotal}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOutboundPage(prev => Math.max(1, prev - 1))}
                    disabled={outboundPage === 1}
                    className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
                  >
                    TRƯỚC
                  </button>
                  <div className="flex items-center px-4 bg-white border-2 border-slate-200 rounded-xl text-xs font-black">
                    TRANG {outboundPage} / {Math.ceil(outboundTotal / outboundPageSize) || 1}
                  </div>
                  <button
                    onClick={() => setOutboundPage(prev => Math.min(Math.ceil(outboundTotal / outboundPageSize), prev + 1))}
                    disabled={outboundPage === Math.ceil(outboundTotal / outboundPageSize) || outboundTotal === 0}
                    className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
                  >
                    SAU
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Chỉnh sửa thông tin</h3>
                <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-white rounded-xl transition-all">
                  <Trash2 className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">QR Code</label>
                  <input 
                    type="text" 
                    value={editingItem.qrCode}
                    onChange={(e) => setEditingItem({ ...editingItem, qrCode: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">OVN Order No (SO)</label>
                  <input 
                    type="text" 
                    value={editingItem.so}
                    onChange={(e) => setEditingItem({ ...editingItem, so: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">RPRO</label>
                  <input 
                    type="text" 
                    value={editingItem.rpro}
                    onChange={(e) => setEditingItem({ ...editingItem, rpro: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Khách hàng</label>
                  <input 
                    type="text" 
                    value={editingItem.kh}
                    onChange={(e) => setEditingItem({ ...editingItem, kh: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">PL No</label>
                  <input 
                    type="text" 
                    value={editingItem.plNo}
                    onChange={(e) => setEditingItem({ ...editingItem, plNo: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Total Box / Qty</label>
                  <input 
                    type="number" 
                    value={editingType === 'scan' ? editingItem.totalBoxes : editingItem.totalBoxes}
                    onChange={(e) => setEditingItem({ ...editingItem, totalBoxes: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={handleSaveEdit}
                  className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-100"
                >
                  Lưu thay đổi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
