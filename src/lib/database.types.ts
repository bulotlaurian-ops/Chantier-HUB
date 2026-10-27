// =====================================================================
// Types TypeScript générés depuis le schéma Supabase (Chantier Hub).
// ⚠️ Fichier généré — ne pas éditer à la main.
// Régénérer après toute migration (MCP generate_typescript_types).
// Aligné sur les migrations 005 (refonte) → 014 (factures fournisseurs + Storage).
// =====================================================================
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activite: {
        Row: {
          created_at: string;
          description: string | null;
          entite_id: string | null;
          id: string;
          titre: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          entite_id?: string | null;
          id?: string;
          titre: string;
          type: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          entite_id?: string | null;
          id?: string;
          titre?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activite_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
        ];
      };
      categories_tarifaires: {
        Row: {
          code: string;
          id: string;
          libelle: string;
          ordre: number;
          type: Database["public"]["Enums"]["categorie_type"];
        };
        Insert: {
          code: string;
          id?: string;
          libelle: string;
          ordre?: number;
          type: Database["public"]["Enums"]["categorie_type"];
        };
        Update: {
          code?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          type?: Database["public"]["Enums"]["categorie_type"];
        };
        Relationships: [];
      };
      chantiers: {
        Row: {
          adresse: string | null;
          archive_at: string | null;
          client_id: string;
          created_at: string;
          date_cloture: string | null;
          date_debut: string | null;
          date_fin_prevue: string | null;
          entite_id: string;
          id: string;
          marge_finale: number | null;
          nom: string;
          reference: string;
          statut: Database["public"]["Enums"]["statut_chantier"];
          ville: string | null;
        };
        Insert: {
          adresse?: string | null;
          archive_at?: string | null;
          client_id: string;
          created_at?: string;
          date_cloture?: string | null;
          date_debut?: string | null;
          date_fin_prevue?: string | null;
          entite_id: string;
          id?: string;
          marge_finale?: number | null;
          nom: string;
          reference: string;
          statut?: Database["public"]["Enums"]["statut_chantier"];
          ville?: string | null;
        };
        Update: {
          adresse?: string | null;
          archive_at?: string | null;
          client_id?: string;
          created_at?: string;
          date_cloture?: string | null;
          date_debut?: string | null;
          date_fin_prevue?: string | null;
          entite_id?: string;
          id?: string;
          marge_finale?: number | null;
          nom?: string;
          reference?: string;
          statut?: Database["public"]["Enums"]["statut_chantier"];
          ville?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chantiers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chantiers_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          adresse: string | null;
          archive_at: string | null;
          categorie_tarifaire_id: string | null;
          created_at: string;
          email: string | null;
          id: string;
          nom: string;
          raison_sociale: string | null;
          siren: string | null;
          telephone: string | null;
          type_client: Database["public"]["Enums"]["type_client"];
          ville: string | null;
        };
        Insert: {
          adresse?: string | null;
          archive_at?: string | null;
          categorie_tarifaire_id?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          nom: string;
          raison_sociale?: string | null;
          siren?: string | null;
          telephone?: string | null;
          type_client?: Database["public"]["Enums"]["type_client"];
          ville?: string | null;
        };
        Update: {
          adresse?: string | null;
          archive_at?: string | null;
          categorie_tarifaire_id?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          nom?: string;
          raison_sociale?: string | null;
          siren?: string | null;
          telephone?: string | null;
          type_client?: Database["public"]["Enums"]["type_client"];
          ville?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_categorie_tarifaire_id_fkey";
            columns: ["categorie_tarifaire_id"];
            isOneToOne: false;
            referencedRelation: "categories_tarifaires";
            referencedColumns: ["id"];
          },
        ];
      };
      compteurs_devis: {
        Row: {
          dernier: number;
          prefixe: string;
        };
        Insert: {
          dernier?: number;
          prefixe: string;
        };
        Update: {
          dernier?: number;
          prefixe?: string;
        };
        Relationships: [];
      };
      compteurs_factures: {
        Row: {
          dernier: number;
          prefixe: string;
        };
        Insert: {
          dernier?: number;
          prefixe: string;
        };
        Update: {
          dernier?: number;
          prefixe?: string;
        };
        Relationships: [];
      };
      conditions_paiement: {
        Row: {
          entite_id: string;
          id: string;
          libelle: string;
          ordre: number;
          par_defaut: boolean;
          type_client: string | null;
        };
        Insert: {
          entite_id: string;
          id?: string;
          libelle: string;
          ordre?: number;
          par_defaut?: boolean;
          type_client?: string | null;
        };
        Update: {
          entite_id?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          par_defaut?: boolean;
          type_client?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conditions_paiement_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
        ];
      };
      devis: {
        Row: {
          archive_at: string | null;
          arrondi: number;
          chantier_id: string | null;
          client_id: string;
          coefficient_global: number | null;
          conditions_paiement: string | null;
          cout_revient_total: number;
          created_at: string;
          created_by: string | null;
          date_creation: string;
          date_envoi: string | null;
          date_validite: string | null;
          entite_id: string;
          fg_mode: Database["public"]["Enums"]["fg_mode"] | null;
          fg_valeur: number | null;
          id: string;
          marge: number;
          nature_projet_id: string | null;
          notes: string | null;
          notes_ia: string | null;
          numero: string;
          objet: string | null;
          statut: Database["public"]["Enums"]["statut_devis"];
          taux_marge: number | null;
          total_ht: number;
          total_ttc: number;
          total_tva: number;
        };
        Insert: {
          archive_at?: string | null;
          arrondi?: number;
          chantier_id?: string | null;
          client_id: string;
          coefficient_global?: number | null;
          conditions_paiement?: string | null;
          cout_revient_total?: number;
          created_at?: string;
          created_by?: string | null;
          date_creation?: string;
          date_envoi?: string | null;
          date_validite?: string | null;
          entite_id: string;
          fg_mode?: Database["public"]["Enums"]["fg_mode"] | null;
          fg_valeur?: number | null;
          id?: string;
          marge?: number;
          nature_projet_id?: string | null;
          notes?: string | null;
          notes_ia?: string | null;
          numero: string;
          objet?: string | null;
          statut?: Database["public"]["Enums"]["statut_devis"];
          taux_marge?: number | null;
          total_ht?: number;
          total_ttc?: number;
          total_tva?: number;
        };
        Update: {
          archive_at?: string | null;
          arrondi?: number;
          chantier_id?: string | null;
          client_id?: string;
          coefficient_global?: number | null;
          conditions_paiement?: string | null;
          cout_revient_total?: number;
          created_at?: string;
          created_by?: string | null;
          date_creation?: string;
          date_envoi?: string | null;
          date_validite?: string | null;
          entite_id?: string;
          fg_mode?: Database["public"]["Enums"]["fg_mode"] | null;
          fg_valeur?: number | null;
          id?: string;
          marge?: number;
          nature_projet_id?: string | null;
          notes?: string | null;
          notes_ia?: string | null;
          numero?: string;
          objet?: string | null;
          statut?: Database["public"]["Enums"]["statut_devis"];
          taux_marge?: number | null;
          total_ht?: number;
          total_ttc?: number;
          total_tva?: number;
        };
        Relationships: [
          {
            foreignKeyName: "devis_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantier_couts_reels";
            referencedColumns: ["chantier_id"];
          },
          {
            foreignKeyName: "devis_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devis_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devis_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devis_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devis_nature_projet_id_fkey";
            columns: ["nature_projet_id"];
            isOneToOne: false;
            referencedRelation: "categories_tarifaires";
            referencedColumns: ["id"];
          },
        ];
      };
      entites: {
        Row: {
          adresse_societe: string | null;
          cgv: string | null;
          code: string;
          couleur: string | null;
          created_at: string;
          id: string;
          logo_url: string | null;
          mentions_legales: string | null;
          nom: string;
          prefixe_nomenclature: string | null;
          tva_sur_debits: boolean;
          validite_devis_jours: number;
        };
        Insert: {
          adresse_societe?: string | null;
          cgv?: string | null;
          code: string;
          couleur?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          mentions_legales?: string | null;
          nom: string;
          prefixe_nomenclature?: string | null;
          tva_sur_debits?: boolean;
          validite_devis_jours?: number;
        };
        Update: {
          adresse_societe?: string | null;
          cgv?: string | null;
          code?: string;
          couleur?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          mentions_legales?: string | null;
          nom?: string;
          prefixe_nomenclature?: string | null;
          tva_sur_debits?: boolean;
          validite_devis_jours?: number;
        };
        Relationships: [];
      };
      factures: {
        Row: {
          adresse_chantier: string | null;
          arrondi: number;
          autoliquidation: boolean;
          categorie_operation: Database["public"]["Enums"]["categorie_operation"] | null;
          client_id: string;
          client_raison_sociale: string | null;
          client_siren: string | null;
          client_type: Database["public"]["Enums"]["type_client"] | null;
          created_at: string;
          created_by: string | null;
          date_echeance: string;
          date_emission: string;
          date_paiement: string | null;
          devis_id: string;
          entite_id: string;
          id: string;
          numero: string;
          statut: Database["public"]["Enums"]["statut_facture_client"];
          total_ht: number;
          total_ttc: number;
          total_tva: number;
          tva_sur_debits: boolean;
        };
        Insert: {
          adresse_chantier?: string | null;
          arrondi?: number;
          autoliquidation?: boolean;
          categorie_operation?: Database["public"]["Enums"]["categorie_operation"] | null;
          client_id: string;
          client_raison_sociale?: string | null;
          client_siren?: string | null;
          client_type?: Database["public"]["Enums"]["type_client"] | null;
          created_at?: string;
          created_by?: string | null;
          date_echeance: string;
          date_emission?: string;
          date_paiement?: string | null;
          devis_id: string;
          entite_id: string;
          id?: string;
          numero: string;
          statut?: Database["public"]["Enums"]["statut_facture_client"];
          total_ht: number;
          total_ttc: number;
          total_tva: number;
          tva_sur_debits?: boolean;
        };
        Update: {
          adresse_chantier?: string | null;
          arrondi?: number;
          autoliquidation?: boolean;
          categorie_operation?: Database["public"]["Enums"]["categorie_operation"] | null;
          client_id?: string;
          client_raison_sociale?: string | null;
          client_siren?: string | null;
          client_type?: Database["public"]["Enums"]["type_client"] | null;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string;
          date_emission?: string;
          date_paiement?: string | null;
          devis_id?: string;
          entite_id?: string;
          id?: string;
          numero?: string;
          statut?: Database["public"]["Enums"]["statut_facture_client"];
          total_ht?: number;
          total_ttc?: number;
          total_tva?: number;
          tva_sur_debits?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "factures_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "factures_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "factures_devis_id_fkey";
            columns: ["devis_id"];
            isOneToOne: true;
            referencedRelation: "devis";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "factures_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
        ];
      };
      factures_fournisseurs: {
        Row: {
          cree_par: string | null;
          date: string | null;
          fichier_url: string | null;
          fournisseur: string;
          id: string;
          montant_ht: number;
          montant_ttc: number;
          nom_fichier: string | null;
          numero_facture: string | null;
          statut: Database["public"]["Enums"]["statut_facture"];
          taux_tva: number;
          uploaded_at: string;
        };
        Insert: {
          cree_par?: string | null;
          date?: string | null;
          fichier_url?: string | null;
          fournisseur: string;
          id?: string;
          montant_ht?: number;
          montant_ttc?: number;
          nom_fichier?: string | null;
          numero_facture?: string | null;
          statut?: Database["public"]["Enums"]["statut_facture"];
          taux_tva?: number;
          uploaded_at?: string;
        };
        Update: {
          cree_par?: string | null;
          date?: string | null;
          fichier_url?: string | null;
          fournisseur?: string;
          id?: string;
          montant_ht?: number;
          montant_ttc?: number;
          nom_fichier?: string | null;
          numero_facture?: string | null;
          statut?: Database["public"]["Enums"]["statut_facture"];
          taux_tva?: number;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "factures_fournisseurs_cree_par_fkey";
            columns: ["cree_par"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      factures_repartition: {
        Row: {
          comptabilise: boolean;
          chantier_id: string;
          facture_id: string;
          id: string;
          montant_ht_affecte: number;
        };
        Insert: {
          comptabilise?: boolean;
          chantier_id: string;
          facture_id: string;
          id?: string;
          montant_ht_affecte: number;
        };
        Update: {
          comptabilise?: boolean;
          chantier_id?: string;
          facture_id?: string;
          id?: string;
          montant_ht_affecte?: number;
        };
        Relationships: [
          {
            foreignKeyName: "factures_repartition_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantier_couts_reels";
            referencedColumns: ["chantier_id"];
          },
          {
            foreignKeyName: "factures_repartition_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "factures_repartition_facture_id_fkey";
            columns: ["facture_id"];
            isOneToOne: false;
            referencedRelation: "factures_fournisseurs";
            referencedColumns: ["id"];
          },
        ];
      };
      lignes_facture: {
        Row: {
          est_option: boolean;
          est_titre: boolean;
          facture_id: string;
          id: string;
          libelle: string;
          ordre: number;
          prix_unitaire_ht: number;
          quantite: number;
          remise_pct: number;
          taux_tva: number;
          total_ht: number;
          unite: string | null;
        };
        Insert: {
          est_option?: boolean;
          est_titre?: boolean;
          facture_id: string;
          id?: string;
          libelle: string;
          ordre?: number;
          prix_unitaire_ht: number;
          quantite: number;
          remise_pct?: number;
          taux_tva: number;
          total_ht: number;
          unite?: string | null;
        };
        Update: {
          est_option?: boolean;
          est_titre?: boolean;
          facture_id?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          prix_unitaire_ht?: number;
          quantite?: number;
          remise_pct?: number;
          taux_tva?: number;
          total_ht?: number;
          unite?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lignes_facture_facture_id_fkey";
            columns: ["facture_id"];
            isOneToOne: false;
            referencedRelation: "factures";
            referencedColumns: ["id"];
          },
        ];
      };
      lignes_devis: {
        Row: {
          code: string | null;
          devis_id: string;
          est_option: boolean;
          est_titre: boolean;
          id: string;
          libelle: string;
          ordre: number;
          poste_id: string | null;
          prestation_id: string | null;
          prestation_parente_id: string | null;
          prix_revient_unitaire: number;
          prix_unitaire_ht: number;
          quantite: number;
          remise_pct: number;
          taux_tva: number;
          temps_par_unite: number | null;
          total_ht: number;
          unite: string | null;
        };
        Insert: {
          code?: string | null;
          devis_id: string;
          est_option?: boolean;
          est_titre?: boolean;
          id?: string;
          libelle: string;
          ordre?: number;
          poste_id?: string | null;
          prestation_id?: string | null;
          prestation_parente_id?: string | null;
          prix_revient_unitaire?: number;
          prix_unitaire_ht?: number;
          quantite?: number;
          remise_pct?: number;
          taux_tva?: number;
          temps_par_unite?: number | null;
          total_ht?: number;
          unite?: string | null;
        };
        Update: {
          code?: string | null;
          devis_id?: string;
          est_option?: boolean;
          est_titre?: boolean;
          id?: string;
          libelle?: string;
          ordre?: number;
          poste_id?: string | null;
          prestation_id?: string | null;
          prestation_parente_id?: string | null;
          prix_revient_unitaire?: number;
          prix_unitaire_ht?: number;
          quantite?: number;
          remise_pct?: number;
          taux_tva?: number;
          temps_par_unite?: number | null;
          total_ht?: number;
          unite?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lignes_devis_devis_id_fkey";
            columns: ["devis_id"];
            isOneToOne: false;
            referencedRelation: "devis";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lignes_devis_poste_id_fkey";
            columns: ["poste_id"];
            isOneToOne: false;
            referencedRelation: "postes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lignes_devis_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lignes_devis_prestation_parente_id_fkey";
            columns: ["prestation_parente_id"];
            isOneToOne: false;
            referencedRelation: "lignes_devis";
            referencedColumns: ["id"];
          },
        ];
      };
      parametres: {
        Row: {
          cle: string;
          valeur: string;
        };
        Insert: {
          cle: string;
          valeur: string;
        };
        Update: {
          cle?: string;
          valeur?: string;
        };
        Relationships: [];
      };
      pointages: {
        Row: {
          comptabilise: boolean;
          chantier_id: string;
          created_at: string;
          date: string;
          heure_debut: string | null;
          heure_fin: string | null;
          heures_trajet: number;
          heures_travaillees: number;
          id: string;
          note: string | null;
          ouvrier_id: string;
        };
        Insert: {
          comptabilise?: boolean;
          chantier_id: string;
          created_at?: string;
          date: string;
          heure_debut?: string | null;
          heure_fin?: string | null;
          heures_trajet?: number;
          heures_travaillees?: number;
          id?: string;
          note?: string | null;
          ouvrier_id: string;
        };
        Update: {
          comptabilise?: boolean;
          chantier_id?: string;
          created_at?: string;
          date?: string;
          heure_debut?: string | null;
          heure_fin?: string | null;
          heures_trajet?: number;
          heures_travaillees?: number;
          id?: string;
          note?: string | null;
          ouvrier_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pointages_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantier_couts_reels";
            referencedColumns: ["chantier_id"];
          },
          {
            foreignKeyName: "pointages_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pointages_ouvrier_id_fkey";
            columns: ["ouvrier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      postes: {
        Row: {
          id: string;
          inclus_defaut: boolean;
          libelle: string;
          ordre: number;
          prestation_id: string;
          prix_brut: number;
          temps_par_unite: number | null;
          unite: Database["public"]["Enums"]["unite"];
        };
        Insert: {
          id?: string;
          inclus_defaut?: boolean;
          libelle: string;
          ordre?: number;
          prestation_id: string;
          prix_brut?: number;
          temps_par_unite?: number | null;
          unite: Database["public"]["Enums"]["unite"];
        };
        Update: {
          id?: string;
          inclus_defaut?: boolean;
          libelle?: string;
          ordre?: number;
          prestation_id?: string;
          prix_brut?: number;
          temps_par_unite?: number | null;
          unite?: Database["public"]["Enums"]["unite"];
        };
        Relationships: [
          {
            foreignKeyName: "postes_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
        ];
      };
      prestation_packs: {
        Row: {
          created_at: string;
          id: string;
          ordre: number | null;
          prestation_id: string;
          prestation_liee_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ordre?: number | null;
          prestation_id: string;
          prestation_liee_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ordre?: number | null;
          prestation_id?: string;
          prestation_liee_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prestation_packs_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prestation_packs_prestation_liee_id_fkey";
            columns: ["prestation_liee_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
        ];
      };
      prestations: {
        Row: {
          actif: boolean;
          code: string | null;
          code_cfc: string | null;
          code_cfc_libelle: string | null;
          created_at: string;
          created_by: string | null;
          entite: string | null;
          famille: string | null;
          fournisseur: string | null;
          id: string;
          libelle: string;
          prix_achat_net: number | null;
          prix_vente_reference: number;
          source: string | null;
          statut_validation: Database["public"]["Enums"]["statut_validation"];
          temps_par_unite: number | null;
          type_tva: Database["public"]["Enums"]["type_tva"];
          unite: Database["public"]["Enums"]["unite"];
        };
        Insert: {
          actif?: boolean;
          code?: string | null;
          code_cfc?: string | null;
          code_cfc_libelle?: string | null;
          created_at?: string;
          created_by?: string | null;
          entite?: string | null;
          famille?: string | null;
          fournisseur?: string | null;
          id?: string;
          libelle: string;
          prix_achat_net?: number | null;
          prix_vente_reference?: number;
          source?: string | null;
          statut_validation?: Database["public"]["Enums"]["statut_validation"];
          temps_par_unite?: number | null;
          type_tva?: Database["public"]["Enums"]["type_tva"];
          unite: Database["public"]["Enums"]["unite"];
        };
        Update: {
          actif?: boolean;
          code?: string | null;
          code_cfc?: string | null;
          code_cfc_libelle?: string | null;
          created_at?: string;
          created_by?: string | null;
          entite?: string | null;
          famille?: string | null;
          fournisseur?: string | null;
          id?: string;
          libelle?: string;
          prix_achat_net?: number | null;
          prix_vente_reference?: number;
          source?: string | null;
          statut_validation?: Database["public"]["Enums"]["statut_validation"];
          temps_par_unite?: number | null;
          type_tva?: Database["public"]["Enums"]["type_tva"];
          unite?: Database["public"]["Enums"]["unite"];
        };
        Relationships: [
          {
            foreignKeyName: "prestations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          actif: boolean;
          created_at: string;
          id: string;
          nom: string;
          prenom: string | null;
          role: Database["public"]["Enums"]["role_app"];
          taux_horaire: number | null;
        };
        Insert: {
          actif?: boolean;
          created_at?: string;
          id: string;
          nom: string;
          prenom?: string | null;
          role?: Database["public"]["Enums"]["role_app"];
          taux_horaire?: number | null;
        };
        Update: {
          actif?: boolean;
          created_at?: string;
          id?: string;
          nom?: string;
          prenom?: string | null;
          role?: Database["public"]["Enums"]["role_app"];
          taux_horaire?: number | null;
        };
        Relationships: [];
      };
      snapshots_marge: {
        Row: {
          ca_prevu: number;
          chantier_id: string | null;
          couts_estimes: number;
          created_at: string;
          created_by: string | null;
          date_snapshot: string;
          devis_id: string | null;
          id: string;
          marge_prevue: number;
          montant_ht_reference: number;
          type: string;
        };
        Insert: {
          ca_prevu?: number;
          chantier_id?: string | null;
          couts_estimes?: number;
          created_at?: string;
          created_by?: string | null;
          date_snapshot?: string;
          devis_id?: string | null;
          id?: string;
          marge_prevue?: number;
          montant_ht_reference?: number;
          type?: string;
        };
        Update: {
          ca_prevu?: number;
          chantier_id?: string | null;
          couts_estimes?: number;
          created_at?: string;
          created_by?: string | null;
          date_snapshot?: string;
          devis_id?: string | null;
          id?: string;
          marge_prevue?: number;
          montant_ht_reference?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_marge_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantier_couts_reels";
            referencedColumns: ["chantier_id"];
          },
          {
            foreignKeyName: "snapshots_marge_chantier_id_fkey";
            columns: ["chantier_id"];
            isOneToOne: false;
            referencedRelation: "chantiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_marge_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_marge_devis_id_fkey";
            columns: ["devis_id"];
            isOneToOne: false;
            referencedRelation: "devis";
            referencedColumns: ["id"];
          },
        ];
      };
      sous_postes: {
        Row: {
          id: string;
          libelle: string;
          ordre: number;
          poste_id: string;
          prix_brut: number;
          temps_par_unite: number | null;
          unite: Database["public"]["Enums"]["unite"];
        };
        Insert: {
          id?: string;
          libelle: string;
          ordre?: number;
          poste_id: string;
          prix_brut?: number;
          temps_par_unite?: number | null;
          unite: Database["public"]["Enums"]["unite"];
        };
        Update: {
          id?: string;
          libelle?: string;
          ordre?: number;
          poste_id?: string;
          prix_brut?: number;
          temps_par_unite?: number | null;
          unite?: Database["public"]["Enums"]["unite"];
        };
        Relationships: [
          {
            foreignKeyName: "sous_postes_poste_id_fkey";
            columns: ["poste_id"];
            isOneToOne: false;
            referencedRelation: "postes";
            referencedColumns: ["id"];
          },
        ];
      };
      tarifs: {
        Row: {
          categorie_id: string;
          id: string;
          mode: Database["public"]["Enums"]["mode_tarif"];
          prestation_id: string;
          valeur: number;
        };
        Insert: {
          categorie_id: string;
          id?: string;
          mode: Database["public"]["Enums"]["mode_tarif"];
          prestation_id: string;
          valeur: number;
        };
        Update: {
          categorie_id?: string;
          id?: string;
          mode?: Database["public"]["Enums"]["mode_tarif"];
          prestation_id?: string;
          valeur?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tarifs_categorie_id_fkey";
            columns: ["categorie_id"];
            isOneToOne: false;
            referencedRelation: "categories_tarifaires";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tarifs_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
        ];
      };
      tva_taux: {
        Row: {
          created_at: string;
          date_debut: string;
          date_fin: string | null;
          id: string;
          taux: number;
          type: Database["public"]["Enums"]["type_tva"];
        };
        Insert: {
          created_at?: string;
          date_debut: string;
          date_fin?: string | null;
          id?: string;
          taux: number;
          type: Database["public"]["Enums"]["type_tva"];
        };
        Update: {
          created_at?: string;
          date_debut?: string;
          date_fin?: string | null;
          id?: string;
          taux?: number;
          type?: Database["public"]["Enums"]["type_tva"];
        };
        Relationships: [];
      };
      user_entites: {
        Row: {
          entite_id: string;
          profile_id: string;
        };
        Insert: {
          entite_id: string;
          profile_id: string;
        };
        Update: {
          entite_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_entites_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_entites_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      chantier_couts_reels: {
        Row: {
          chantier_id: string | null;
          cout_fournisseurs_reel: number | null;
          cout_mo_reel: number | null;
          marge_reelle_chf: number | null;
          marge_reelle_pct: number | null;
          montant_reference: number | null;
        };
        Insert: {
          chantier_id?: string | null;
          cout_fournisseurs_reel?: never;
          cout_mo_reel?: never;
          marge_reelle_chf?: never;
          marge_reelle_pct?: never;
          montant_reference?: never;
        };
        Update: {
          chantier_id?: string | null;
          cout_fournisseurs_reel?: never;
          cout_mo_reel?: never;
          marge_reelle_chf?: never;
          marge_reelle_pct?: never;
          montant_reference?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      chantier_entite: { Args: { p_chantier: string }; Returns: string };
      current_role_app: {
        Args: never;
        Returns: Database["public"]["Enums"]["role_app"];
      };
      dashboard_kpis: {
        Args: { p_from: string; p_to: string; p_entite?: string };
        Returns: Json;
      };
      facture_cree_par: { Args: { p_facture: string }; Returns: string };
      facture_statut: {
        Args: { p_facture: string };
        Returns: Database["public"]["Enums"]["statut_facture"];
      };
      facture_visible_conducteur: {
        Args: { p_facture: string };
        Returns: boolean;
      };
      generer_numero_devis: { Args: never; Returns: string };
      generer_numero_facture: { Args: never; Returns: string };
      generer_reference_chantier: {
        Args: { p_client: string; p_ville: string };
        Returns: string;
      };
      ouvrier_a_pointe: { Args: { p_chantier: string }; Returns: boolean };
      ouvrier_voit_client: { Args: { p_client: string }; Returns: boolean };
      safe_uuid: { Args: { p: string }; Returns: string };
      user_a_acces_entite: { Args: { p_entite: string }; Returns: boolean };
    };
    Enums: {
      categorie_operation: "biens" | "services" | "mixte";
      categorie_type: "client" | "nature_projet";
      fg_mode: "pourcentage" | "fixe" | "coefficient";
      mode_tarif: "remise_pct" | "coefficient" | "prix_absolu";
      role_app: "admin" | "conducteur" | "ouvrier";
      statut_chantier: "prospect" | "actif" | "cloture";
      statut_devis: "brouillon" | "envoye" | "accepte" | "refuse" | "expire";
      statut_facture: "a_valider" | "valide";
      statut_facture_client: "emise" | "payee";
      statut_validation: "pending" | "valide" | "rejete";
      type_client: "particulier" | "professionnel";
      type_tva: "standard" | "reduit" | "hebergement" | "exonere";
      unite: "m2" | "ml" | "pce" | "u" | "fft" | "h" | "forfait";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      categorie_operation: ["biens", "services", "mixte"],
      categorie_type: ["client", "nature_projet"],
      fg_mode: ["pourcentage", "fixe", "coefficient"],
      mode_tarif: ["remise_pct", "coefficient", "prix_absolu"],
      role_app: ["admin", "conducteur", "ouvrier"],
      statut_chantier: ["prospect", "actif", "cloture"],
      statut_devis: ["brouillon", "envoye", "accepte", "refuse", "expire"],
      statut_facture: ["a_valider", "valide"],
      statut_facture_client: ["emise", "payee"],
      statut_validation: ["pending", "valide", "rejete"],
      type_client: ["particulier", "professionnel"],
      type_tva: ["standard", "reduit", "hebergement", "exonere"],
      unite: ["m2", "ml", "pce", "u", "fft", "h", "forfait"],
    },
  },
} as const;
