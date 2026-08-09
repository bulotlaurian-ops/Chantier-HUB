-- =====================================================================
-- Chantier Hub — Migration initiale (schéma complet)
-- Cible : Supabase / PostgreSQL (région EU)
-- =====================================================================
-- Principes actés :
--   • Biblio de prix COMMUNE aux 3 entités (pas d'entite_id sur prestations)
--   • Clients PARTAGÉS (un client peut recevoir des devis de plusieurs entités)
--   • L'entité n'est portée que par le devis et le chantier
--   • Cloisonnement = par RÔLE (RLS), pas par entité (filtre applicatif)
--   • Marge dérivée du prix de vente saisi (pas de prévisionnel validé en amont)
--   • TVA dans une table datée/paramétrable (pas de taux en dur)
--   • Saisie des heures par plages horaires (PAS de géolocalisation)
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists pgcrypto;      -- gen_random_uuid()
-- create extension if not exists vector;     -- À activer au Lot 2 (mapping IA par embeddings)

-- ---------- Enums ----------
create type role_app          as enum ('admin', 'conducteur', 'ouvrier');
create type categorie_prix    as enum ('B2B', 'prive', 'luxe');
create type unite             as enum ('m2', 'ml', 'piece', 'forfait', 'h');
create type statut_devis      as enum ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');
create type statut_chantier   as enum ('prospect', 'actif', 'cloture');
create type statut_validation as enum ('pending', 'valide');
create type statut_facture    as enum ('a_valider', 'valide');
create type fg_mode           as enum ('pourcentage', 'fixe', 'categorie');
create type type_tva          as enum ('standard', 'reduit', 'hebergement', 'exonere');

-- =====================================================================
-- 1. RÉFÉRENTIEL
-- =====================================================================

-- Les 3 entités commerciales (marques) sous une même société
create table entites (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,          -- MNC, MINT, MEXT
  nom                  text not null,
  couleur              text,                           -- hex, pour l'UI
  prefixe_nomenclature text not null,                  -- préfixe n° de chantier
  logo_url             text,
  cgv                  text,                           -- CGV propres à la marque
  conditions_paiement  text,                           -- conditions par défaut sur devis
  mentions_legales     text,
  validite_devis_jours int not null default 30,
  created_at           timestamptz not null default now()
);

-- Taux de TVA suisses, datés (8.1 / 2.6 / 3.8 depuis 01.01.2024)
-- À CONFIRMER auprès de l'AFC avant figeage.
create table tva_taux (
  id          uuid primary key default gen_random_uuid(),
  type        type_tva not null,
  taux        numeric(5,2) not null,                   -- en %, ex : 8.10
  date_debut  date not null,
  date_fin    date,                                    -- null = en vigueur
  created_at  timestamptz not null default now()
);

-- Paramètres globaux (clé/valeur)
create table parametres (
  cle    text primary key,
  valeur text not null
);

-- =====================================================================
-- 2. UTILISATEURS (lié à Supabase Auth)
-- =====================================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nom          text not null,
  prenom       text,
  role         role_app not null default 'ouvrier',
  taux_horaire numeric(10,2),                           -- coût horaire ouvrier (coût MO réel)
  actif        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Helper rôle (SECURITY DEFINER pour éviter la récursion RLS sur profiles)
create or replace function current_role_app()
returns role_app
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

-- Création automatique du profil à l'inscription (rôle 'ouvrier' par défaut ;
-- un admin promeut ensuite). SECURITY DEFINER pour contourner la RLS d'insert.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nom, role)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nom', ''), new.email), 'ouvrier')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Anti-escalade : un non-admin ne peut pas changer son propre rôle ni son taux horaire
-- (la policy d'update sur profiles autorise la mise à jour de sa propre ligne).
create or replace function prevent_profile_privilege_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_role_app() <> 'admin'
     and (new.role is distinct from old.role
          or new.taux_horaire is distinct from old.taux_horaire) then
    raise exception 'Seul un admin peut modifier le rôle ou le taux horaire';
  end if;
  return new;
end $$;

create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function prevent_profile_privilege_change();

-- =====================================================================
-- 3. CLIENTS (partagés entre entités — pas d'entite_id)
-- =====================================================================
create table clients (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null,
  categorie_prix categorie_prix not null default 'B2B',
  email          text,
  telephone      text,
  ville          text,
  adresse        text,
  created_at     timestamptz not null default now()
);

-- =====================================================================
-- 4. BIBLIOTHÈQUE DE PRIX (commune — hiérarchie 3 niveaux)
-- =====================================================================
create table prestations (
  id                uuid primary key default gen_random_uuid(),
  code_cfc          text,
  famille_cfc       text,
  libelle           text not null,
  unite             unite not null,
  prix_b2b          numeric(12,2) not null default 0,   -- 3 colonnes de prix
  prix_prive        numeric(12,2) not null default 0,
  prix_luxe         numeric(12,2) not null default 0,
  prix_revient      numeric(12,2) not null default 0,   -- coût de revient unitaire
  temps_par_unite   numeric(8,2),                        -- heures / unité (calcul marge)
  type_tva          type_tva not null default 'standard',
  statut_validation statut_validation not null default 'valide',
  actif             boolean not null default true,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now()
);

create table postes (
  id              uuid primary key default gen_random_uuid(),
  prestation_id   uuid not null references prestations(id) on delete cascade,
  libelle         text not null,
  unite           unite not null,
  prix_brut       numeric(12,2) not null default 0,
  temps_par_unite numeric(8,2),
  inclus_defaut   boolean not null default true,
  ordre           int not null default 0
);

create table sous_postes (
  id              uuid primary key default gen_random_uuid(),
  poste_id        uuid not null references postes(id) on delete cascade,
  libelle         text not null,
  unite           unite not null,
  prix_brut       numeric(12,2) not null default 0,
  temps_par_unite numeric(8,2),
  ordre           int not null default 0
);

-- =====================================================================
-- 5. CHANTIERS
-- =====================================================================
create table chantiers (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,                -- nomenclature auto
  nom              text not null,
  entite_id        uuid not null references entites(id),
  client_id        uuid not null references clients(id),
  ville            text,
  adresse          text,
  date_debut       date,
  date_fin_prevue  date,
  statut           statut_chantier not null default 'prospect',
  marge_finale     numeric(14,2),                       -- figée à la clôture
  created_at       timestamptz not null default now()
);

-- =====================================================================
-- 6. DEVIS
-- =====================================================================
create table devis (
  id                   uuid primary key default gen_random_uuid(),
  numero               text not null unique,            -- DEV-AAAA-NNN
  entite_id            uuid not null references entites(id),
  client_id            uuid not null references clients(id),
  chantier_id          uuid references chantiers(id),
  date_creation        date not null default current_date,
  date_validite        date,
  statut               statut_devis not null default 'brouillon',
  -- pricing
  fg_mode              fg_mode,                          -- frais généraux : mode
  fg_valeur            numeric(12,2) default 0,          -- % ou montant selon le mode
  coefficient_global   numeric(6,3) default 1,           -- coefficient de pricing global
  -- totaux + marge (dérivés)
  total_ht             numeric(14,2) not null default 0,
  total_tva            numeric(14,2) not null default 0,
  total_ttc            numeric(14,2) not null default 0,
  cout_revient_total   numeric(14,2) not null default 0,
  marge_estimee        numeric(14,2) not null default 0, -- marge DÉRIVÉE : total_ht - cout_revient (PAS un prévisionnel validé, cf. §5)
  taux_marge           numeric(6,2) not null default 0,  -- en %
  notes_ia             text,
  created_by           uuid references profiles(id),
  created_at           timestamptz not null default now()
);

create table lignes_devis (
  id                     uuid primary key default gen_random_uuid(),
  devis_id               uuid not null references devis(id) on delete cascade,
  ordre                  int not null default 0,
  prestation_id          uuid references prestations(id),
  poste_id               uuid references postes(id),
  prestation_parente_id  uuid references lignes_devis(id),
  code_cfc               text,
  libelle                text not null,
  quantite               numeric(12,2) not null default 1,
  unite                  text,
  prix_unitaire_ht       numeric(12,2) not null default 0,
  prix_revient_unitaire  numeric(12,2) not null default 0,
  taux_tva               numeric(5,2) not null, -- figé au moment du devis, depuis tva_taux (jamais en dur, §7)
  total_ht               numeric(14,2) not null default 0,
  temps_par_unite        numeric(8,2),
  est_poste              boolean not null default false
);

-- =====================================================================
-- 7. SUIVI DES HEURES (par plages — pas de géoloc)
-- =====================================================================
create table pointages (
  id                uuid primary key default gen_random_uuid(),
  chantier_id       uuid not null references chantiers(id),
  ouvrier_id        uuid not null references profiles(id),
  date              date not null,
  heure_debut       time not null,
  heure_fin         time not null,
  heures_travaillees numeric(5,2) not null,
  note              text,
  created_at        timestamptz not null default now()
);

create table journees_ouvrier (
  id              uuid primary key default gen_random_uuid(),
  ouvrier_id      uuid not null references profiles(id),
  date            date not null,
  total_heures    numeric(5,2) not null default 0,
  complete        boolean not null default false,
  verrouillee     boolean not null default false,
  motif_deblocage text,
  unique (ouvrier_id, date)
);

-- =====================================================================
-- 8. FACTURES FOURNISSEURS (avec répartition multi-chantiers possible)
-- =====================================================================
create table factures_fournisseurs (
  id              uuid primary key default gen_random_uuid(),
  fournisseur     text not null,
  numero_facture  text,
  date            date,
  montant_ht      numeric(14,2) not null default 0,
  taux_tva        numeric(5,2) not null, -- saisi/parsé depuis le référentiel tva_taux (jamais en dur, §7)
  montant_ttc     numeric(14,2) not null default 0,
  nom_fichier     text,
  fichier_url     text,                                   -- Supabase Storage
  statut          statut_facture not null default 'a_valider',
  uploaded_at     timestamptz not null default now()
);

-- Répartition d'une facture sur un ou plusieurs chantiers (split)
create table factures_repartition (
  id                 uuid primary key default gen_random_uuid(),
  facture_id         uuid not null references factures_fournisseurs(id) on delete cascade,
  chantier_id        uuid not null references chantiers(id),
  montant_ht_affecte numeric(14,2) not null
);

-- =====================================================================
-- 9. MARGE — snapshots (enveloppe figée à l'acceptation + avenants)
-- =====================================================================
create table snapshots_marge (
  id             uuid primary key default gen_random_uuid(),
  chantier_id    uuid not null references chantiers(id) on delete cascade,
  devis_id       uuid references devis(id),
  type           text not null default 'acceptation',    -- acceptation | avenant
  ca_prevu       numeric(14,2) not null default 0,        -- = prix devisé (l'enveloppe)
  couts_estimes  numeric(14,2) not null default 0,
  marge_prevue   numeric(14,2) not null default 0,
  created_at     timestamptz not null default now()
);

-- Vue : marge réelle d'un chantier (coût MO réel + factures réparties)
create or replace view chantier_couts_reels with (security_invoker = on) as
select
  c.id as chantier_id,
  coalesce((select sum(p.heures_travaillees * pr.taux_horaire)
            from pointages p
            join profiles pr on pr.id = p.ouvrier_id
            where p.chantier_id = c.id), 0) as cout_mo_reel,
  coalesce((select sum(fr.montant_ht_affecte)
            from factures_repartition fr
            where fr.chantier_id = c.id), 0) as cout_factures_reel
from chantiers c;

-- =====================================================================
-- 10. JOURNAL D'ACTIVITÉ (dashboard)
-- =====================================================================
create table activite (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                             -- devis | facture | pointage | chantier
  titre       text not null,
  description text,
  entite_id   uuid references entites(id),
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 11. FONCTIONS UTILITAIRES
-- =====================================================================

-- Numérotation séquentielle des devis : DEV-AAAA-NNN (par année)
create or replace function generer_numero_devis()
returns text language plpgsql as $$
declare
  annee text := to_char(current_date, 'YYYY');
  seq   int;
begin
  select count(*) + 1 into seq
  from devis
  where numero like 'DEV-' || annee || '-%';
  return 'DEV-' || annee || '-' || lpad(seq::text, 3, '0');
end $$;

-- Numérotation chantier : {PREFIXE_ENTITE}-{VILLE}-{SEQ}
-- ⚠️ Nomenclature exacte de Artisan Pro à confirmer au cadrage (placeholder raisonnable)
create or replace function generer_reference_chantier(p_entite uuid, p_ville text)
returns text language plpgsql as $$
declare
  prefixe text;
  ville   text := upper(left(regexp_replace(coalesce(p_ville,'XXX'), '\s', '', 'g'), 3));
  seq     int;
begin
  select prefixe_nomenclature into prefixe from entites where id = p_entite;
  select count(*) + 1 into seq from chantiers where entite_id = p_entite;
  return prefixe || '-' || ville || '-' || lpad(seq::text, 3, '0');
end $$;

-- =====================================================================
-- 12. RLS — cloisonnement par RÔLE
--   admin/conducteur : accès métier complet
--   ouvrier : ses pointages + lecture des chantiers actifs uniquement
--   (filtre par entité = applicatif, donc non géré ici)
-- =====================================================================
alter table entites               enable row level security;
alter table tva_taux              enable row level security;
alter table parametres            enable row level security;
alter table profiles              enable row level security;
alter table clients               enable row level security;
alter table prestations           enable row level security;
alter table postes                enable row level security;
alter table sous_postes           enable row level security;
alter table chantiers             enable row level security;
alter table devis                 enable row level security;
alter table lignes_devis          enable row level security;
alter table pointages             enable row level security;
alter table journees_ouvrier      enable row level security;
alter table factures_fournisseurs enable row level security;
alter table factures_repartition  enable row level security;
alter table snapshots_marge       enable row level security;
alter table activite              enable row level security;

-- Profil : chacun lit/maj le sien ; admin gère tout
create policy profiles_self_read   on profiles for select using (id = auth.uid() or current_role_app() in ('admin','conducteur'));
create policy profiles_self_update on profiles for update using (id = auth.uid() or current_role_app() = 'admin');
create policy profiles_admin_write on profiles for insert with check (current_role_app() = 'admin');

-- Tables "métier" (devis, clients, biblio, chantiers, factures, marge…) :
-- réservées admin + conducteur, accès complet.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','prestations','postes','sous_postes','chantiers',
    'devis','lignes_devis','factures_fournisseurs','factures_repartition',
    'snapshots_marge','activite','entites','tva_taux','parametres'
  ] loop
    execute format(
      'create policy %1$s_staff_all on %1$s for all
         using (current_role_app() in (''admin'',''conducteur''))
         with check (current_role_app() in (''admin'',''conducteur''));', t);
  end loop;
end $$;

-- Ouvrier : lecture des chantiers actifs (pour pointer)
create policy chantiers_ouvrier_read on chantiers for select
  using (current_role_app() = 'ouvrier' and statut = 'actif');

-- Ouvrier : gère uniquement SES pointages et SES journées
create policy pointages_ouvrier on pointages for all
  using (ouvrier_id = auth.uid())
  with check (ouvrier_id = auth.uid());

create policy journees_ouvrier_self on journees_ouvrier for all
  using (ouvrier_id = auth.uid())
  with check (ouvrier_id = auth.uid());

-- Heures : admin + conducteur lisent tout ; l'admin gère corrections et déblocage du verrou 8h40 (§8)
create policy pointages_staff_read on pointages for select
  using (current_role_app() in ('admin','conducteur'));
create policy pointages_admin_all on pointages for all
  using (current_role_app() = 'admin')
  with check (current_role_app() = 'admin');

create policy journees_staff_read on journees_ouvrier for select
  using (current_role_app() in ('admin','conducteur'));
create policy journees_admin_all on journees_ouvrier for all
  using (current_role_app() = 'admin')
  with check (current_role_app() = 'admin');

-- =====================================================================
-- 13. SEED MINIMAL (référentiel)
-- =====================================================================
insert into entites (code, nom, couleur, prefixe_nomenclature) values
  ('MNC',  'Artisan Pro & Confort',  '#1e3a8a', 'MNC'),
  ('MINT', 'Maille Intérieure', '#0e7490', 'MINT'),
  ('MEXT', 'Maille Extérieure', '#15803d', 'MEXT');

-- Taux TVA suisses en vigueur depuis le 01.01.2024 (à confirmer AFC)
insert into tva_taux (type, taux, date_debut) values
  ('standard',    8.10, '2024-01-01'),
  ('reduit',      2.60, '2024-01-01'),
  ('hebergement', 3.80, '2024-01-01'),
  ('exonere',     0.00, '2024-01-01');

insert into parametres (cle, valeur) values
  ('duree_journee_min_minutes', '520');   -- 8h40

-- =====================================================================
-- FIN
-- =====================================================================
