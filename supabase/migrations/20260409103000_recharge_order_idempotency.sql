alter table public.recharge_records
  add column if not exists source_order_no text;

create unique index if not exists idx_recharge_records_source_order_no
  on public.recharge_records (source_order_no)
  where source_order_no is not null;

drop function if exists public.apply_recharge_order_payment(text, text, text, jsonb);
create or replace function public.apply_recharge_order_payment(
  p_order_no text,
  p_trade_no text default null,
  p_buyer_logon_id text default null,
  p_raw_notify jsonb default '{}'::jsonb
)
returns table(
  applied boolean,
  order_status text,
  new_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.recharge_orders%rowtype;
  v_balance numeric;
begin
  select *
  into v_order
  from public.recharge_orders
  where order_no = p_order_no
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  insert into public.user_balances (user_id, balance)
  values (v_order.user_id, 0)
  on conflict (user_id) do nothing;

  if v_order.status = 'paid'
     or exists (
       select 1
       from public.recharge_records rr
       where rr.source_order_no = p_order_no
     ) then
    update public.recharge_orders
    set status = 'paid',
        trade_no = coalesce(v_order.trade_no, p_trade_no),
        buyer_logon_id = coalesce(v_order.buyer_logon_id, p_buyer_logon_id),
        paid_at = coalesce(v_order.paid_at, now()),
        raw_notify = coalesce(p_raw_notify, v_order.raw_notify),
        updated_at = now()
    where id = v_order.id;

    select ub.balance::numeric
    into v_balance
    from public.user_balances ub
    where ub.user_id = v_order.user_id;

    return query select false, 'paid'::text, coalesce(v_balance, 0)::numeric;
    return;
  end if;

  update public.user_balances
  set balance = user_balances.balance + v_order.credits,
      total_recharged = user_balances.total_recharged + v_order.credits,
      updated_at = now()
  where user_balances.user_id = v_order.user_id
  returning balance::numeric into v_balance;

  insert into public.recharge_records (
    user_id,
    amount,
    payment_method,
    status,
    notes,
    completed_at,
    source_order_no
  )
  values (
    v_order.user_id,
    v_order.credits,
    coalesce(v_order.payment_channel, 'alipay_page'),
    'completed',
    coalesce(v_order.notes, '支付宝支付订单 ' || v_order.order_no),
    now(),
    p_order_no
  );

  update public.recharge_orders
  set status = 'paid',
      trade_no = p_trade_no,
      buyer_logon_id = p_buyer_logon_id,
      paid_at = coalesce(v_order.paid_at, now()),
      raw_notify = coalesce(p_raw_notify, raw_notify),
      updated_at = now()
  where id = v_order.id;

  return query select true, 'paid'::text, coalesce(v_balance, 0)::numeric;
end;
$$;

