-- ============================================================
-- recharge_orders: 记录每笔支付宝下单请求
-- apply_recharge_order_payment: 幂等地完成一笔订单的积分发放
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recharge_orders (
  id               UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_no         TEXT                     NOT NULL UNIQUE,
  package_id       TEXT                     NOT NULL,
  package_label    TEXT,
  amount           NUMERIC(10, 2)           NOT NULL,
  credits          INTEGER                  NOT NULL CHECK (credits > 0),
  payment_channel  TEXT                     NOT NULL DEFAULT 'alipay_page',
  status           TEXT                     NOT NULL DEFAULT 'pending',
  subject          TEXT,
  notes            TEXT,
  trade_no         TEXT,
  buyer_logon_id   TEXT,
  raw_notify       JSONB,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paid_at          TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_recharge_orders_user_id  ON public.recharge_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_order_no ON public.recharge_orders (order_no);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_status   ON public.recharge_orders (status);

ALTER TABLE public.recharge_orders ENABLE ROW LEVEL SECURITY;

-- 用户只能查自己的订单
CREATE POLICY "Users can view their own recharge orders"
  ON public.recharge_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Service role（Vercel API）可以做任何操作
CREATE POLICY "Service role can manage all recharge orders"
  ON public.recharge_orders FOR ALL
  USING (true) WITH CHECK (true);

-- 自动维护 updated_at
CREATE TRIGGER update_recharge_orders_updated_at
  BEFORE UPDATE ON public.recharge_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- apply_recharge_order_payment
--   幂等：同一订单重复调用只发放一次积分
--   并发安全：FOR UPDATE 锁住行，防止并发双重发放
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_recharge_order_payment(
  p_order_no       TEXT,
  p_trade_no       TEXT    DEFAULT NULL,
  p_buyer_logon_id TEXT    DEFAULT NULL,
  p_raw_notify     JSONB   DEFAULT NULL
)
RETURNS TABLE(order_id UUID, user_id UUID, credits INTEGER, new_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  public.recharge_orders%ROWTYPE;
  v_balance NUMERIC;
BEGIN
  -- 用 FOR UPDATE 锁行，防止并发重复发积分
  SELECT * INTO v_order
  FROM public.recharge_orders
  WHERE order_no = p_order_no
  FOR UPDATE;

  IF NOT FOUND THEN
    -- 返回空集合 → 调用方视为 404
    RETURN;
  END IF;

  -- 幂等：已经是 paid 状态，直接返回当前余额，不再发积分
  IF v_order.status = 'paid' THEN
    SELECT ub.balance INTO v_balance
    FROM public.user_balances ub
    WHERE ub.user_id = v_order.user_id;

    RETURN QUERY
      SELECT v_order.id, v_order.user_id, v_order.credits, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  -- 给用户加积分并写 recharge_records
  SELECT nb.new_balance INTO v_balance
  FROM public.add_balance(
    v_order.user_id,
    v_order.credits::NUMERIC,
    v_order.payment_channel,
    '支付宝订单 ' || v_order.order_no
  ) nb;

  -- 更新订单状态
  UPDATE public.recharge_orders
  SET
    status         = 'paid',
    trade_no       = COALESCE(p_trade_no,       trade_no),
    buyer_logon_id = COALESCE(p_buyer_logon_id, buyer_logon_id),
    paid_at        = now(),
    raw_notify     = COALESCE(p_raw_notify,     raw_notify),
    updated_at     = now()
  WHERE id = v_order.id;

  RETURN QUERY
    SELECT v_order.id, v_order.user_id, v_order.credits, COALESCE(v_balance, 0);
END;
$$;
