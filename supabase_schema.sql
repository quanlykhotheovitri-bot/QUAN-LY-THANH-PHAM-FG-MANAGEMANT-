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
    location_path TEXT,
    total_boxes INTEGER,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT now(),
    device_info TEXT
);

-- 6. Outbound Transactions
CREATE TABLE IF NOT EXISTS outbound_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT DEFAULT 'SCAN', -- 'SCAN' or 'PL'
    qr_code TEXT NOT NULL,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    pl_no TEXT,
    quantity INTEGER NOT NULL,
    scan_count INTEGER DEFAULT 0,
    location_path TEXT,
    status TEXT DEFAULT 'completed',
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    device_info TEXT
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_outbound_type ON outbound_transactions(type);
CREATE INDEX IF NOT EXISTS idx_outbound_created_at ON outbound_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_rpro ON outbound_transactions(rpro);
CREATE INDEX IF NOT EXISTS idx_outbound_so ON outbound_transactions(so);

-- 7. Inventory Balances (TỒN KHO - Gộp theo QR Code)
CREATE TABLE IF NOT EXISTS inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code TEXT NOT NULL UNIQUE,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    box_type TEXT,
    total_boxes INTEGER,
    location_path TEXT,
    last_updated TIMESTAMPTZ DEFAULT now()
);

-- 8. Inventory Movements
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    qr_code TEXT NOT NULL,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    from_location TEXT,
    to_location TEXT,
    quantity INTEGER NOT NULL,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    remark TEXT
);

-- 10. Upsert Inventory Balance Function (Updated for merged locations)
CREATE OR REPLACE FUNCTION upsert_inventory_balance(
    p_qr_code TEXT,
    p_so TEXT,
    p_rpro TEXT,
    p_kh TEXT,
    p_quantity INTEGER,
    p_box_type TEXT,
    p_location_path TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO inventory_balances (qr_code, so, rpro, kh, quantity, box_type, location_path, last_updated)
    VALUES (p_qr_code, p_so, p_rpro, p_kh, p_quantity, p_box_type, p_location_path, now())
    ON CONFLICT (qr_code)
    DO UPDATE SET
        quantity = inventory_balances.quantity + EXCLUDED.quantity,
        -- Thêm vị trí mới vào đầu nếu chưa tồn tại
        location_path = CASE 
            WHEN inventory_balances.location_path LIKE '%' || EXCLUDED.location_path || '%' THEN inventory_balances.location_path
            ELSE EXCLUDED.location_path || ', ' || inventory_balances.location_path
        END,
        last_updated = now();
END;
$$ LANGUAGE plpgsql;

-- 11. Process Batch Inbound Function (Bulk Optimized)
DROP FUNCTION IF EXISTS process_inbound_v5(JSONB);

CREATE OR REPLACE FUNCTION process_inbound_v5(
    p_data JSONB
) RETURNS VOID AS $$
DECLARE
    v_device_info TEXT;
BEGIN
    v_device_info := p_data->>'device_info';

    -- 1. Insert Inbound Transactions in bulk
    INSERT INTO inbound_transactions (
        qr_code, so, rpro, kh, quantity, box_type, total_boxes, location_path, device_info, status
    )
    SELECT 
        (elem->>'qrCode'),
        (elem->>'so'),
        (elem->>'rpro'),
        (elem->>'kh'),
        COALESCE((elem->>'quantity')::INTEGER, 1),
        (elem->>'boxType'),
        COALESCE((elem->>'totalBoxes')::INTEGER, 1),
        (elem->>'locationPath'),
        v_device_info,
        'completed'
    FROM jsonb_array_elements(p_data->'items') AS elem;

    -- 2. Upsert Inventory Balances in bulk
    INSERT INTO inventory_balances (qr_code, so, rpro, kh, quantity, box_type, total_boxes, location_path, last_updated)
    SELECT 
        (elem->>'qrCode'),
        (elem->>'so'),
        (elem->>'rpro'),
        COALESCE(
            NULLIF((elem->>'kh'), ''), 
            (
                SELECT kh FROM source_import_lines sil 
                WHERE (NULLIF((elem->>'rpro'), '') IS NOT NULL AND sil.rpro = (elem->>'rpro'))
                   OR (NULLIF((elem->>'so'), '') IS NOT NULL AND sil.so = (elem->>'so'))
                LIMIT 1
            )
        ),
        COALESCE((elem->>'quantity')::INTEGER, 1),
        (elem->>'boxType'),
        COALESCE(
            NULLIF((elem->>'totalBoxes')::INTEGER, 0), 
            (
                SELECT quantity FROM source_import_lines sil 
                WHERE (NULLIF((elem->>'rpro'), '') IS NOT NULL AND sil.rpro = (elem->>'rpro'))
                   OR (NULLIF((elem->>'so'), '') IS NOT NULL AND sil.so = (elem->>'so'))
                LIMIT 1
            ),
            1
        ),
        (elem->>'locationPath'),
        now()
    FROM jsonb_array_elements(p_data->'items') AS elem
    ON CONFLICT (qr_code)
    DO UPDATE SET
        quantity = inventory_balances.quantity + EXCLUDED.quantity,
        total_boxes = COALESCE(NULLIF(EXCLUDED.total_boxes, 0), inventory_balances.total_boxes),
        kh = COALESCE(NULLIF(EXCLUDED.kh, ''), inventory_balances.kh),
        so = COALESCE(NULLIF(EXCLUDED.so, ''), inventory_balances.so),
        rpro = COALESCE(NULLIF(EXCLUDED.rpro, ''), inventory_balances.rpro),
        location_path = CASE 
            WHEN inventory_balances.location_path IS NULL OR inventory_balances.location_path = '' THEN EXCLUDED.location_path
            WHEN inventory_balances.location_path LIKE '%' || EXCLUDED.location_path || '%' THEN inventory_balances.location_path
            ELSE EXCLUDED.location_path || ', ' || inventory_balances.location_path
        END,
        last_updated = now();

    -- 3. Record Movements in bulk
    INSERT INTO inventory_movements (
        type, qr_code, so, rpro, kh, to_location, quantity, remark
    )
    SELECT 
        'INBOUND',
        (elem->>'qrCode'),
        (elem->>'so'),
        (elem->>'rpro'),
        (elem->>'kh'),
        (elem->>'locationPath'),
        COALESCE((elem->>'quantity')::INTEGER, 1),
        'Nhập kho (Bulk Process)'
    FROM jsonb_array_elements(p_data->'items') AS elem;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. View for Grouped Inventory (Optimized for Frontend)
CREATE OR REPLACE VIEW inventory_by_rpro AS
SELECT 
    MAX(so) as so,
    rpro,
    MAX(kh) as kh,
    SUM(quantity) as total_quantity,
    COUNT(*) as items_count,
    -- Lấy loại thùng mới nhất
    (ARRAY_AGG(box_type ORDER BY last_updated DESC))[1] as box_type,
    -- Gộp TẤT CẢ vị trí duy nhất của tất cả các mã QR trong nhóm RPRO này
    (
        SELECT string_agg(loc, ', ')
        FROM (
            SELECT DISTINCT trim(unnest(string_to_array(ib2.location_path, ','))) as loc, MAX(ib2.last_updated) as max_upd
            FROM inventory_balances ib2
            WHERE (ib2.rpro = ib.rpro OR (ib2.rpro IS NULL AND ib.rpro IS NULL))
            GROUP BY loc
            ORDER BY max_upd DESC
        ) t
    ) as location_path,
    MAX(last_updated) as last_updated,
    MAX(total_boxes) as total_boxes
FROM inventory_balances ib
GROUP BY rpro;

-- 13. Process Batch Outbound Function (Bulk Optimized)
CREATE OR REPLACE FUNCTION process_outbound_v1(
    p_data JSONB
) RETURNS VOID AS $$
DECLARE
    v_device_info TEXT;
    v_item RECORD;
BEGIN
    v_device_info := p_data->>'device_info';

    -- 1. Insert Outbound Transactions in bulk (Only for unsaved items)
    INSERT INTO outbound_transactions (
        type, qr_code, so, rpro, kh, pl_no, quantity, location_path, status, note, device_info
    )
    SELECT 
        'SCAN',
        (elem->>'qrCode'),
        (elem->>'so'),
        (elem->>'rpro'),
        (elem->>'kh'),
        (elem->>'plNo'),
        COALESCE((elem->>'outQty')::INTEGER, 1),
        (elem->>'locationPath'),
        CASE WHEN lower(elem->>'status') = 'ok' THEN 'completed' ELSE 'warning' END,
        (elem->>'note'),
        v_device_info
    FROM jsonb_array_elements(p_data->'items') AS elem
    WHERE (elem->>'isSaved')::BOOLEAN IS NOT TRUE;

    -- 2. Update Inventory Balances and Record Movements
    FOR v_item IN SELECT 
        (elem->>'qrCode') as qr_code,
        NULLIF(elem->>'inventoryId', '')::UUID as inv_id,
        COALESCE((elem->>'outQty')::INTEGER, 1) as qty,
        (elem->>'locationPath') as loc,
        (elem->>'note') as note
    FROM jsonb_array_elements(p_data->'items') AS elem
    LOOP
        -- Update Inventory only if we have a valid ID
        IF v_item.inv_id IS NOT NULL THEN
            UPDATE inventory_balances 
            SET quantity = quantity - v_item.qty,
                last_updated = now()
            WHERE id = v_item.inv_id;
        END IF;

        -- Record Movement
        INSERT INTO inventory_movements (
            type, qr_code, so, rpro, kh, from_location, quantity, remark
        ) VALUES (
            'OUTBOUND',
            v_item.qr_code,
            v_item.so,
            v_item.rpro,
            v_item.kh,
            v_item.loc,
            v_item.qty,
            'Xuất kho: ' || COALESCE(v_item.note, 'Bình thường')
        );
    END LOOP;

    -- 3. Cleanup: Delete zero/negative inventory
    DELETE FROM inventory_balances WHERE quantity <= 0;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION process_transfer_v1(
    p_data JSONB
) RETURNS VOID AS $$
DECLARE
    v_device_info TEXT;
BEGIN
    v_device_info := p_data->>'device_info';

    -- 1. Update Inventory Balances
    -- We use a join with the incoming JSON to update in one shot
    UPDATE inventory_balances ib
    SET location_path = t.to_location,
        last_updated = now()
    FROM jsonb_to_recordset(p_data->'items') AS t(id UUID, to_location TEXT)
    WHERE ib.id = t.id;

    -- 2. Record Movements in bulk
    INSERT INTO inventory_movements (
        type, qr_code, so, rpro, kh, from_location, to_location, quantity, remark
    )
    SELECT 
        'TRANSFER',
        (elem->>'qrCode'),
        (elem->>'so'),
        (elem->>'rpro'),
        (elem->>'kh'),
        (elem->>'fromLocation'),
        (elem->>'toLocation'),
        COALESCE((elem->>'quantity')::INTEGER, 1),
        COALESCE((elem->>'remark'), 'Chuyển vị trí hàng (Bulk RPC)')
    FROM jsonb_array_elements(p_data->'items') AS elem;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- 14. Current PL Items (Danh sách PL hiện tại - Persisted)
CREATE TABLE IF NOT EXISTS current_pl_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so TEXT,
    rpro TEXT,
    kh TEXT,
    pl_no TEXT,
    qty INTEGER,
    total_boxes INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Current Scanned Items (Danh sách Scan xuất hiện tại - Persisted)
CREATE TABLE IF NOT EXISTS current_scanned_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code TEXT NOT NULL,
    so TEXT,
    rpro TEXT,
    kh TEXT,
    total_boxes INTEGER,
    status TEXT,
    note TEXT,
    out_qty INTEGER,
    pl_no TEXT,
    location_path TEXT,
    is_saved BOOLEAN DEFAULT FALSE,
    scan_date TIMESTAMPTZ,
    inventory_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS (Simplified for no auth)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE source_import_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE source_import_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE current_pl_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE current_scanned_items DISABLE ROW LEVEL SECURITY;

-- 16. Plastic Bin Management
CREATE TABLE IF NOT EXISTS plastic_bin_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plastic_bin_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_date TIMESTAMPTZ DEFAULT now(),
    qrcode TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    quantity_large INTEGER DEFAULT 0,
    quantity_small INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE plastic_bin_customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE plastic_bin_returns DISABLE ROW LEVEL SECURITY;
