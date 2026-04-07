
-- Create user_balances table
CREATE TABLE IF NOT EXISTS public.user_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  total_recharged numeric NOT NULL DEFAULT 0,
  total_consumed numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_balances'
      AND policyname = 'Users can view their own balance'
  ) THEN
    CREATE POLICY "Users can view their own balance" ON public.user_balances
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create recharge_records table
CREATE TABLE IF NOT EXISTS public.recharge_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recharge_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recharge_records'
      AND policyname = 'Users can view their own recharge records'
  ) THEN
    CREATE POLICY "Users can view their own recharge records" ON public.recharge_records
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create consumption_records table
CREATE TABLE IF NOT EXISTS public.consumption_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  operation_type text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consumption_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'consumption_records'
      AND policyname = 'Users can view their own consumption records'
  ) THEN
    CREATE POLICY "Users can view their own consumption records" ON public.consumption_records
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Function: get_user_balance
DROP FUNCTION IF EXISTS public.get_user_balance(uuid);
CREATE OR REPLACE FUNCTION public.get_user_balance(p_user_id uuid)
RETURNS TABLE(balance numeric, total_recharged numeric, total_consumed numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-create balance row if not exists
  INSERT INTO public.user_balances (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT ub.balance, ub.total_recharged, ub.total_consumed
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;
END;
$$;

-- Function: add_balance (recharge)
DROP FUNCTION IF EXISTS public.add_balance(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.add_balance(uuid, numeric, text, text);
CREATE OR REPLACE FUNCTION public.add_balance(p_user_id uuid, p_amount numeric, p_payment_method text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS TABLE(new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure balance row exists
  INSERT INTO public.user_balances (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update balance
  UPDATE public.user_balances
  SET balance = user_balances.balance + p_amount,
      total_recharged = user_balances.total_recharged + p_amount,
      updated_at = now()
  WHERE user_balances.user_id = p_user_id;

  -- Record recharge
  INSERT INTO public.recharge_records (user_id, amount, payment_method, notes)
  VALUES (p_user_id, p_amount, p_payment_method, p_notes);

  RETURN QUERY
  SELECT ub.balance FROM public.user_balances ub WHERE ub.user_id = p_user_id;
END;
$$;

-- Function: deduct_balance
DROP FUNCTION IF EXISTS public.deduct_balance(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.deduct_balance(uuid, numeric, text, text);
CREATE OR REPLACE FUNCTION public.deduct_balance(p_user_id uuid, p_amount numeric, p_operation_type text DEFAULT 'generate_image', p_description text DEFAULT NULL)
RETURNS TABLE(new_balance numeric, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bal numeric;
BEGIN
  -- Ensure balance row exists
  INSERT INTO public.user_balances (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ub.balance INTO current_bal FROM public.user_balances ub WHERE ub.user_id = p_user_id FOR UPDATE;

  IF current_bal < p_amount THEN
    RETURN QUERY SELECT current_bal, false;
    RETURN;
  END IF;

  UPDATE public.user_balances
  SET balance = user_balances.balance - p_amount,
      total_consumed = user_balances.total_consumed + p_amount,
      updated_at = now()
  WHERE user_balances.user_id = p_user_id;

  INSERT INTO public.consumption_records (user_id, amount, operation_type, description)
  VALUES (p_user_id, p_amount, p_operation_type, p_description);

  RETURN QUERY
  SELECT ub.balance, true FROM public.user_balances ub WHERE ub.user_id = p_user_id;
END;
$$;
