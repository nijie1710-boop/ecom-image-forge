DROP FUNCTION IF EXISTS public.add_balance(uuid, numeric, text, text);
CREATE OR REPLACE FUNCTION public.add_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_balances (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_balances
  SET balance = user_balances.balance + p_amount,
      total_recharged = user_balances.total_recharged + p_amount,
      updated_at = now()
  WHERE user_balances.user_id = p_user_id;

  INSERT INTO public.recharge_records (user_id, amount, payment_method, notes)
  VALUES (p_user_id, p_amount, p_payment_method, p_notes);

  RETURN QUERY
  SELECT ub.balance::numeric
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.deduct_balance(uuid, numeric, text, text);
CREATE OR REPLACE FUNCTION public.deduct_balance(
  p_user_id uuid,
  p_amount numeric,
  p_operation_type text DEFAULT 'generate_image',
  p_description text DEFAULT NULL
)
RETURNS TABLE(new_balance numeric, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bal numeric;
BEGIN
  INSERT INTO public.user_balances (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ub.balance INTO current_bal
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id
  FOR UPDATE;

  IF current_bal < p_amount THEN
    RETURN QUERY SELECT current_bal::numeric, false;
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
  SELECT ub.balance::numeric, true
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;
END;
$$;
