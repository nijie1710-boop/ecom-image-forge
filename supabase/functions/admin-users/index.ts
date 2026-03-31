import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user token
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "无管理员权限" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, userId, amount, notes } = await req.json();

    switch (action) {
      case "list_users": {
        // Get all users with balances
        const { data: balances, error } = await supabase
          .from("user_balances")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;

        // Get auth users info via admin API
        const { data: { users: authUsers }, error: usersError } = await supabase.auth.admin.listUsers();
        if (usersError) throw usersError;

        const userMap = new Map(authUsers.map(u => [u.id, u]));
        const result = (balances || []).map(b => {
          const authUser = userMap.get(b.user_id);
          return {
            ...b,
            email: authUser?.email || "未知",
            created_at_auth: authUser?.created_at,
          };
        });

        // Also add users without balance records
        for (const au of authUsers) {
          if (!balances?.find(b => b.user_id === au.id)) {
            result.push({
              user_id: au.id,
              balance: 0,
              total_recharged: 0,
              total_consumed: 0,
              email: au.email || "未知",
              created_at: au.created_at,
              created_at_auth: au.created_at,
              id: null,
              updated_at: null,
            });
          }
        }

        return new Response(JSON.stringify({ users: result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "add_credits": {
        if (!userId || !amount || amount <= 0) {
          return new Response(JSON.stringify({ error: "参数错误" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabase.rpc("add_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_payment_method: "admin_manual",
          p_notes: notes || "管理员手动充值",
        });
        if (error) throw error;
        return new Response(JSON.stringify({ result: data[0] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "未知操作" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
