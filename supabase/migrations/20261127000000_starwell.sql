create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting' check (status in ('waiting', 'active')),
  rules jsonb not null check (rules in ('{"knightJump":"long"}', '{"knightJump":"short"}')),
  initial_board jsonb not null,
  board jsonb not null,
  current_player integer not null default 1 check (current_player between 1 and 3),
  revision integer not null default 0,
  turn_number integer not null default 0
);

create table public.game_players (
  game_id uuid references public.games on delete cascade,
  seat integer check (seat between 1 and 3),
  user_id uuid not null references auth.users,
  primary key (game_id, seat),
  unique (game_id, user_id)
);

create table public.moves (
  game_id uuid references public.games on delete cascade,
  turn_number integer,
  player integer not null check (player between 1 and 3),
  path text[] not null check (cardinality(path) in (2, 3)),
  notation text not null,
  board_after jsonb not null,
  primary key (game_id, turn_number)
);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.moves enable row level security;
revoke all on public.profiles, public.games, public.game_players, public.moves from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.games to authenticated;
create policy read_own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy insert_own_profile on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy update_own_profile on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create schema starwell_private;
grant usage on schema starwell_private to authenticated;
create function starwell_private.is_member(room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.game_players where game_id = room and user_id = (select auth.uid()))
$$;
revoke all on function starwell_private.is_member(uuid) from public;
grant execute on function starwell_private.is_member(uuid) to authenticated;
create policy read_joined_games on public.games for select to authenticated using (starwell_private.is_member(id));

create function public.starwell_create(actor uuid, game_rules jsonb, starting_board jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare room uuid;
begin
  insert into public.games(rules, initial_board, board)
    values (game_rules, starting_board, starting_board) returning id into room;
  insert into public.game_players(game_id, seat, user_id) values (room, 1, actor);
  return room;
end;
$$;

create function public.starwell_join(room uuid, actor uuid) returns boolean
language plpgsql set search_path = '' as $$
declare open_seat integer;
begin
  perform 1 from public.games where id = room for update;
  if not found then return false; end if;
  if exists(select 1 from public.game_players where game_id = room and user_id = actor) then return true; end if;
  select count(*) + 1 into open_seat from public.game_players where game_id = room;
  if open_seat > 3 then return false; end if;
  insert into public.game_players(game_id, seat, user_id) values (room, open_seat, actor);
  update public.games set status = case when open_seat = 3 then 'active' else status end,
    revision = revision + 1 where id = room;
  return true;
end;
$$;

create function public.starwell_read(room uuid, actor uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(game) || jsonb_build_object(
    'seat', member.seat,
    'players', (select jsonb_agg(jsonb_build_object('seat', p.seat, 'name', coalesce(profile.display_name, 'Player ' || p.seat)) order by p.seat)
      from public.game_players p left join public.profiles profile on profile.id = p.user_id where p.game_id = room),
    'moves', coalesce((select jsonb_agg(to_jsonb(m) - 'game_id' order by m.turn_number)
      from public.moves m where m.game_id = room), '[]'::jsonb)
  )
  from public.games game join public.game_players member on member.game_id = game.id
  where game.id = room and member.user_id = actor
$$;

create function public.starwell_move(room uuid, actor uuid, expected_revision integer, move_path text[], move_notation text, next_board jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare game public.games;
begin
  select * into game from public.games where id = room for update;
  if not found or game.status <> 'active' or game.revision <> expected_revision or not exists(
    select 1 from public.game_players where game_id = room and user_id = actor and seat = game.current_player
  ) then return false; end if;
  insert into public.moves(game_id, turn_number, player, path, notation, board_after)
    values (room, game.turn_number + 1, game.current_player, move_path, move_notation, next_board);
  update public.games set board = next_board, current_player = game.current_player % 3 + 1,
    revision = game.revision + 1, turn_number = game.turn_number + 1 where id = room;
  return true;
end;
$$;

revoke execute on function public.starwell_create(uuid, jsonb, jsonb),
  public.starwell_join(uuid, uuid), public.starwell_read(uuid, uuid),
  public.starwell_move(uuid, uuid, integer, text[], text, jsonb) from public, anon, authenticated;
grant execute on function public.starwell_create(uuid, jsonb, jsonb),
  public.starwell_join(uuid, uuid), public.starwell_read(uuid, uuid),
  public.starwell_move(uuid, uuid, integer, text[], text, jsonb) to service_role;
grant select, insert, update on public.profiles, public.games, public.game_players, public.moves to service_role;

alter publication supabase_realtime add table public.games;
