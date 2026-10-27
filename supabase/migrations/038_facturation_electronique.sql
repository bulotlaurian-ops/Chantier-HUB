-- =====================================================================
-- Chantier Hub — 038 : préparation à la facture électronique (phase 1)
-- =====================================================================
-- Réforme française : émission électronique obligatoire pour les TPE/PME au
-- 1er septembre 2027 (clients professionnels, via une Plateforme Agréée). Les
-- clients particuliers restent en PDF/papier mais passent en e-reporting.
-- Cette migration pose uniquement les DONNÉES et les nouvelles mentions légales :
-- pas de Factur-X, pas d'API de plateforme (phase 2). Idempotent.
--
-- Factures déjà émises : aucune ligne existante n'est réécrite. Les colonnes de
-- gel ajoutées sur `factures` sont nullables (null = facture émise avant 038) ;
-- seules autoliquidation / tva_sur_debits reçoivent false, ce qui est exact pour
-- toutes les factures antérieures.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Types.
-- ---------------------------------------------------------------------
do $$ begin
  create type type_client as enum ('particulier', 'professionnel');
exception when duplicate_object then null; end $$;

-- Nouvelle mention obligatoire : nature de l'opération facturée.
do $$ begin
  create type categorie_operation as enum ('biens', 'services', 'mixte');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- B. Clients : particulier / professionnel + SIREN.
--    Tous les clients existants passent en 'particulier' (valeur par défaut) ;
--    les pros (SCI, syndics, bailleurs, entreprises) sont à requalifier à la main.
-- ---------------------------------------------------------------------
alter table clients add column if not exists type_client type_client not null default 'particulier';
alter table clients add column if not exists siren text;
alter table clients add column if not exists raison_sociale text;

-- SIREN = 9 chiffres (la clé de Luhn est contrôlée côté app, message plus clair).
do $$ begin
  alter table clients add constraint clients_siren_format
    check (siren is null or siren ~ '^[0-9]{9}$');
exception when duplicate_object then null; end $$;

-- Un client professionnel doit porter un SIREN (mention obligatoire sur ses factures).
do $$ begin
  alter table clients add constraint clients_siren_si_pro
    check (type_client = 'particulier' or siren is not null);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- C. Entités : option « TVA sur les débits » (choix fiscal de l'entreprise,
--    réglé une fois par entité dans Paramètres, mention imprimée si activée).
-- ---------------------------------------------------------------------
alter table entites add column if not exists tva_sur_debits boolean not null default false;

-- ---------------------------------------------------------------------
-- D. Factures : gel des nouvelles mentions au moment de l'émission (même
--    principe que lignes_facture, cf. 036) — une facture émise ne bouge plus si
--    la fiche client ou le chantier sont modifiés après coup.
-- ---------------------------------------------------------------------
alter table factures add column if not exists client_type          type_client;
alter table factures add column if not exists client_siren         text;
alter table factures add column if not exists client_raison_sociale text;
alter table factures add column if not exists categorie_operation  categorie_operation;
alter table factures add column if not exists adresse_chantier     text;
alter table factures add column if not exists autoliquidation      boolean not null default false;
alter table factures add column if not exists tva_sur_debits       boolean not null default false;

-- Autoliquidation (sous-traitance BTP) : uniquement entre professionnels, et
-- sans TVA facturée (elle est due par le preneur).
do $$ begin
  alter table factures add constraint factures_autoliquidation_pro
    check (not autoliquidation or (client_type = 'professionnel' and total_tva = 0));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- E. Pas de nouvelle table : RLS et GRANT existants (005, 032, 036) couvrent
--    déjà les colonnes ajoutées sur clients, entites et factures.
-- ---------------------------------------------------------------------
