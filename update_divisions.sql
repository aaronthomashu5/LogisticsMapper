-- 1. Divisions Table
CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;

-- Policies for divisions
DROP POLICY IF EXISTS "Admins manage divisions" ON divisions;
DROP POLICY IF EXISTS "Users view divisions" ON divisions;
CREATE POLICY "Admins manage divisions" ON divisions FOR ALL USING (is_admin());
CREATE POLICY "Users view divisions" ON divisions FOR SELECT USING (true);

-- Seed default divisions
INSERT INTO divisions (name) VALUES ('Service'), ('Sales'), ('Logistics') ON CONFLICT (name) DO NOTHING;

-- 2. User Divisions (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_divisions (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, division_id)
);
ALTER TABLE user_divisions ENABLE ROW LEVEL SECURITY;

-- Policies for user_divisions
DROP POLICY IF EXISTS "Admins manage user_divisions" ON user_divisions;
DROP POLICY IF EXISTS "Users view own divisions" ON user_divisions;
CREATE POLICY "Admins manage user_divisions" ON user_divisions FOR ALL USING (is_admin());
CREATE POLICY "Users view own divisions" ON user_divisions FOR SELECT USING (auth.uid() = user_id);

-- 3. Layout Divisions (Many-to-Many)
CREATE TABLE IF NOT EXISTS layout_divisions (
  layout_id UUID REFERENCES layouts(id) ON DELETE CASCADE,
  division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
  PRIMARY KEY (layout_id, division_id)
);
ALTER TABLE layout_divisions ENABLE ROW LEVEL SECURITY;

-- Policies for layout_divisions
DROP POLICY IF EXISTS "Admins manage layout_divisions" ON layout_divisions;
DROP POLICY IF EXISTS "Users view layout_divisions" ON layout_divisions;
CREATE POLICY "Admins manage layout_divisions" ON layout_divisions FOR ALL USING (is_admin());
CREATE POLICY "Users view layout_divisions" ON layout_divisions FOR SELECT USING (true);

-- 4. Helper function to check if user has access to layout
CREATE OR REPLACE FUNCTION public.has_layout_access(target_layout_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_logistics BOOLEAN;
BEGIN
  -- Check if user is admin (always access)
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- Check if user is in Logistics
  SELECT EXISTS (
    SELECT 1 FROM user_divisions ud
    JOIN divisions d ON ud.division_id = d.id
    WHERE ud.user_id = auth.uid() AND d.name = 'Logistics'
  ) INTO is_logistics;

  IF is_logistics THEN
    RETURN TRUE;
  END IF;

  -- Check if user shares a division with the layout
  RETURN EXISTS (
    SELECT 1 FROM layout_divisions ld
    JOIN user_divisions ud ON ld.division_id = ud.division_id
    WHERE ld.layout_id = target_layout_id
    AND ud.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update Layouts Policy
DROP POLICY IF EXISTS "Approved users full access layouts" ON layouts;
CREATE POLICY "Division based layout access" ON layouts FOR SELECT USING (
  public.is_approved_user() AND public.has_layout_access(id)
);
CREATE POLICY "Division based layout insert" ON layouts FOR INSERT WITH CHECK (
  public.is_approved_user()
);
CREATE POLICY "Division based layout update" ON layouts FOR UPDATE USING (
  public.is_approved_user() AND public.has_layout_access(id)
);
CREATE POLICY "Division based layout delete" ON layouts FOR DELETE USING (
  public.is_approved_user() AND public.has_layout_access(id)
);

-- 6. Update Stock Items Policy (Dependent on Layout)
DROP POLICY IF EXISTS "Approved users full access stock" ON stock_items;
CREATE POLICY "Division based stock access" ON stock_items FOR ALL USING (
  public.is_approved_user() AND (
    layout_id IS NULL OR public.has_layout_access(layout_id)
  )
);

-- 7. Update Shelves Policy
DROP POLICY IF EXISTS "Approved users full access shelves" ON shelves;
CREATE POLICY "Division based shelf access" ON shelves FOR ALL USING (
  public.is_approved_user() AND public.has_layout_access(layout_id)
);

-- 8. Update Transactions Policy
DROP POLICY IF EXISTS "Approved users full access transactions" ON transactions;
CREATE POLICY "Division based transaction access" ON transactions FOR ALL USING (
  public.is_approved_user() AND (
    layout_id_snapshot IS NULL OR public.has_layout_access(layout_id_snapshot)
  )
);
