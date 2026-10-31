-- =========================================================
-- TIME LAB · схема облачного прогресса
-- Миграция идемпотентна: её можно выполнить повторно, существующие данные не удаляются
-- (create ... if not exists, add column if not exists, drop policy if exists + create).
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- служебные функции ----------
create or replace function public.tl_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- профили ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar       text not null default 'a1' check (char_length(avatar) <= 16),
  xp           integer not null default 0 check (xp >= 0),
  streak       integer not null default 0 check (streak >= 0),
  best_streak  integer not null default 0 check (best_streak >= 0),
  totals       jsonb not null default '{}'::jsonb,
  flags        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- настройки интерфейса и озвучивания ----------
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- учебный план ----------
create table if not exists public.learning_plans (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  experience    text check (experience is null or experience in ('zero', 'some', 'base')),
  method        text check (method is null or method in ('level', 'diag', 'first')),
  level_self    text check (level_self is null or level_self in ('A1', 'A2', 'B1', 'B2')),
  level_diag    jsonb,
  goal          text not null default 'tenses' check (char_length(goal) <= 24),
  session_len   text not null default 'normal' check (char_length(session_len) <= 12),
  per_week      smallint check (per_week is null or per_week between 1 and 7),
  review_old    boolean not null default true,
  skip_known    boolean not null default false,
  start_tense   text not null default 'ps' check (char_length(start_tense) <= 12),
  current_tense text not null default 'ps' check (char_length(current_tense) <= 12),
  set_at        timestamptz,
  updated_at    timestamptz not null default now()
);

-- ---------- прогресс по временам (лаборатории) ----------
create table if not exists public.tense_progress (
  user_id    uuid not null references auth.users (id) on delete cascade,
  tense_id   text not null check (char_length(tense_id) <= 12),
  unlocked   boolean not null default false,
  opened_by  text not null default 'campaign' check (char_length(opened_by) <= 16),
  badge      boolean not null default false,
  stages     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tense_id)
);

-- ---------- владение грамматическими правилами ----------
create table if not exists public.skill_progress (
  user_id    uuid not null references auth.users (id) on delete cascade,
  rule_id    text not null check (char_length(rule_id) <= 40),
  seen       integer not null default 0 check (seen >= 0),
  correct    integer not null default 0 check (correct >= 0),
  hist       jsonb not null default '[]'::jsonb,
  err3       integer not null default 0,
  last_at    timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, rule_id)
);

-- ---------- интервальные повторения (правила и глаголы) ----------
create table if not exists public.review_schedule (
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_type  text not null check (item_type in ('rule', 'verb')),
  item_id    text not null check (char_length(item_id) <= 40),
  step       smallint not null default 0 check (step between 0 and 5),
  due_at     timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

-- ---------- неправильные глаголы ----------
create table if not exists public.irregular_verb_progress (
  user_id      uuid not null references auth.users (id) on delete cascade,
  verb         text not null check (char_length(verb) <= 40),
  seen         integer not null default 0 check (seen >= 0),
  correct      integer not null default 0 check (correct >= 0),
  favorite     boolean not null default false,
  learned_mark boolean not null default false,
  in_study     boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, verb)
);

-- ---------- достижения ----------
create table if not exists public.achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null check (char_length(achievement_id) <= 24),
  unlocked_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------- журнал ответов (только добавление) ----------
create table if not exists public.exercise_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  client_id      text not null check (char_length(client_id) <= 64),
  tense_id       text check (char_length(tense_id) <= 12),
  rule_id        text check (char_length(rule_id) <= 40),
  mechanic       text check (char_length(mechanic) <= 24),
  session_kind   text check (char_length(session_kind) <= 24),
  prompt         text check (char_length(prompt) <= 500),
  user_answer    text check (char_length(user_answer) <= 500),
  correct_answer text check (char_length(correct_answer) <= 500),
  is_correct     boolean not null,
  created_at     timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists exercise_attempts_user_time on public.exercise_attempts (user_id, created_at desc);

-- ---------- история занятий и тестов (только добавление) ----------
create table if not exists public.study_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  client_id  text not null check (char_length(client_id) <= 64),
  title      text check (char_length(title) <= 160),
  kind       text check (char_length(kind) <= 24),
  tense_id   text check (char_length(tense_id) <= 12),
  correct    integer not null default 0 check (correct >= 0),
  total      integer not null default 0 check (total >= 0),
  rules      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists study_sessions_user_time on public.study_sessions (user_id, created_at desc);

-- ---------- триггеры updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','learning_plans','tense_progress','skill_progress',
                           'review_schedule','irregular_verb_progress','achievements']
  loop
    execute format('drop trigger if exists tl_updated_at on public.%I', t);
    execute format('create trigger tl_updated_at before insert or update on public.%I for each row execute function public.tl_set_updated_at()', t);
  end loop;
end $$;

-- ---------- Row Level Security: каждый видит и меняет только свои строки ----------
alter table public.profiles enable row level security;
drop policy if exists "profiles: own select" on public.profiles;
drop policy if exists "profiles: own insert" on public.profiles;
drop policy if exists "profiles: own update" on public.profiles;
drop policy if exists "profiles: own delete" on public.profiles;
create policy "profiles: own select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: own insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: own update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: own delete" on public.profiles for delete to authenticated using (id = (select auth.uid()));

do $$
declare t text;
begin
  -- таблицы, которые клиент обновляет (upsert)
  foreach t in array array['user_settings','learning_plans','tense_progress','skill_progress',
                           'review_schedule','irregular_verb_progress','achievements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('drop policy if exists "own insert" on public.%I', t);
    execute format('drop policy if exists "own update" on public.%I', t);
    execute format('drop policy if exists "own delete" on public.%I', t);
    execute format('create policy "own select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  -- журналы: чтение, добавление и удаление своих строк, без изменения
  foreach t in array array['exercise_attempts','study_sessions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('drop policy if exists "own insert" on public.%I', t);
    execute format('drop policy if exists "own delete" on public.%I', t);
    execute format('create policy "own select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Анонимной роли таблицы не нужны вовсе.
revoke all on public.profiles, public.user_settings, public.learning_plans, public.tense_progress, public.skill_progress,
  public.review_schedule, public.irregular_verb_progress, public.achievements, public.exercise_attempts, public.study_sessions from anon;
grant select, insert, update, delete on public.profiles, public.user_settings, public.learning_plans, public.tense_progress,
  public.skill_progress, public.review_schedule, public.irregular_verb_progress, public.achievements to authenticated;
grant select, insert, delete on public.exercise_attempts, public.study_sessions to authenticated;

-- ---------- профиль создаётся вместе с пользователем ----------
create or replace function public.tl_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists tl_on_auth_user_created on auth.users;
create trigger tl_on_auth_user_created after insert on auth.users
  for each row execute function public.tl_handle_new_user();

-- ---------- удаление аккаунта и всех данных ----------
-- Функция удаляет только вызывающего пользователя (auth.uid()); все таблицы чистятся каскадно.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
