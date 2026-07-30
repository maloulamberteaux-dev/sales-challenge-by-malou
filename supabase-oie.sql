-- ============================================================
-- 🪿 Jeu de l'Oie — schéma Supabase (tables + RLS + RPC + realtime)
-- Calqué sur le Touché-coulé : plateau SECRET côté serveur, arbitrage
-- 100 % par fonctions SECURITY DEFINER (le client ne triche pas).
-- Multi-workspace : tout est scopé workspace_id.
-- ============================================================

-- Plateau SECRET : la vérité des effets (admin-only, jamais lu par le client)
create table if not exists public.oie_board(
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  cell int not null,
  effect text not null,
  primary key (workspace_id, cell)
);
alter table public.oie_board enable row level security;
drop policy if exists "oie_board_admin" on public.oie_board;
create policy "oie_board_admin" on public.oie_board for all
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Cases spéciales PUBLIQUES : positions connues, effet = NULL tant que non révélé
-- (brouillard : le client affiche ❓ si effect null, l'icône sinon)
create table if not exists public.oie_cells(
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  cell int not null,
  effect text,
  primary key (workspace_id, cell)
);
alter table public.oie_cells enable row level security;
drop policy if exists "oie_cells_read" on public.oie_cells;
drop policy if exists "oie_cells_admin" on public.oie_cells;
create policy "oie_cells_read" on public.oie_cells for select using (true);
create policy "oie_cells_admin" on public.oie_cells for all
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Joueurs sur le plateau (positions PUBLIQUES, écriture réservée admin/RPC)
create table if not exists public.oie_players(
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  email text not null,
  name text,
  avatar text,
  pos int not null default 0,
  rolls int not null default 0,
  reco int not null default 0,
  skip boolean not null default false,
  mult boolean not null default false,
  jackpots int not null default 0,
  finished_at timestamptz,
  place int,
  primary key (workspace_id, email)
);
alter table public.oie_players enable row level security;
drop policy if exists "oie_players_read" on public.oie_players;
drop policy if exists "oie_players_admin" on public.oie_players;
create policy "oie_players_read" on public.oie_players for select using (true);
create policy "oie_players_admin" on public.oie_players for all
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Fil "en direct" partagé par tous (le RPC y écrit les lignes de log)
create table if not exists public.oie_events(
  id bigint generated always as identity primary key,
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  at timestamptz default now(),
  text text not null
);
alter table public.oie_events enable row level security;
drop policy if exists "oie_events_read" on public.oie_events;
drop policy if exists "oie_events_admin" on public.oie_events;
create policy "oie_events_read" on public.oie_events for select using (true);
create policy "oie_events_admin" on public.oie_events for all
  using (public.is_app_admin()) with check (public.is_app_admin());

-- ------------------------------------------------------------
-- 🚀 Lancement d'une partie : génère le plateau secret + les cases
--    publiques + réinitialise les joueurs. (admin uniquement)
-- ------------------------------------------------------------
create or replace function public.oie_launch(p_cells int, p_reward text, p_arrival text, p_fog boolean, p_density float)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_ws uuid;
  v_cell int;
  v_eff text;
  -- pondération de tirage des effets (retour départ rare)
  v_w text[] := array[
    'turbo','turbo','turbo','turbo','turbo',
    'bonus','bonus','bonus','bonus','bonus',
    'slow','slow','slow','slow','slow',
    'sprint','sprint','sprint','sprint',
    'jackpot','jackpot','jackpot',
    'cafe','cafe','cafe','cafe',
    'mult','mult','mult','mult',
    'restart',
    'gift','gift','gift',
    'swap','swap','swap'];
begin
  if v_email is null then raise exception 'not_authenticated'; end if;
  if not public.is_app_admin() then raise exception 'not_admin'; end if;
  select workspace_id into v_ws from public.players where email = v_email;
  if v_ws is null then raise exception 'no_workspace'; end if;

  delete from public.oie_board   where workspace_id = v_ws;
  delete from public.oie_cells   where workspace_id = v_ws;
  delete from public.oie_players where workspace_id = v_ws;
  delete from public.oie_events  where workspace_id = v_ws;

  -- placement aléatoire des cases spéciales (ni départ 0 ni arrivée cells-1)
  for v_cell in 1 .. (p_cells - 2) loop
    if random() < p_density then
      v_eff := v_w[1 + floor(random() * array_length(v_w, 1))::int];
      insert into public.oie_board(workspace_id, cell, effect) values (v_ws, v_cell, v_eff);
      insert into public.oie_cells(workspace_id, cell, effect)
        values (v_ws, v_cell, case when p_fog then null else v_eff end);
    end if;
  end loop;

  -- fiches joueurs = membres actifs du workspace
  insert into public.oie_players(workspace_id, email, name, avatar)
    select v_ws, p.email, p.name, p.avatar
      from public.players p
      where p.workspace_id = v_ws and p.status = 'active';

  insert into public.oie_events(workspace_id, text) values (v_ws, '🚀 Nouvelle partie lancée — ' || p_cells || ' cases, récompense ' || p_reward || ' !');
end $$;
grant execute on function public.oie_launch(int, text, text, boolean, float) to authenticated;

-- ------------------------------------------------------------
-- 🎲 Lancer de dé : SEUL point qui lit le plateau secret et déplace.
--    reco = 2 dés simultanés (somme). Bonus = +1 lancer. Effets de
--    déplacement chaînés (guard anti-boucle).
-- ------------------------------------------------------------
create or replace function public.oie_roll()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_ws uuid;
  v_state jsonb;
  v_cells int; v_last int; v_arrival text; v_reward text; v_round text;
  p public.oie_players%rowtype;
  v_reco boolean;
  d1 int; d2 int; v_total int;
  v_from int; v_to int;
  v_log text[] := '{}';
  v_line text;
  v_reveals jsonb := '[]'::jsonb;
  v_eff text;
  v_guard int := 0;
  v_finished boolean := false;
  v_place int := null;
  v_other public.oie_players%rowtype;
  v_tmp int;
  v_dice jsonb;
  v_bonus boolean := false;
begin
  if v_email is null then raise exception 'not_authenticated'; end if;
  select workspace_id into v_ws from public.players where email = v_email;
  if v_ws is null then raise exception 'no_workspace'; end if;

  select data into v_state from public.game_state where id = 'oie';
  if coalesce((v_state->>'live')::boolean, false) is not true then raise exception 'game_not_live'; end if;
  v_cells   := coalesce((v_state->>'cells')::int, 50);
  v_last    := v_cells - 1;
  v_arrival := coalesce(v_state->>'arrival', 'overshoot');
  v_reward  := coalesce(v_state->>'reward', '40 €');
  v_round   := coalesce(v_state->>'started_at', '');

  select * into p from public.oie_players where workspace_id = v_ws and email = v_email;
  if not found then raise exception 'not_in_game'; end if;
  if p.finished_at is not null then raise exception 'already_finished'; end if;
  if coalesce(p.rolls,0) < 1 and coalesce(p.reco,0) < 1 then raise exception 'no_roll'; end if;

  v_reco := coalesce(p.reco,0) > 0;
  if v_reco then p.reco := p.reco - 1; else p.rolls := p.rolls - 1; end if;

  -- 🧊 pause café : ce lancer est sauté
  if p.skip then
    update public.oie_players set rolls = p.rolls, reco = p.reco, skip = false
      where workspace_id = v_ws and email = v_email;
    insert into public.oie_events(workspace_id, text) values (v_ws, '🧊 ' || p.name || ' saute son lancer (pause café).');
    return jsonb_build_object('ok', true, 'skipped', true, 'log', to_jsonb(array['🧊 '||p.name||' saute son lancer (pause café).']));
  end if;

  -- 🎲 tirage
  d1 := 1 + floor(random()*6)::int;
  if v_reco then
    d2 := 1 + floor(random()*6)::int; v_total := d1 + d2; v_dice := to_jsonb(array[d1,d2]);
  else
    v_total := d1; v_dice := to_jsonb(array[d1]);
  end if;
  if p.mult then v_total := v_total * 2; p.mult := false; v_log := v_log || ('🎯 ' || p.name || ' : lancer compté DOUBLE (' || v_total || ').'); end if;

  v_from := p.pos;
  v_to := p.pos + v_total;
  if v_to >= v_last then
    if v_arrival = 'exact' and v_to > v_last then v_to := v_last - (v_to - v_last); else v_to := v_last; end if;
  end if;
  if v_to < 0 then v_to := 0; end if;
  p.pos := v_to;
  v_log := v_log || ('🎲 ' || p.name || (case when v_reco then ' lance 2 dés (reco) et fait ' else ' lance un ' end) || v_total || '.');

  -- résolution des effets (chaînage des déplacements)
  loop
    exit when p.pos = v_last;
    v_eff := null;
    select effect into v_eff from public.oie_board where workspace_id = v_ws and cell = p.pos;
    exit when v_eff is null;
    v_guard := v_guard + 1; exit when v_guard > 8;

    update public.oie_cells set effect = v_eff where workspace_id = v_ws and cell = p.pos;   -- révèle (brouillard)
    v_reveals := v_reveals || jsonb_build_object('cell', p.pos, 'effect', v_eff);

    if v_eff = 'turbo' then
      p.pos := least(v_last, p.pos + 3); v_log := v_log || ('🚀 ' || p.name || ' fonce +3 !');
    elsif v_eff = 'slow' then
      p.pos := greatest(0, p.pos - 2); v_log := v_log || ('🐌 ' || p.name || ' recule de 2.');
    elsif v_eff = 'bonus' then
      p.rolls := p.rolls + 1; v_bonus := true; v_log := v_log || ('⭐ ' || p.name || ' gagne un lancer bonus !'); exit;
    elsif v_eff = 'sprint' then
      select * into v_other from public.oie_players where workspace_id = v_ws and email <> v_email and finished_at is null order by pos desc limit 1;
      if found then
        update public.oie_players set pos = greatest(0, v_other.pos - 1) where workspace_id = v_ws and email = v_other.email;
        v_log := v_log || ('🔥 ' || p.name || ' fait reculer le leader ' || v_other.name || ' !');
      else v_log := v_log || ('🔥 Personne d''autre à ralentir.'); end if;
      exit;
    elsif v_eff = 'jackpot' then
      p.jackpots := p.jackpots + 1; v_log := v_log || ('💎 ' || p.name || ' gagne un ticket de tombola !'); exit;
    elsif v_eff = 'cafe' then
      p.skip := true; v_log := v_log || ('🧊 ' || p.name || ' : pause café, prochain lancer sauté.'); exit;
    elsif v_eff = 'mult' then
      p.mult := true; v_log := v_log || ('🎯 ' || p.name || ' : prochain lancer compté double.'); exit;
    elsif v_eff = 'restart' then
      p.pos := 0; v_log := v_log || ('💣 ' || p.name || ' retourne à la case départ !');
    elsif v_eff = 'gift' then
      select min(cell) into v_tmp from public.oie_board where workspace_id = v_ws and cell > p.pos and cell < v_last and effect = 'bonus';
      if v_tmp is not null then p.pos := v_tmp; v_log := v_log || ('🎁 ' || p.name || ' file jusqu''à la prochaine case Bonus !');
      else p.pos := least(v_last, p.pos + 2); v_log := v_log || ('🎁 ' || p.name || ' avance de 2.'); end if;
    elsif v_eff = 'swap' then
      select * into v_other from public.oie_players where workspace_id = v_ws and email <> v_email and finished_at is null and pos > p.pos order by pos asc limit 1;
      if found then
        update public.oie_players set pos = p.pos where workspace_id = v_ws and email = v_other.email;
        p.pos := v_other.pos;
        v_log := v_log || ('🤝 ' || p.name || ' échange sa place avec ' || v_other.name || '.');
      else v_log := v_log || ('🤝 Personne devant à échanger.'); end if;
      exit;
    end if;
  end loop;

  v_to := p.pos;

  -- 🏆 arrivée ?
  if p.pos = v_last then
    v_finished := true;
    select coalesce(max(place),0) + 1 into v_place from public.oie_players where workspace_id = v_ws and finished_at is not null;
    p.finished_at := now(); p.place := v_place;
    if v_place = 1 then
      v_log := v_log || ('🏆 ' || p.name || ' atteint l''arrivée et remporte ' || v_reward || ' !');
      insert into public.results(game, player, round) values ('oie', p.name, v_round) on conflict do nothing;
    else
      v_log := v_log || ('🏁 ' || p.name || ' termine (' || v_place || 'ᵉ).');
    end if;
  end if;

  update public.oie_players set
      pos = p.pos, rolls = p.rolls, reco = p.reco, skip = p.skip, mult = p.mult,
      jackpots = p.jackpots, finished_at = p.finished_at, place = p.place
    where workspace_id = v_ws and email = v_email;

  -- fil partagé
  foreach v_line in array v_log loop
    insert into public.oie_events(workspace_id, text) values (v_ws, v_line);
  end loop;

  return jsonb_build_object(
    'ok', true, 'skipped', false, 'reco', v_reco, 'dice', v_dice, 'total', v_total,
    'from', v_from, 'to', v_to, 'reveals', v_reveals, 'log', to_jsonb(v_log),
    'finished', v_finished, 'place', v_place, 'bonus', v_bonus);
end $$;
grant execute on function public.oie_roll() to authenticated;

-- Realtime
do $$
begin
  begin alter publication supabase_realtime add table public.oie_players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.oie_cells;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.oie_events;  exception when duplicate_object then null; end;
end $$;

-- ⚠️ Reset scores futur : penser à vider oie_board, oie_cells, oie_players,
--    oie_events et la ligne game_state id='oie' pour le workspace concerné.
