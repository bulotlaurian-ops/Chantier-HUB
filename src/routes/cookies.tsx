import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, Liste, Section, Tableau } from "@/components/LegalLayout";
import { APP } from "@/config/entreprise";

export const Route = createFileRoute("/cookies")({ component: Cookies });

function Cookies() {
  return (
    <LegalLayout titre="Politique de cookies">
      <Section titre="En bref">
        <p>
          {APP.nom} n'utilise aucun cookie publicitaire, aucun outil de mesure d'audience et aucun
          traceur de réseau social ou de service tiers. Seuls sont utilisés des éléments techniques
          indispensables au fonctionnement de l'application ou à une préférence que vous avez
          choisie. Pour cette raison, aucun bandeau de consentement n'est affiché.
        </p>
      </Section>

      <Section titre="Ce qui est stocké sur votre appareil">
        <Tableau
          entetes={["Nom", "Type", "Rôle", "Durée"]}
          lignes={[
            [
              "sb-…-auth-token",
              "Stockage local",
              "Maintient votre session de connexion (fournisseur : Supabase).",
              "Durée de la session, renouvelée automatiquement. Effacé à la déconnexion.",
            ],
            [
              "theme",
              "Stockage local",
              "Mémorise votre choix d'affichage clair ou sombre.",
              "Jusqu'à effacement des données du navigateur.",
            ],
            [
              "Brouillons de saisie",
              "Stockage local",
              "Conserve un devis en cours de saisie si vous quittez la page par erreur.",
              "Jusqu'à la validation du devis ou l'effacement des données du navigateur.",
            ],
            [
              "sidebar_state",
              "Cookie",
              "Mémorise si le menu latéral est ouvert ou replié.",
              "7 jours.",
            ],
          ]}
        />
        <p>
          Ces éléments ne sont pas transmis à des tiers et ne servent ni à vous suivre d'un site à
          l'autre ni à mesurer votre activité.
        </p>
      </Section>

      <Section titre="Pourquoi aucun consentement n'est demandé">
        <p>
          La réglementation (article 82 de la loi Informatique et Libertés, lignes directrices de la
          CNIL sur les traceurs) exempte de consentement les traceurs strictement nécessaires au
          service demandé, ainsi que ceux qui mémorisent un choix de l'utilisateur. C'est le cas de
          tous les éléments listés ci-dessus.
        </p>
      </Section>

      <Section titre="Polices de caractères">
        <p>
          La police d'affichage est hébergée avec l'application. Aucune requête n'est envoyée à un
          service de polices externe lors de votre visite.
        </p>
      </Section>

      <Section titre="Gérer ou supprimer ces données">
        <Liste>
          <li>
            Vous pouvez effacer les cookies et le stockage local depuis les réglages de votre
            navigateur. Vous serez alors déconnecté et vos préférences seront réinitialisées.
          </li>
          <li>
            Bloquer ces éléments empêche la connexion : l'application ne peut pas fonctionner sans
            eux.
          </li>
        </Liste>
      </Section>

      <Section titre="Évolution">
        <p>
          Si un outil de mesure d'audience ou un service tiers utilisant des traceurs était ajouté,
          cette page serait mise à jour et votre consentement serait demandé avant tout dépôt. Pour
          le reste du traitement des données, consultez la{" "}
          <Link to="/confidentialite" className="underline underline-offset-4">
            politique de confidentialité
          </Link>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
