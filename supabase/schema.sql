-- ============================================================
-- 사무실 공용 물품 관리 앱 - Supabase 스키마
-- (PRD.md 9장 기준 / Supabase project: zxojwktfmanqypkxjnpp)
-- ============================================================

-- ------------------------------------------------------------
-- items: 물품 마스터
-- ------------------------------------------------------------

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('문구류', '전자기기', '청소용품', '기타')),
  quantity integer not null default 0 check (quantity >= 0),
  target_quantity integer not null default 0 check (target_quantity >= 0),
  received_date date not null default current_date,
  created_by_nickname text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at
before update on public.items
for each row
execute function public.set_updated_at();

-- RLS: 로그인 없는 사내 도구 -> anon 키로 전체 read/write 허용
-- 주의: URL이 외부로 유출되면 누구나 읽고 쓸 수 있다. 사내망/사내 링크 공유 환경 전제.
alter table public.items enable row level security;

drop policy if exists "anon_full_access_items" on public.items;
create policy "anon_full_access_items"
on public.items
for all
to anon
using (true)
with check (true);

-- ------------------------------------------------------------
-- item_logs: 수량 변경 이력 (누가/언제/무엇을/얼마나) - 감사 추적용
-- 물품이 삭제돼도 이력은 남아야 하므로 이름을 스냅샷으로 별도 저장한다.
-- ------------------------------------------------------------

create table if not exists public.item_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete set null,
  item_name_snapshot text not null,
  action text not null check (action in ('CREATE', 'INCREASE', 'DECREASE', 'DELETE', 'IMPORT')),
  quantity_before integer,
  quantity_after integer,
  quantity_change integer,
  actor_nickname text not null,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_item_logs_created_at on public.item_logs (created_at desc);
create index if not exists idx_item_logs_item_id on public.item_logs (item_id);

alter table public.item_logs enable row level security;

-- 조회는 누구나, 기록 추가도 누구나 가능. update/delete 정책은 두지 않아
-- 로그가 사후에 수정/삭제되지 않는 append-only 구조로 유지한다.
drop policy if exists "anon_read_item_logs" on public.item_logs;
create policy "anon_read_item_logs"
on public.item_logs
for select
to anon
using (true);

drop policy if exists "anon_insert_item_logs" on public.item_logs;
create policy "anon_insert_item_logs"
on public.item_logs
for insert
to anon
with check (true);

-- ------------------------------------------------------------
-- 수량 증가/감소 함수
-- SELECT ... FOR UPDATE로 행 잠금을 잡은 채 증감을 계산해 반영하므로
-- 두 사람이 동시에 눌러도 값이 유실되지 않고, item_logs에 남는
-- before/after 값도 항상 정확하다. 같은 함수 안에서 items 갱신과
-- item_logs 기록이 하나의 트랜잭션으로 함께 처리된다.
-- ------------------------------------------------------------

create or replace function public.increase_item_quantity(p_item_id uuid, p_amount integer, p_actor_nickname text)
returns public.items
language plpgsql
as $$
declare
  v_before integer;
  v_after integer;
  v_item public.items;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be a positive integer, got %', p_amount;
  end if;
  if p_actor_nickname is null or length(trim(p_actor_nickname)) = 0 then
    raise exception 'p_actor_nickname is required';
  end if;

  select quantity into v_before
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'item % not found', p_item_id;
  end if;

  v_after := v_before + p_amount;

  update public.items
  set quantity = v_after
  where id = p_item_id
  returning * into v_item;

  insert into public.item_logs
    (item_id, item_name_snapshot, action, quantity_before, quantity_after, quantity_change, actor_nickname)
  values
    (v_item.id, v_item.name, 'INCREASE', v_before, v_after, p_amount, p_actor_nickname);

  return v_item;
end;
$$;

-- 감소 함수: greatest(v_before - p_amount, 0) 으로 0 미만 방지.
-- 실제 반영된 변화량(quantity_change)은 클램프된 만큼만 기록된다.
create or replace function public.decrease_item_quantity(p_item_id uuid, p_amount integer, p_actor_nickname text)
returns public.items
language plpgsql
as $$
declare
  v_before integer;
  v_after integer;
  v_item public.items;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be a positive integer, got %', p_amount;
  end if;
  if p_actor_nickname is null or length(trim(p_actor_nickname)) = 0 then
    raise exception 'p_actor_nickname is required';
  end if;

  select quantity into v_before
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'item % not found', p_item_id;
  end if;

  v_after := greatest(v_before - p_amount, 0);

  update public.items
  set quantity = v_after
  where id = p_item_id
  returning * into v_item;

  insert into public.item_logs
    (item_id, item_name_snapshot, action, quantity_before, quantity_after, quantity_change, actor_nickname)
  values
    (v_item.id, v_item.name, 'DECREASE', v_before, v_after, v_after - v_before, p_actor_nickname);

  return v_item;
end;
$$;

grant execute on function public.increase_item_quantity(uuid, integer, text) to anon, authenticated;
grant execute on function public.decrease_item_quantity(uuid, integer, text) to anon, authenticated;

-- search_path 고정: 함수 검색 경로 하이재킹 방지 (Supabase 보안 린터 권고 반영)
alter function public.set_updated_at() set search_path = public;
alter function public.increase_item_quantity(uuid, integer, text) set search_path = public;
alter function public.decrease_item_quantity(uuid, integer, text) set search_path = public;

-- ------------------------------------------------------------
-- 물품 등록(create_item) / 삭제(delete_item) 함수
-- items 테이블 반영과 item_logs 기록(CREATE/DELETE)을 한 트랜잭션으로 처리한다.
-- ------------------------------------------------------------

create or replace function public.create_item(
  p_name text,
  p_category text,
  p_quantity integer,
  p_target_quantity integer,
  p_received_date date,
  p_created_by_nickname text
)
returns public.items
language plpgsql
as $$
declare
  v_item public.items;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'p_name is required';
  end if;
  if p_created_by_nickname is null or length(trim(p_created_by_nickname)) = 0 then
    raise exception 'p_created_by_nickname is required';
  end if;

  insert into public.items (name, category, quantity, target_quantity, received_date, created_by_nickname)
  values (
    p_name,
    p_category,
    coalesce(p_quantity, 0),
    coalesce(p_target_quantity, 0),
    coalesce(p_received_date, current_date),
    p_created_by_nickname
  )
  returning * into v_item;

  insert into public.item_logs
    (item_id, item_name_snapshot, action, quantity_before, quantity_after, quantity_change, actor_nickname)
  values
    (v_item.id, v_item.name, 'CREATE', 0, v_item.quantity, v_item.quantity, p_created_by_nickname);

  return v_item;
end;
$$;

create or replace function public.delete_item(p_item_id uuid, p_actor_nickname text)
returns void
language plpgsql
as $$
declare
  v_item public.items;
begin
  if p_actor_nickname is null or length(trim(p_actor_nickname)) = 0 then
    raise exception 'p_actor_nickname is required';
  end if;

  select * into v_item from public.items where id = p_item_id for update;

  if not found then
    raise exception 'item % not found', p_item_id;
  end if;

  insert into public.item_logs
    (item_id, item_name_snapshot, action, quantity_before, quantity_after, quantity_change, actor_nickname)
  values
    (v_item.id, v_item.name, 'DELETE', v_item.quantity, 0, -v_item.quantity, p_actor_nickname);

  delete from public.items where id = p_item_id;
end;
$$;

alter function public.create_item(text, text, integer, integer, date, text) set search_path = public;
alter function public.delete_item(uuid, text) set search_path = public;

grant execute on function public.create_item(text, text, integer, integer, date, text) to anon, authenticated;
grant execute on function public.delete_item(uuid, text) to anon, authenticated;
