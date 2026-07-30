-- Multi-équipes (cutover) : PK composites + autorisation Manager par équipe.

alter table public.game_state   alter column workspace_id set not null;
alter table public.who_secret   alter column workspace_id set not null;
alter table public.bs_shots      alter column workspace_id set not null;
alter table public.bingo_cards   alter column workspace_id set not null;
alter table public.results       alter column workspace_id set not null;
alter table public.bs_torpedoes  alter column workspace_id set not null;

alter table public.game_state   drop constraint game_state_pkey,   add primary key (workspace_id, id);
alter table public.who_secret   drop constraint who_secret_pkey,   add primary key (workspace_id, id);
alter table public.bs_shots      drop constraint bs_shots_pkey,      add primary key (workspace_id, cell);
alter table public.bingo_cards   drop constraint bingo_cards_pkey,   add primary key (workspace_id, player);
alter table public.results       drop constraint results_pkey,       add primary key (workspace_id, game, player, round);
alter table public.bs_torpedoes  drop constraint bs_torpedoes_pkey,  add primary key (workspace_id, email);

create or replace function public.is_ws_manager(p_ws uuid) returns boolean
  language sql security definer stable set search_path = public as $FN$
  select exists(
    select 1 from public.players p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and p.workspace_id = p_ws and p.role = 'admin' and p.status = 'active'
  ) or exists(
    select 1 from public.app_admins a where a.email = (auth.jwt() ->> 'email')
  );
$FN$;
grant execute on function public.is_ws_manager(uuid) to anon, authenticated;

drop policy if exists "bs_ships_admin" on public.bs_ships;
create policy "bs_ships_admin" on public.bs_ships for all
  using (public.is_ws_manager(workspace_id)) with check (public.is_ws_manager(workspace_id));

drop policy if exists "bs_shots_admin" on public.bs_shots;
create policy "bs_shots_admin" on public.bs_shots for all
  using (public.is_ws_manager(workspace_id)) with check (public.is_ws_manager(workspace_id));

drop policy if exists "bs_torp_admin" on public.bs_torpedoes;
create policy "bs_torp_admin" on public.bs_torpedoes for all
  using (public.is_ws_manager(workspace_id)) with check (public.is_ws_manager(workspace_id));

drop policy if exists "who_secret_admin" on public.who_secret;
create policy "who_secret_admin" on public.who_secret for all
  using (public.is_ws_manager(workspace_id)) with check (public.is_ws_manager(workspace_id));
