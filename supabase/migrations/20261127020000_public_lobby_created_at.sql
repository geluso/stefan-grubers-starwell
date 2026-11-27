create or replace function public.starwell_list_games(page_start integer) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.id), '[]'::jsonb)
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
