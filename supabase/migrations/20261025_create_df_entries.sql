-- Comptabilité (module 14, étape M14.3) : écritures comptables à partie double. Même modèle que df_invoices (numérotation par des fonctions SQL).
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go m14 » (2026-10-24).
-- Retour en arrière (table vide au départ) : drop function public.df_post_entries(jsonb, text); drop function public.df_reverse_entry(text, jsonb, text); drop table public.df_entries;
-- (les compteurs `entry:AAAA` de df_counters peuvent rester : ils ne gênent rien.)
-- Le serveur df-api (bloc ACCOUNTING) revérifie chaque écriture (partie double, comptes du plan, montants entiers). Le navigateur n'écrit JAMAIS dans cette table : seulement les routes accounting-*.
-- Une écriture ne se modifie jamais : on la contre-passe (df_reverse_entry). Lecture : responsable et Comptable seulement.
create table if not exists public.df_entries (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_entries enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_entries from anon, authenticated;
create index if not exists df_entries_updated_at_idx on public.df_entries (updated_at);
create index if not exists df_entries_date_idx on public.df_entries ((data->>'date'));

-- Enregistre des écritures déjà vérifiées par le serveur. Une écriture dont l'identifiant existe est IGNORÉE (jamais de doublon, jamais de modification).
-- Les numéros (EC-AAAA-0001…) sont attribués ici, dans l'ordre des dates puis des identifiants, par année de l'écriture. Tout ou rien (une seule transaction).
create or replace function public.df_post_entries(p_entries jsonb, p_by text) returns jsonb
language plpgsql as $$
declare
  e jsonb; yr int; n bigint; num text; now_txt text; created int := 0; existing int := 0; ids jsonb := '[]'::jsonb;
begin
  now_txt := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  for e in select value from jsonb_array_elements(p_entries) order by value->>'date', value->>'id' loop
    if exists (select 1 from public.df_entries where id = e->>'id') then existing := existing + 1; continue; end if;
    yr := substr(e->>'date', 1, 4)::int;
    n := public.df_next_counter('entry:' || yr::text);
    num := public.df_format_number('EC-', yr, n);
    insert into public.df_entries (id, data, updated_at)
      values (e->>'id', e || jsonb_build_object('number', num, 'created_by', p_by, 'created_at', now_txt, 'updated_at', now_txt), now());
    created := created + 1;
    ids := ids || to_jsonb(e->>'id');
  end loop;
  return jsonb_build_object('created', created, 'existing', existing, 'ids', ids);
end $$;

-- Contre-passe une écriture : ajoute l'écriture inverse (déjà construite et vérifiée par le serveur) et marque l'originale `reversed_by`. Refuse une écriture déjà annulée ou qui est elle-même une annulation.
create or replace function public.df_reverse_entry(p_id text, p_rev jsonb, p_by text) returns jsonb
language plpgsql as $$
declare
  d jsonb; yr int; n bigint; num text; now_txt text; saved jsonb;
begin
  select data into d from public.df_entries where id = p_id for update;
  if d is null then raise exception 'not_found'; end if;
  if d ? 'reversal_of' then raise exception 'is_reversal'; end if;
  if d ? 'reversed_by' then raise exception 'already_reversed'; end if;
  if exists (select 1 from public.df_entries where id = p_rev->>'id') then raise exception 'already_reversed'; end if;
  now_txt := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  yr := substr(p_rev->>'date', 1, 4)::int;
  n := public.df_next_counter('entry:' || yr::text);
  num := public.df_format_number('EC-', yr, n);
  saved := p_rev || jsonb_build_object('number', num, 'created_by', p_by, 'created_at', now_txt, 'updated_at', now_txt);
  insert into public.df_entries (id, data, updated_at) values (p_rev->>'id', saved, now());
  update public.df_entries set data = d || jsonb_build_object('reversed_by', p_rev->>'id', 'updated_at', now_txt), updated_at = now() where id = p_id;
  return jsonb_build_object('reversal', saved, 'id', p_id);
end $$;
