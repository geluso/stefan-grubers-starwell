create table public.local_games (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  turn_number integer not null check (turn_number >= 0),
  state jsonb not null check (state @> '{"version":1}'::jsonb)
);

create index local_games_by_owner on public.local_games (owner_id, updated_at desc);
alter table public.local_games enable row level security;
revoke all on public.local_games from anon, authenticated;
grant select, insert, update on public.local_games to authenticated;

create policy read_own_local_games on public.local_games for select to authenticated
  using (owner_id = (select auth.uid()));
create policy insert_own_local_games on public.local_games for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy update_own_local_games on public.local_games for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create function public.starwell_save_local_game(game_id uuid, game_state jsonb, turns integer) returns void
language sql set search_path = '' as $$
  insert into public.local_games(id, turn_number, state) values (game_id, turns, game_state)
  on conflict (id) do update
    set turn_number = excluded.turn_number, state = excluded.state, updated_at = now()
    where local_games.turn_number < excluded.turn_number and local_games.owner_id = (select auth.uid())
$$;

revoke execute on function public.starwell_save_local_game(uuid, jsonb, integer) from public, anon;
grant execute on function public.starwell_save_local_game(uuid, jsonb, integer) to authenticated;
