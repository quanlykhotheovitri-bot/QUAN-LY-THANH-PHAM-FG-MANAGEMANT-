-- SQL Schema for QR Warehouse Pro (Simplified - No Auth)

-- 1. Products (Danh mục hàng hóa)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    unit TEXT DEFAULT 'Pcs',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Warehouse Locations (Danh mục vị trí)
CREATE TABLE IF NOT EXISTS warehouse_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone TEXT NOT NULL,
    shelf TEXT NOT NULL,
    level TEXT NOT NULL,
    bin TEXT NOT NULL,
    full_path TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Source Import Files
CREATE TABLE IF NOT EXISTS source_import_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    import_date TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'active'
);

-- 4. Source Import Lines
CREATE TABLE IF NOT EXISTS source_import_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_file_id UUID REFERENCES source_import_files(id) ON DELETE CASCADE,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    quantity INTEGER NOT NULL,
    box_type TEXT,
    default_location TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Inbound Transactions
CREATE TABLE IF NOT EXISTS inbound_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code TEXT NOT NULL,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    quantity INTEGER NOT NULL,
    box_type TEXT,
    location_id UUID REFERENCES warehouse_locations(id),
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT now(),
    device_info TEXT
);

-- 6. Outbound Transactions
CREATE TABLE IF NOT EXISTS outbound_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code TEXT NOT NULL,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    quantity INTEGER NOT NULL,
    location_id UUID REFERENCES warehouse_locations(id),
    status TEXT DEFAULT 'completed',
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    device_info TEXT
);

-- 7. Inventory Balances
CREATE TABLE IF NOT EXISTS inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code TEXT NOT NULL,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    box_type TEXT,
    location_id UUID REFERENCES warehouse_locations(id),
    last_updated TIMESTAMPTZ DEFAULT now(),
    UNIQUE(qr_code, location_id)
);

-- 8. Inventory Movements
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    qr_code TEXT NOT NULL,
    from_location_id UUID REFERENCES warehouse_locations(id),
    to_location_id UUID REFERENCES warehouse_locations(id),
    quantity INTEGER NOT NULL,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    remark TEXT
);

-- 10. Upsert Inventory Balance Function
CREATE OR REPLACE FUNCTION upsert_inventory_balance(
    p_qr_code TEXT,
    p_so TEXT,
    p_rpro TEXT,
    p_kh TEXT,
    p_quantity INTEGER,
    p_box_type TEXT,
    p_location_id UUID
) RETURNS VOID AS $$
BEGIN
    INSERT INTO inventory_balances (qr_code, so, rpro, kh, quantity, box_type, location_id, last_updated)
    VALUES (p_qr_code, p_so, p_rpro, p_kh, p_quantity, p_box_type, p_location_id, now())
    ON CONFLICT (qr_code, location_id)
    DO UPDATE SET
        quantity = inventory_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql;

-- Disable RLS (Simplified for no auth)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE source_import_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE source_import_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
