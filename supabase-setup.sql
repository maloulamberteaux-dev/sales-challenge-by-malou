create table if not exists public.game_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.bingo_cards (
  player text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 👑 Admins reconnus côté base (pour les RLS des tables protégées)
create table if not exists public.app_admins(email text primary key);
insert into public.app_admins(email) values
  ('malou.lamberteaux@gmail.com'),
  ('safir@lumeos.pro')
on conflict do nothing;
alter table public.app_admins enable row level security; -- aucune policy => verrouillée

create or replace function public.is_app_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.app_admins a where a.email = (auth.jwt() ->> 'email'));
$$;
grant execute on function public.is_app_admin() to anon, authenticated;

-- 🚢 Touché-coulé — bateaux SECRETS (admin-only), tirs et torpilles publics en lecture
create table if not exists public.bs_ships(
  id int generated always as identity primary key,
  name text,
  cells int[] not null,
  sunk boolean default false,
  sunk_by text
);
alter table public.bs_ships enable row level security;
drop policy if exists "bs_ships_admin" on public.bs_ships;
create policy "bs_ships_admin" on public.bs_ships for all
  using (public.is_app_admin()) with check (public.is_app_admin());

create table if not exists public.bs_shots(
  cell int primary key,
  hit boolean not null,
  by_name text,
  by_email text,
  ship_id int,
  sunk boolean default false,
  fired_at timestamptz default now()
);
alter table public.bs_shots enable row level security;
drop policy if exists "bs_shots_read" on public.bs_shots;
drop policy if exists "bs_shots_admin" on public.bs_shots;
create policy "bs_shots_read" on public.bs_shots for select using (true);
create policy "bs_shots_admin" on public.bs_shots for all
  using (public.is_app_admin()) with check (public.is_app_admin());

create table if not exists public.bs_torpedoes(
  email text primary key,
  name text,
  count int not null default 0
);
alter table public.bs_torpedoes enable row level security;
drop policy if exists "bs_torp_read" on public.bs_torpedoes;
drop policy if exists "bs_torp_admin" on public.bs_torpedoes;
create policy "bs_torp_read" on public.bs_torpedoes for select using (true);
create policy "bs_torp_admin" on public.bs_torpedoes for all
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Arbitre des tirs : seule cette fonction lit les bateaux (jamais le client)
create or replace function public.bs_fire(p_cell int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_name  text;
  v_torp  int;
  v_hit   boolean := false;
  v_ship  public.bs_ships%rowtype;
  v_sunk  boolean := false;
  v_state jsonb;
  v_round text;
begin
  if v_email is null then raise exception 'not_authenticated'; end if;
  select data into v_state from public.game_state where id = 'battleship';
  if coalesce((v_state->>'live')::boolean, false) is not true then
    raise exception 'game_not_live';
  end if;
  v_round := coalesce(v_state->>'started_at', '');
  select name into v_name from public.players where email = v_email;
  v_name := coalesce(v_name, v_email);
  select count into v_torp from public.bs_torpedoes where email = v_email;
  if coalesce(v_torp, 0) < 1 then raise exception 'no_torpedo'; end if;
  if exists (select 1 from public.bs_shots where cell = p_cell) then
    raise exception 'already_fired';
  end if;
  select * into v_ship from public.bs_ships where p_cell = any(cells) limit 1;
  if found then v_hit := true; end if;
  update public.bs_torpedoes set count = count - 1 where email = v_email;
  insert into public.bs_shots(cell, hit, by_name, by_email, ship_id)
    values (p_cell, v_hit, v_name, v_email, case when v_hit then v_ship.id else null end);
  if v_hit then
    if (select count(*) from public.bs_shots s where s.ship_id = v_ship.id and s.hit) >= array_length(v_ship.cells, 1) then
      v_sunk := true;
      update public.bs_ships set sunk = true, sunk_by = v_name where id = v_ship.id;
      update public.bs_shots set sunk = true where ship_id = v_ship.id;
      insert into public.results(game, player, round)
        values ('battleship', v_name, v_round || ':s' || v_ship.id)
        on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('hit', v_hit, 'sunk', v_sunk, 'ship', case when v_sunk then v_ship.name else null end, 'by', v_name);
end;
$$;
grant execute on function public.bs_fire(int) to authenticated;

-- 🔒 Secrets du Qui suis-je (photo originale + réponse) — lisible uniquement par les admins.
-- Le public ne reçoit qu'un composite (pixels révélés) généré par le navigateur de l'admin.
create table if not exists public.who_secret(
  id text primary key,
  image text,
  answer text
);
alter table public.who_secret enable row level security;
drop policy if exists "who_secret_admin" on public.who_secret;
create policy "who_secret_admin" on public.who_secret for all
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Victoires enregistrées (alimente l'onglet Classement) : 1 ligne par victoire et par manche
create table if not exists public.results (
  game text not null,
  player text not null,
  round text not null default '',
  won_at timestamptz default now(),
  primary key (game, player, round)
);
alter table public.results enable row level security;
drop policy if exists "results_select_all" on public.results;
drop policy if exists "results_insert_all" on public.results;
drop policy if exists "results_delete_all" on public.results;
create policy "results_select_all" on public.results for select using (true);
create policy "results_insert_all" on public.results for insert with check (true);
create policy "results_delete_all" on public.results for delete using (true);

-- Historique des parties terminées (onglet Historique du dashboard admin)
-- data = snapshot : bingo -> {scoreboard,reward,size,players} ; who -> {image,reveal_pct,subs,goal,grid,answer,clue}
create table if not exists public.game_history (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  round text default '',
  started_at timestamptz,
  ended_at timestamptz default now(),
  winner text default '',
  data jsonb not null default '{}'::jsonb
);
alter table public.game_history enable row level security;
drop policy if exists "history_select_all" on public.game_history;
drop policy if exists "history_insert_all" on public.game_history;
drop policy if exists "history_delete_all" on public.game_history;
create policy "history_select_all" on public.game_history for select using (true);
create policy "history_insert_all" on public.game_history for insert with check (true);
create policy "history_delete_all" on public.game_history for delete using (true);

-- Profils des joueurs connectés via Google (onglet Utilisateurs du dashboard admin)
create table if not exists public.players (
  email text primary key,
  name text,
  avatar text,
  is_admin boolean default false,
  last_seen timestamptz default now()
);

alter table public.game_state enable row level security;
alter table public.bingo_cards enable row level security;
alter table public.players enable row level security;

drop policy if exists "players_select_all" on public.players;
drop policy if exists "players_insert_all" on public.players;
drop policy if exists "players_update_all" on public.players;
drop policy if exists "players_delete_all" on public.players;
create policy "players_select_all" on public.players for select using (true);
create policy "players_insert_all" on public.players for insert with check (true);
create policy "players_update_all" on public.players for update using (true);
create policy "players_delete_all" on public.players for delete using (true);

drop policy if exists "game_state_select_all" on public.game_state;
drop policy if exists "game_state_insert_all" on public.game_state;
drop policy if exists "game_state_update_all" on public.game_state;
drop policy if exists "bingo_select_all" on public.bingo_cards;
drop policy if exists "bingo_insert_all" on public.bingo_cards;
drop policy if exists "bingo_update_all" on public.bingo_cards;
drop policy if exists "bingo_delete_all" on public.bingo_cards;

create policy "game_state_select_all" on public.game_state for select using (true);
create policy "game_state_insert_all" on public.game_state for insert with check (true);
create policy "game_state_update_all" on public.game_state for update using (true);

create policy "bingo_select_all" on public.bingo_cards for select using (true);
create policy "bingo_insert_all" on public.bingo_cards for insert with check (true);
create policy "bingo_update_all" on public.bingo_cards for update using (true);
create policy "bingo_delete_all" on public.bingo_cards for delete using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.game_state;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bingo_cards;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bs_shots;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bs_torpedoes;
  exception when duplicate_object then null;
  end;
end $$;

insert into public.game_state (id, data)
values
('who', '{"subs":0,"goal":37,"grid":10,"blur":18,"hidden":[],"clue":"💡 Indice : pas encore dévoilé","answer":"","image":""}'::jsonb),
('bingo_settings', '{"size":4,"reward":"50 € pour le premier Bingo","tasks":["3 recos prises dans la journée","2 abos dans une démo groupée","Faire une blague dans un call","6 abos dans la journée","2 abos recos","Une objection micro pas de besoin déjouée","8 abos dans la journée","1 ami ajouté via le lien du jeune diplômé","3 RDV calés en moins d’1h","1 reco transformée en abo","Un vocal envoyé à un prospect","Relancer 10 ghosts","Faire +1 dans le thread","Un prospect qui dit merci","1 démo groupée lancée","1 objection comptable déjouée"]}'::jsonb)
on conflict (id) do nothing;
