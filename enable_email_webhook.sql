-- 1. Enable pg_net extension (Required for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create Trigger Function to Call Edge Function
CREATE OR REPLACE FUNCTION trigger_email_notification()
RETURNS TRIGGER AS $$
DECLARE
  -- Replace with your actual Edge Function URL
  -- e.g., 'https://your-project-ref.supabase.co/functions/v1/send-notification-email'
  edge_function_url TEXT := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notification-email';
  service_role_key TEXT := 'YOUR_SERVICE_ROLE_KEY'; -- Use Vault in production
BEGIN
  -- Only send email for certain notification types if desired
  IF NEW.type = 'STOCK_ADDED' THEN
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object('record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach Trigger to Notifications Table
DROP TRIGGER IF EXISTS on_notification_created ON notifications;
CREATE TRIGGER on_notification_created
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE PROCEDURE trigger_email_notification();
