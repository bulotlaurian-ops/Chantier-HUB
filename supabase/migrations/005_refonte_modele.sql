-- =====================================================================
-- Chantier Hub — 005 : refonte du modèle (corrections post-dossier client)
-- =====================================================================
-- Remplace les hypothèses de la 001 par la réalité métier (retours client : mail + Excel + PDF).
-- Stratégie d'application : on est encore tôt (seed démo uniquement). Le plus propre
-- est de RÉVISER la 001 et reset la base plutôt que d'empiler des ALTER. Claude Code
-- décide de la mécanique (reset+régénérer types, ou découper en ALTER) — voici la CIBLE.
--
-- Changements vs 001 :
--   • Vrais noms/codes/couleurs des 3 entités
--   • Modèle de prix : prix de référence + grille de remises/coefficients configurable
--     (remplace prix_b2b/prive/luxe) — gère clôtures (remises client) ET grands comptes retail (nature projet)
--   • Catégories tarifaires en table configurable (plus d'enum figé)
--   • Cloisonnement conducteur PAR ENTITÉ (table user_entites + RLS)
--   • Heures : verrou 8h40 SUPPRIMÉ, temps de trajet AJOUTÉ
--   • Nomenclature : devis AAMMNNN/R, chantier NOM CLIENT / VILLE
--   • lignes_devis : remise par ligne (%), ligne option non totalisée
--   • Conditions de paiement par entité / type de client
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 0. TEARDOWN — reset du modèle 001→004 (démo only, pas d'ALTER).
--    Idempotent : permet de rejouer 005 (à blanc OU sur la base live actuelle)
--    sans casser le schéma public ni ses grants Supabase.
-- =====================================================================
drop view if exists chantier_couts_reels cascade;

drop table if exists
  activite, snapshots_marge, factures_repartition, factures_fournisseurs,
  journees_ouvrier, pointages, lignes_devis, devis, chantiers,
  sous_postes, postes, tarifs, prestations, clients, categories_tarifaires,
  user_entites, profiles, conditions_paiement, parametres, tva_taux, entites
  cascade;

drop function if exists current_role_app() cascade;
drop function if exists user_a_acces_entite(uuid) cascade;
drop function if exists handle_new_user() cascade;
drop function if exists prevent_profile_privilege_change() cascade;
drop function if exists generer_numero_devis() cascade;
drop function if exists generer_reference_chantier(uuid, text) cascade;

drop type if exists
  role_app, categorie_prix, unite, statut_devis, statut_chantier,
  statut_validation, statut_facture, fg_mode, type_tva,
  categorie_type, mode_tarif
  cascade;

-- ---------- Enums ----------
create type role_app          as enum ('admin', 'conducteur', 'ouvrier');
create type unite             as enum ('m2', 'ml', 'pce', 'u', 'fft', 'h', 'forfait');
create type statut_devis      as enum ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');
create type statut_chantier   as enum ('prospect', 'actif', 'cloture');
create type statut_validation as enum ('pending', 'valide');
create type statut_facture    as enum ('a_valider', 'valide');
create type fg_mode           as enum ('pourcentage', 'fixe', 'coefficient');
create type type_tva          as enum ('standard', 'reduit', 'hebergement', 'exonere');
create type categorie_type    as enum ('client', 'nature_projet');   -- dimension de variation de prix
create type mode_tarif        as enum ('remise_pct', 'coefficient', 'prix_absolu');

-- =====================================================================
-- 1. RÉFÉRENTIEL
-- =====================================================================
create table entites (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,          -- PRO / EXT / INT
  nom                  text not null,
  couleur              text,
  prefixe_nomenclature text,                          -- conservé (non utilisé par défaut, cf. nomenclature)
  logo_url             text,
  adresse_societe      text,                          -- ex : Ville (Region)
  cgv                  text,
  mentions_legales     text,
  validite_devis_jours int not null default 30,       -- 1 mois pour les 3 entités
  created_at           timestamptz not null default now()
);

-- Conditions de paiement : options par entité (et par type de client si besoin)
create table conditions_paiement (
  id          uuid primary key default gen_random_uuid(),
  entite_id   uuid not null references entites(id) on delete cascade,
  type_client text,                                   -- null = toutes, sinon 'prive'/'pro'/'nouveau_pro'
  libelle     text not null,                          -- ex : "50% acompte / 30% livraison / solde réception"
  ordre       int not null default 0
);

create table tva_taux (
  id uuid primary key default gen_random_uuid(),
  type type_tva not null, taux numeric(5,2) not null,
  date_debut date not null, date_fin date, created_at timestamptz not null default now()
);

create table parametres (cle text primary key, valeur text not null);

-- =====================================================================
-- 2. UTILISATEURS + assignation aux entités (cloisonnement conducteur)
-- =====================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null, prenom text,
  role role_app not null default 'ouvrier',
  taux_horaire numeric(10,2),                         -- défaut métier : 70 CHF (à seeder par user)
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un conducteur peut être assigné à 1..n entités (Conducteur A=EXT ; Conducteur B=PRO+INT). Admin = toutes.
create table user_entites (
  profile_id uuid not null references profiles(id) on delete cascade,
  entite_id  uuid not null references entites(id)  on delete cascade,
  primary key (profile_id, entite_id)
);

create or replace function current_role_app()
returns role_app language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

-- Accès à une entité : admin -> tout ; conducteur -> ses entités assignées
create or replace function user_a_acces_entite(p_entite uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select current_role_app() = 'admin'
      or exists (select 1 from user_entites ue where ue.profile_id = auth.uid() and ue.entite_id = p_entite);
$$;

-- =====================================================================
-- 3. CATÉGORIES TARIFAIRES (configurable) + CLIENTS
-- =====================================================================
create table categories_tarifaires (
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique,
  libelle text not null,
  type    categorie_type not null,                    -- 'client' ou 'nature_projet'
  ordre   int not null default 0
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie_tarifaire_id uuid references categories_tarifaires(id),  -- type 'client'
  email text, telephone text, ville text, adresse text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 4. BIBLIOTHÈQUE (commune) — modèle prix de référence + grille
-- =====================================================================
create table prestations (
  id uuid primary key default gen_random_uuid(),
  code text,                                           -- CFC / CAN / réf interne (ex 701610010)
  famille text,
  libelle text not null,
  unite unite not null,
  prix_achat_net      numeric(12,2),                   -- pour la marge
  prix_vente_reference numeric(12,2) not null default 0,  -- "prix public"
  temps_par_unite     numeric(8,2),
  type_tva            type_tva not null default 'standard',
  source              text,                            -- 'clotures' | 'retail' | 'can' | 'manuel'
  statut_validation   statut_validation not null default 'valide',
  actif boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Prix effectif par (prestation, catégorie) : remise %, coefficient ou prix absolu
create table tarifs (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references prestations(id) on delete cascade,
  categorie_id  uuid not null references categories_tarifaires(id),
  mode  mode_tarif not null,                           -- remise_pct | coefficient | prix_absolu
  valeur numeric(12,4) not null,                       -- -0.20 (remise) | 1.05 (coef) | 50.56 (absolu)
  unique (prestation_id, categorie_id)
);

create table postes (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references prestations(id) on delete cascade,
  libelle text not null, unite unite not null,
  prix_brut numeric(12,2) not null default 0, temps_par_unite numeric(8,2),
  inclus_defaut boolean not null default true, ordre int not null default 0
);
create table sous_postes (
  id uuid primary key default gen_random_uuid(),
  poste_id uuid not null references postes(id) on delete cascade,
  libelle text not null, unite unite not null,
  prix_brut numeric(12,2) not null default 0, temps_par_unite numeric(8,2), ordre int not null default 0
);

-- =====================================================================
-- 5. CHANTIERS
-- =====================================================================
create table chantiers (
  id uuid primary key default gen_random_uuid(),
  reference text not null,                             -- "NOM CLIENT / VILLE" (cf. fonction)
  nom text not null,
  entite_id uuid not null references entites(id),
  client_id uuid not null references clients(id),
  ville text, adresse text,
  date_debut date, date_fin_prevue date,
  statut statut_chantier not null default 'prospect',
  marge_finale numeric(14,2),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 6. DEVIS
-- =====================================================================
create table devis (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                         -- AAMMNNN / R  (cf. fonction)
  entite_id uuid not null references entites(id),
  client_id uuid not null references clients(id),
  chantier_id uuid references chantiers(id),
  nature_projet_id uuid references categories_tarifaires(id),  -- ex. retail : nouvelle constr / reconstruction
  date_creation date not null default current_date,
  date_validite date,
  statut statut_devis not null default 'brouillon',
  fg_mode fg_mode, fg_valeur numeric(12,2) default 0,
  coefficient_global numeric(6,3) default 1,
  total_ht numeric(14,2) not null default 0,
  total_tva numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,         -- arrondi suisse 0.05 appliqué applicativement
  arrondi numeric(6,2) not null default 0,
  cout_revient_total numeric(14,2) not null default 0,
  marge numeric(14,2) not null default 0,             -- dérivée : total_ht - cout_revient (peut être nulle si non calculable)
  taux_marge numeric(6,2),
  conditions_paiement text,                           -- reprise de l'option choisie
  notes_ia text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table lignes_devis (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references devis(id) on delete cascade,
  ordre int not null default 0,
  prestation_id uuid references prestations(id),
  poste_id uuid references postes(id),
  prestation_parente_id uuid references lignes_devis(id),
  code text, libelle text not null,
  quantite numeric(12,2) not null default 1, unite text,
  prix_unitaire_ht numeric(12,2) not null default 0,
  remise_pct numeric(5,2) not null default 0,         -- remise PAR LIGNE (colonne "%")
  prix_revient_unitaire numeric(12,2) not null default 0,
  taux_tva numeric(5,2) not null default 8.10,        -- figé au devis
  total_ht numeric(14,2) not null default 0,
  est_option boolean not null default false,          -- ligne "option non totalisée" (total 0)
  est_titre  boolean not null default false,          -- ligne de section/titre
  temps_par_unite numeric(8,2)
);

-- =====================================================================
-- 7. HEURES — sans verrou, avec temps de trajet
-- =====================================================================
create table pointages (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references chantiers(id),
  ouvrier_id uuid not null references profiles(id),
  date date not null,
  heure_debut time, heure_fin time,
  heures_travaillees numeric(5,2) not null default 0,
  heures_trajet numeric(5,2) not null default 0,      -- saisie simple (la règle trajet n'est PAS automatisée en Phase 1)
  note text,
  created_at timestamptz not null default now()
);
-- Référence hebdo 42h (8h40/j) : indicative, AUCUN blocage de saisie (cf. mail client).

-- =====================================================================
-- 8. FACTURES FOURNISSEURS (scannées -> OCR) + répartition multi-chantiers
-- =====================================================================
create table factures_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null, numero_facture text, date date,
  montant_ht numeric(14,2) not null default 0, taux_tva numeric(5,2) not null default 8.10,
  montant_ttc numeric(14,2) not null default 0,
  nom_fichier text, fichier_url text, statut statut_facture not null default 'a_valider',
  uploaded_at timestamptz not null default now()
);
create table factures_repartition (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references factures_fournisseurs(id) on delete cascade,
  chantier_id uuid not null references chantiers(id),
  montant_ht_affecte numeric(14,2) not null
);

-- =====================================================================
-- 9. MARGE + ACTIVITÉ
-- =====================================================================
create table snapshots_marge (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references chantiers(id) on delete cascade,
  devis_id uuid references devis(id),
  type text not null default 'acceptation',
  ca_prevu numeric(14,2) not null default 0, couts_estimes numeric(14,2) not null default 0,
  marge_prevue numeric(14,2) not null default 0, created_at timestamptz not null default now()
);
create or replace view chantier_couts_reels as
select c.id as chantier_id,
  coalesce((select sum(p.heures_travaillees * pr.taux_horaire) from pointages p
            join profiles pr on pr.id = p.ouvrier_id where p.chantier_id = c.id),0) as cout_mo_reel,
  coalesce((select sum(fr.montant_ht_affecte) from factures_repartition fr
            where fr.chantier_id = c.id),0) as cout_factures_reel
from chantiers c;

create table activite (
  id uuid primary key default gen_random_uuid(),
  type text not null, titre text not null, description text,
  entite_id uuid references entites(id), created_at timestamptz not null default now()
);

-- =====================================================================
-- 10. NUMÉROTATION
-- =====================================================================
-- Devis : AAMMNNN/R  (AA=année, MM=mois, NNN=séquentiel du mois, R=suffixe).
-- ⚠️ Le suffixe /R est à clarifier avec le client. Placeholder : on génère AAMMNNN, /R laissé à 1.
create or replace function generer_numero_devis()
returns text language plpgsql set search_path = public as $$
declare prefixe text := to_char(current_date,'YYMM'); seq int;
begin
  select count(*)+1 into seq from devis where numero like prefixe||'%';
  return prefixe || lpad(seq::text,3,'0') || ' / 1';   -- TODO client : règle du suffixe /R
end $$;

-- Chantier : "NOM CLIENT / VILLE"
create or replace function generer_reference_chantier(p_client uuid, p_ville text)
returns text language plpgsql set search_path = public as $$
declare nom_client text;
begin
  select nom into nom_client from clients where id = p_client;
  return upper(coalesce(nom_client,'CLIENT')) || ' / ' || upper(coalesce(p_ville,'VILLE'));
end $$;

-- =====================================================================
-- 11. RLS — par rôle, + cloisonnement conducteur par entité
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['entites','conditions_paiement','tva_taux','parametres','profiles',
    'user_entites','categories_tarifaires','clients','prestations','tarifs','postes','sous_postes',
    'chantiers','devis','lignes_devis','pointages','factures_fournisseurs','factures_repartition',
    'snapshots_marge','activite']
  loop execute format('alter table %I enable row level security;', t); end loop;
end $$;

-- Données PARTAGÉES (référentiel, biblio, clients) : lecture/écriture pour admin + conducteur
do $$ declare t text; begin
  foreach t in array array['categories_tarifaires','clients','prestations','tarifs','postes',
    'sous_postes','conditions_paiement','entites','tva_taux','parametres','activite']
  loop execute format(
    'create policy %1$s_staff_all on %1$s for all
       using (current_role_app() in (''admin'',''conducteur''))
       with check (current_role_app() in (''admin'',''conducteur''));', t);
  end loop;
end $$;

-- Profils & assignations : self + admin
create policy profiles_self on profiles for select using (id = auth.uid() or current_role_app()='admin');
create policy profiles_admin on profiles for all using (current_role_app()='admin') with check (current_role_app()='admin');
create policy ue_read on user_entites for select using (profile_id = auth.uid() or current_role_app()='admin');
create policy ue_admin on user_entites for all using (current_role_app()='admin') with check (current_role_app()='admin');

-- DEVIS & CHANTIERS : conducteur limité à ses entités (admin = tout)
create policy devis_entite on devis for all
  using (user_a_acces_entite(entite_id)) with check (user_a_acces_entite(entite_id));
create policy chantiers_entite on chantiers for all
  using (user_a_acces_entite(entite_id)) with check (user_a_acces_entite(entite_id));
create policy lignes_devis_via on lignes_devis for all
  using (exists (select 1 from devis d where d.id = devis_id and user_a_acces_entite(d.entite_id)))
  with check (exists (select 1 from devis d where d.id = devis_id and user_a_acces_entite(d.entite_id)));

-- Factures / répartition / snapshots : admin + conducteur
do $$ declare t text; begin
  foreach t in array array['factures_fournisseurs','factures_repartition','snapshots_marge']
  loop execute format('create policy %1$s_staff on %1$s for all
       using (current_role_app() in (''admin'',''conducteur''))
       with check (current_role_app() in (''admin'',''conducteur''));', t); end loop;
end $$;

-- OUVRIER : lecture chantiers actifs + gestion de SES pointages
create policy chantiers_ouvrier_read on chantiers for select
  using (current_role_app()='ouvrier' and statut='actif');
create policy pointages_ouvrier on pointages for all
  using (ouvrier_id = auth.uid()) with check (ouvrier_id = auth.uid());

-- =====================================================================
-- 12. SEED — référentiel uniquement (PAS de biblio fictive)
-- =====================================================================
insert into entites (code, nom, couleur, adresse_societe, validite_devis_jours) values
  ('PRO',    'ARTISAN PRO',  '#1F2937', 'Ville (Region)', 30),   -- anthracite neutre (cf. 018)
  ('EXT', 'EXTERIEUR',    '#3F6C51', 'Ville (Region)', 30),
  ('INT', 'INTERIEUR',    '#8A6A4B', 'Ville (Region)', 30);

-- Catégories tarifaires (PROVISOIRES — à confirmer client, cf. Excel clôtures)
insert into categories_tarifaires (code, libelle, type, ordre) values
  ('public',   'Prix public',         'client', 0),
  ('prive',    'Client privé',        'client', 1),
  ('pro',      'Client pro',          'client', 2),
  ('pro_stock','Client pro stock',    'client', 3),
  ('neuf',     'Nouvelle construction','nature_projet', 0),
  ('reconstr', 'Reconstruction',      'nature_projet', 1);

insert into tva_taux (type, taux, date_debut) values
  ('standard',8.10,'2024-01-01'),('reduit',2.60,'2024-01-01'),
  ('hebergement',3.80,'2024-01-01'),('exonere',0.00,'2024-01-01');

-- Conditions de paiement réelles
insert into conditions_paiement (entite_id, type_client, libelle, ordre)
select id, null, 'Paiement net à réception de facture', 0 from entites where code='PRO'
union all select id, null, 'Paiement net à 30 jours', 1 from entites where code='PRO'
union all select id, null, 'Paiement net à 60 jours', 2 from entites where code='PRO'
union all select id, null, 'Paiement net à réception de facture', 0 from entites where code='INT'
union all select id, 'prive', '50% acompte / 30% à la livraison / solde à réception', 0 from entites where code='EXT'
union all select id, 'pro', 'Paiement net à 30 jours', 1 from entites where code='EXT'
union all select id, 'nouveau_pro', '50% acompte / solde à réception de facture', 2 from entites where code='EXT';

insert into parametres (cle, valeur) values
  ('duree_journee_ref_minutes','520'),   -- 8h40, INDICATIF (pas de blocage)
  ('semaine_ref_heures','42'),
  ('fg_coefficient_marchandises','1.25'),
  ('taux_horaire_defaut','70');
