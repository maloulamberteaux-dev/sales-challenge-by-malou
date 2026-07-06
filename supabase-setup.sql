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

alter table public.game_state enable row level security;
alter table public.bingo_cards enable row level security;

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
end $$;

insert into public.game_state (id, data)
values
('who', '{"subs":0,"goal":37,"grid":10,"blur":18,"hidden":[],"clue":"💡 Indice : pas encore dévoilé","answer":"","image":""}'::jsonb),
('bingo_settings', '{"size":4,"reward":"50 € pour le premier Bingo","tasks":["3 recos prises dans la journée","2 abos dans une démo groupée","Faire une blague dans un call","6 abos dans la journée","2 abos recos","Une objection micro pas de besoin déjouée","8 abos dans la journée","1 ami ajouté via le lien du jeune diplômé","3 RDV calés en moins d’1h","1 reco transformée en abo","Un vocal envoyé à un prospect","Relancer 10 ghosts","Faire +1 dans le thread","Un prospect qui dit merci","1 démo groupée lancée","1 objection comptable déjouée"]}'::jsonb)
on conflict (id) do nothing;
