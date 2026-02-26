-- 1. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('STOCK_ADDED', 'STOCK_LOW', 'SYSTEM')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 2. Function to Notify Division Users
CREATE OR REPLACE FUNCTION notify_division_on_stock_change()
RETURNS TRIGGER AS $$
DECLARE
  item_name TEXT;
  qty_change DECIMAL;
  layout_id_val UUID;
  division_ids UUID[];
  recipient_ids UUID[];
  recipient_id UUID;
BEGIN
  -- Determine if it's an INSERT or UPDATE (Restock)
  IF (TG_OP = 'INSERT') THEN
    item_name := NEW.name;
    qty_change := NEW.quantity;
    layout_id_val := NEW.layout_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only notify if quantity increased
    IF NEW.quantity <= OLD.quantity THEN
      RETURN NEW;
    END IF;
    item_name := NEW.name;
    qty_change := NEW.quantity - OLD.quantity;
    layout_id_val := NEW.layout_id;
  END IF;

  -- 1. Get Divisions for this Layout
  SELECT ARRAY_AGG(division_id) INTO division_ids
  FROM layout_divisions
  WHERE layout_id = layout_id_val;

  -- 2. Find Recipients
  -- Users in the specific divisions OR Users in 'Logistics' (who see all)
  SELECT ARRAY_AGG(DISTINCT ud.user_id) INTO recipient_ids
  FROM user_divisions ud
  JOIN divisions d ON ud.division_id = d.id
  WHERE 
    (division_ids IS NOT NULL AND ud.division_id = ANY(division_ids))
    OR d.name = 'Logistics';

  -- 3. Insert Notifications
  IF recipient_ids IS NOT NULL THEN
    FOREACH recipient_id IN ARRAY recipient_ids
    LOOP
      -- Don't notify the person who made the change (optional, but usually good UX to skip)
      -- However, auth.uid() might not be available in all trigger contexts depending on setup,
      -- but usually is in Supabase. Let's include everyone for now to be safe.
      
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (
        recipient_id,
        'New Stock Added',
        format('Item "%s" (+%s) was added to a layout in your division.', item_name, qty_change),
        'STOCK_ADDED'
      );
      
      -- NOTE: To send actual Emails:
      -- In a production Supabase environment, you would trigger an Edge Function here
      -- using `pg_net` or a webhook to call a service like Resend/SendGrid.
      -- Example: PERFORM net.http_post(url := 'https://api.resend.com/emails', ...);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach Trigger
DROP TRIGGER IF EXISTS on_stock_added ON stock_items;
CREATE TRIGGER on_stock_added
  AFTER INSERT OR UPDATE ON stock_items
  FOR EACH ROW
  EXECUTE PROCEDURE notify_division_on_stock_change();
