insert into public.admin_settings (key, value)
values
  (
    'recharge_packages',
    '[
      {"id":"starter","label":"体验包","price":19.9,"credits":200,"badge":"适合试用","highlight":false},
      {"id":"growth","label":"常用包","price":49.9,"credits":520,"badge":"推荐","highlight":true},
      {"id":"pro","label":"进阶包","price":99,"credits":1080,"badge":"更省单价","highlight":false},
      {"id":"business","label":"商用包","price":199,"credits":2280,"badge":"高频创作","highlight":false}
    ]'::jsonb
  ),
  (
    'credit_rules',
    '{
      "generation":{"nanoBanana":5,"nanoBanana2":7,"nanoBananaPro":12},
      "detail":{"planning":2,"nanoBanana":6,"nanoBanana2":8,"nanoBananaPro":14},
      "translation":{"basic":4,"refined":6}
    }'::jsonb
  )
on conflict (key) do nothing;
