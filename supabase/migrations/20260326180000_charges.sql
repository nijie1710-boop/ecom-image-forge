-- Create user_balances table
CREATE TABLE public.user_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_recharged INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

-- Users can view their own balance
CREATE POLICY "Users can view their own balance" ON public.user_balances FOR SELECT USING (auth.uid() = user_id);
-- Users can update their own balance (for manual top-ups)
CREATE POLICY "Users can update their own balance" ON public.user_balances FOR UPDATE USING (auth.uid() = user_id);
-- Service role can do anything (for edge functions)
CREATE POLICY "Service role can manage all balances" ON public.user_balances FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_user_balances_updated_at BEFORE UPDATE ON public.user_balances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create recharge_records table
CREATE TABLE public.recharge_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  payment_screenshot TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  notes TEXT,
  reviewed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.recharge_records ENABLE ROW LEVEL SECURITY;

-- Users can view their own recharge records
CREATE POLICY "Users can view their own recharge records" ON public.recharge_records FOR SELECT USING (auth.uid() = user_id);
-- Users can insert their own recharge records
CREATE POLICY "Users can insert their own recharge records" ON public.recharge_records FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Service role can manage all records
CREATE POLICY "Service role can manage all recharge records" ON public.recharge_records FOR ALL USING (true) WITH CHECK (true);

-- Create consumption_records table
CREATE TABLE public.consumption_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount < 0),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('generate_image', 'generate_copy', 'translate_image', 'manual_adjustment')),
  description TEXT,
  related_record_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.consumption_records ENABLE ROW LEVEL SECURITY;

-- Users can view their own consumption records
CREATE POLICY "Users can view their own consumption records" ON public.consumption_records FOR SELECT USING (auth.uid() = user_id);
-- Service role can manage all records
CREATE POLICY "Service role can manage all consumption records" ON public.consumption_records FOR ALL USING (true) WITH CHECK (true);

-- Function to add balance (for manual recharge)
CREATE OR REPLACE FUNCTION public.add_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT) AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, '充值金额必须大于0'::TEXT;
    RETURN;
  END IF;

  -- Check if user_balances record exists, if not create one
  IF NOT EXISTS (SELECT 1 FROM public.user_balances WHERE user_id = p_user_id) THEN
    INSERT INTO public.user_balances (user_id, balance) VALUES (p_user_id, 0);
  END IF;

  -- Update balance
  UPDATE public.user_balances
  SET balance = balance + p_amount,
      total_recharged = total_recharged + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Create recharge record
  INSERT INTO public.recharge_records (user_id, amount, payment_method, status, notes, completed_at)
  VALUES (p_user_id, p_amount, p_payment_method, 'completed', p_notes, now());

  -- Create consumption record (positive = income)
  INSERT INTO public.consumption_records (user_id, amount, operation_type, description)
  VALUES (p_user_id, p_amount, 'manual_adjustment', COALESCE(p_notes, '手动充值'));

  RETURN QUERY SELECT true, v_new_balance, '充值成功'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to deduct balance (for image generation)
CREATE OR REPLACE FUNCTION public.deduct_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation_type TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT) AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, '扣除金额必须大于0'::TEXT;
    RETURN;
  END IF;

  -- Check if user_balances record exists
  IF NOT EXISTS (SELECT 1 FROM public.user_balances WHERE user_id = p_user_id) THEN
    -- Auto create with 0 balance
    INSERT INTO public.user_balances (user_id, balance) VALUES (p_user_id, 0);
  END IF;

  -- Get current balance
  SELECT balance INTO v_current_balance FROM public.user_balances WHERE user_id = p_user_id;

  -- Check sufficient balance
  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, v_current_balance, '余额不足'::TEXT;
    RETURN;
  END IF;

  -- Deduct balance
  UPDATE public.user_balances
  SET balance = balance - p_amount,
      total_consumed = total_consumed + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Create consumption record (negative = expense)
  INSERT INTO public.consumption_records (user_id, amount, operation_type, description)
  VALUES (p_user_id, -p_amount, p_operation_type, COALESCE(p_description, '消费'));

  RETURN QUERY SELECT true, v_new_balance, '扣费成功'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get user balance info
CREATE OR REPLACE FUNCTION public.get_user_balance(p_user_id UUID)
RETURNS TABLE(
  balance INTEGER,
  total_recharged INTEGER,
  total_consumed INTEGER,
  recharge_count BIGINT,
  consumption_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(ub.balance, 0)::INTEGER,
    COALESCE(ub.total_recharged, 0)::INTEGER,
    COALESCE(ub.total_consumed, 0)::INTEGER,
    (SELECT COUNT(*) FROM public.recharge_records WHERE user_id = p_user_id AND status = 'completed')::BIGINT,
    (SELECT COUNT(*) FROM public.consumption_records WHERE user_id = p_user_id)::BIGINT
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Auto-create user_balance when new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_balances (user_id, balance)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_balance
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_balance();
