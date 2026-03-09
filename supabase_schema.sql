
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. PROFILES TABLE (RBAC)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profile Policies
-- (Moved to after helper functions to use is_admin())

-- Trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, is_approved)
  VALUES (
    new.id,
    new.email,
    'user',
    FALSE -- Default to pending approval
  )
  ON CONFLICT (id) DO NOTHING; -- Handle case where profile might already exist
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to avoid duplication errors during re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Helper Functions for RLS
-- SECURITY DEFINER is crucial here to avoid infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_approved = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profile Policies
-- Drop existing policies to allow clean re-run
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE USING (is_admin());


-- 1. LAYOUTS TABLE
CREATE TABLE IF NOT EXISTS layouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Kept for audit, not access control
    name TEXT NOT NULL,
    rows INTEGER NOT NULL,
    cols INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE layouts ENABLE ROW LEVEL SECURITY;
-- Shared Data Policy: Any approved user can View/Edit ALL layouts
DROP POLICY IF EXISTS "Approved users full access layouts" ON layouts;
CREATE POLICY "Approved users full access layouts" ON layouts FOR ALL USING (is_approved_user());

-- 2. SHELVES TABLE
CREATE TABLE IF NOT EXISTS shelves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    layout_id UUID REFERENCES layouts(id) ON DELETE CASCADE NOT NULL,
    row_index INTEGER NOT NULL,
    col_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    rack_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(layout_id, row_index, col_index)
);
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Approved users full access shelves" ON shelves;
CREATE POLICY "Approved users full access shelves" ON shelves FOR ALL USING (is_approved_user());

-- 3. STOCK ITEMS
CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'PCS',
    lot_number TEXT,
    specification TEXT,
    
    -- Location
    layout_id UUID REFERENCES layouts(id) ON DELETE SET NULL,
    shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL,
    rack_number INTEGER NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Approved users full access stock" ON stock_items;
CREATE POLICY "Approved users full access stock" ON stock_items FOR ALL USING (is_approved_user());

-- 4. PENDING ITEMS (Inbound)
CREATE TABLE IF NOT EXISTS pending_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit TEXT DEFAULT 'PCS',
    lot_number TEXT,
    specification TEXT,
    source TEXT CHECK (source IN ('EXCEL', 'OCR', 'MANUAL')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE pending_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Approved users full access pending" ON pending_items;
CREATE POLICY "Approved users full access pending" ON pending_items FOR ALL USING (is_approved_user());

-- 5. TRANSACTIONS (History)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    stock_item_id UUID, 
    item_name_snapshot TEXT NOT NULL,
    quantity_changed DECIMAL(10, 2) NOT NULL,
    timestamp BIGINT NOT NULL, 
    
    layout_id_snapshot UUID,
    shelf_id_snapshot UUID,
    rack_number_snapshot INTEGER,
    do_number TEXT,
    is_restocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Approved users full access transactions" ON transactions;
CREATE POLICY "Approved users full access transactions" ON transactions FOR ALL USING (is_approved_user());
