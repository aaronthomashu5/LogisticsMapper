// Follow this setup guide to deploy:
// 1. Run `npx supabase functions new send-notification-email` (or use this file)
// 2. Set your Resend API key: `npx supabase secrets set RESEND_API_KEY=re_123...`
// 3. Deploy: `npx supabase functions deploy send-notification-email`

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface NotificationPayload {
  record: {
    user_id: string;
    title: string;
    message: string;
    type: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const { record } = await req.json() as NotificationPayload;

    // 1. Fetch User Email (using Service Role Key to bypass RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Simple fetch to Supabase Auth API or DB to get email
    // Since we can't access auth.users directly easily via client SDK without admin rights,
    // we'll use a direct DB query via the REST API if 'profiles' has the email (which we added!)
    
    const userRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${record.user_id}&select=email`, {
        headers: {
            'ApiKey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    
    const userData = await userRes.json();
    const userEmail = userData[0]?.email;

    if (!userEmail) {
        throw new Error(`No email found for user ${record.user_id}`);
    }

    // 2. Send Email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Warehouse Mapper <notifications@your-domain.com>", // Update this
        to: [userEmail],
        subject: record.title,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>${record.title}</h2>
            <p>${record.message}</p>
            <hr />
            <p style="font-size: 12px; color: #666;">
              Log in to Warehouse Mapper to view details.
            </p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
