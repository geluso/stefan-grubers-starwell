create function public.starwell_join(room uuid, actor uuid, preferred_seat integer) returns boolean
language plpgsql set search_path = '' as $$
declare open_seat integer;
begin
  perform 1 from public.games where id = room for update;
  if not found then return false; end if;
  if exists(select 1 from public.game_players where game_id = room and user_id = actor) then return true; end if;

  select candidate.seat into open_seat
    from generate_series(1, 3) as candidate(seat)
    where (preferred_seat is null or candidate.seat = preferred_seat)
      and not exists(select 1 from public.game_players where game_id = room and seat = candidate.seat)
    order by candidate.seat limit 1;
  if open_seat is null then return false; end if;

  insert into public.game_players(game_id, seat, user_id) values (room, open_seat, actor);
  update public.games set
    status = case when (select count(*) from public.game_players where game_id = room) = 3 then 'active' else status end,
    revision = revision + 1
    where id = room;
  return true;
end;
$$;

create or replace function public.starwell_join(room uuid, actor uuid) returns boolean
language sql set search_path = '' as $$
  select public.starwell_join(room, actor, null)
$$;

revoke execute on function public.starwell_join(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.starwell_join(uuid, uuid, integer) to service_role;

create or replace function public.starwell_list_games(page_start integer) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.id), '[]'::jsonb)
  from (
    select game.id, game.status, game.turn_number, game.created_at, roster.players, roster.seats
    from public.games game
    cross join lateral (
      select
        coalesce(jsonb_agg(coalesce(profile.display_name, 'Player ' || slot.seat) order by slot.seat)
          filter (where p.user_id is not null), '[]'::jsonb) as players,
        jsonb_agg(case when p.user_id is not null then coalesce(profile.display_name, 'Player ' || slot.seat) end
          order by slot.seat) as seats
      from generate_series(1, 3) slot(seat)
      left join public.game_players p on p.game_id = game.id and p.seat = slot.seat
      left join public.profiles profile on profile.id = p.user_id
    ) roster
    where game.visibility = 'public'
    order by game.created_at desc, game.id
    limit 51 offset greatest(page_start, 0)
  ) page
$$;
