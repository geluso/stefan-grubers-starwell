alter table public.games
  add column visibility text not null default 'public' check (visibility in ('public', 'private')),
  add column created_at timestamptz not null default now();

grant select on public.games to anon;
create policy read_public_games on public.games for select to anon, authenticated
  using (visibility = 'public');

create or replace function public.starwell_read(room uuid, actor uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(game) || jsonb_build_object(
    'seat', member.seat,
    'players', (select jsonb_agg(jsonb_build_object('seat', p.seat, 'name', coalesce(profile.display_name, 'Player ' || p.seat)) order by p.seat)
      from public.game_players p left join public.profiles profile on profile.id = p.user_id where p.game_id = room),
    'moves', coalesce((select jsonb_agg(to_jsonb(m) - 'game_id' order by m.turn_number)
      from public.moves m where m.game_id = room), '[]'::jsonb)
  )
  from public.games game left join public.game_players member on member.game_id = game.id and member.user_id = actor
  where game.id = room and (member.seat is not null or (actor is null and game.visibility = 'public'))
$$;

create index games_public_lobby on public.games (created_at desc, id) where visibility = 'public';

create function public.starwell_list_games(page_start integer) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(page) - 'created_at' order by page.created_at desc, page.id), '[]'::jsonb)
  from (
    select game.id, game.status, game.turn_number, game.created_at,
      (select jsonb_agg(coalesce(profile.display_name, 'Player ' || p.seat) order by p.seat)
        from public.game_players p left join public.profiles profile on profile.id = p.user_id
        where p.game_id = game.id) as players
    from public.games game
    where game.visibility = 'public'
    order by game.created_at desc, game.id
    limit 51 offset greatest(page_start, 0)
  ) page
$$;

revoke execute on function public.starwell_list_games(integer) from public, anon, authenticated;
grant execute on function public.starwell_list_games(integer) to service_role;
