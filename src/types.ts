export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
}

export interface WarehouseLocation {
  id: string;
  zone: string;
  shelf: string;
  level: string;
  bin: string;
  full_path: string;
}

export interface InventoryBalance {
  id: string;
  qr_code: string;
  so: string;
  rpro: string;
  kh: string;
  quantity: number;
  box_type: string;
  location_path: string;
  total_boxes?: number;
  last_updated: string;
}

export interface SourceImportLine {
  id: string;
  so: string;
  rpro: string;
  kh: string;
  quantity: number;
  box_type: string;
  default_location: string;
}

export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  user_id: string;
  role: UserRole;
}

export interface PlasticBinCustomer {
  id: string;
  code: string;
  name: string;
  created_at?: string;
}

export interface PlasticBinReturn {
  id: string;
  return_date: string;
  qrcode: string;
  customer_name: string;
  bin_type: string;
  quantity: number;
  created_at?: string;
}
