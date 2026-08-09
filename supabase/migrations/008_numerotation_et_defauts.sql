-- =====================================================================
-- Chantier Hub — 008 : numérotation atomique + conditions par défaut + archivage
-- =====================================================================
-- Remplace la 007_ajustements_devis.sql (à SUPPRIMER du repo : doublon de 007_devis_objet).
-- La colonne `objet` est déjà posée par 007_devis_objet — on ne la retouche pas ici.
-- Idempotent (rejouable à blanc et sur la base live).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Numérotation des devis : compteur atomique (anti-race + anti-réutilisation)
--    Corrige le count(*) de la 005 (numéro qui recule à la suppression d'un devis).
-- ---------------------------------------------------------------------
create table if not exists compteurs_devis (
  prefixe text primary key,
  dernier int not null default 0
);

-- Initialise le compteur au max des numéros déjà émis, par préfixe AAMM,
-- pour éviter toute collision avec les devis existants (ex. devis de test).
insert into compteurs_devis (prefixe, dernier)
select substr(numero,1,4), max(substr(numero,5,3)::int)
from devis
where numero ~ '^[0-9]{7} '
group by substr(numero,1,4)
on conflict (prefixe) do update set dernier = greatest(compteurs_devis.dernier, excluded.dernier);

create or replace function generer_numero_devis()
returns text language plpgsql set search_path = public as $$
declare p text := to_char(current_date,'YYMM'); n int;
begin
  insert into compteurs_devis(prefixe, dernier) values (p, 1)
  on conflict (prefixe) do update set dernier = compteurs_devis.dernier + 1
  returning dernier into n;
  return p || lpad(n::text,3,'0') || ' / 1';   -- TODO client : règle exacte du suffixe / R
end $$;

alter table compteurs_devis enable row level security;
drop policy if exists compteurs_staff on compteurs_devis;
create policy compteurs_staff on compteurs_devis for all
  using (current_role_app() in ('admin','conducteur'))
  with check (current_role_app() in ('admin','conducteur'));

-- ---------------------------------------------------------------------
-- B. Conditions de paiement par défaut (pré-remplissage auto, jamais dictées)
-- ---------------------------------------------------------------------
alter table conditions_paiement add column if not exists par_defaut boolean not null default false;
update conditions_paiement set par_defaut = true  where ordre = 0;
update conditions_paiement set par_defaut = false where ordre <> 0;
-- App : à la création d'un devis, pré-remplir conditions_paiement avec la ligne par_defaut de
-- l'entité (en privilégiant celle dont type_client = type du client, sinon la par_defaut de l'entité).

-- ---------------------------------------------------------------------
-- C. Archivage (soft delete) : archive_at NULL = actif, renseigné = archivé.
--    Évite de casser les références et de perdre l'historique comptable.
-- ---------------------------------------------------------------------
alter table clients   add column if not exists archive_at timestamptz;
alter table chantiers add column if not exists archive_at timestamptz;
alter table devis     add column if not exists archive_at timestamptz;
-- Règles (côté app) :
--   • Devis BROUILLON  -> suppression DURE (DELETE) avec double confirmation.
--   • Devis ÉMIS (envoyé/accepté/refusé/expiré), CLIENTS, CHANTIERS -> archivage (archive_at = now()).
--   • Listes : filtrer "archive_at is null" par défaut + toggle "voir les archivés" + "Restaurer" (archive_at = null).
