import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, Liste, Section, V } from "@/components/LegalLayout";
import { LEGAL } from "@/lib/legal-config";
import { APP } from "@/config/entreprise";

export const Route = createFileRoute("/cgu")({ component: Cgu });

function Cgu() {
  const { entreprise, editeur } = LEGAL;
  return (
    <LegalLayout titre="Conditions d'utilisation">
      <Section titre="1. Objet">
        <p>
          {APP.nom} est un outil de gestion de devis, de chantiers, de factures et de suivi des
          heures, édité par <V v={editeur.nom} /> (l'« Éditeur ») et mis à disposition de{" "}
          {entreprise.nom} (l'« Entreprise »). Les présentes conditions encadrent l'usage de
          l'application par les personnes qui y accèdent (les « Utilisateurs »).
        </p>
        <p>
          Se connecter à l'application vaut acceptation de ces conditions. Les conditions
          commerciales entre l'Éditeur et l'Entreprise (prix, durée, support) relèvent d'un contrat
          distinct.
        </p>
      </Section>

      <Section titre="2. Accès et comptes">
        <Liste>
          <li>L'accès est réservé aux personnes dont un compte a été créé par l'administrateur.</li>
          <li>
            Chaque compte est personnel. L'Utilisateur garde son mot de passe confidentiel et ne le
            communique à personne. Toute action effectuée avec son compte lui est attribuée.
          </li>
          <li>
            L'Utilisateur prévient sans délai l'administrateur en cas de perte ou de suspicion de
            vol de ses identifiants.
          </li>
          <li>
            Les droits (administrateur, conducteur, ouvrier) sont définis par l'administrateur. Un
            compte peut être désactivé à tout moment, notamment en cas de fin de la relation de
            travail ou d'usage contraire aux présentes conditions.
          </li>
        </Liste>
      </Section>

      <Section titre="3. Usage autorisé">
        <p>
          L'Utilisateur s'engage à utiliser l'application uniquement pour l'activité de l'Entreprise
          et à ne pas :
        </p>
        <Liste>
          <li>
            tenter d'accéder à des données ou des fonctions qui ne sont pas prévues pour son rôle ;
          </li>
          <li>
            perturber le fonctionnement de l'application, la surcharger ou contourner ses
            protections ;
          </li>
          <li>saisir des données fausses, notamment des heures qui n'ont pas été effectuées ;</li>
          <li>
            importer des contenus illicites ou des données personnelles sans rapport avec l'activité
            ;
          </li>
          <li>copier, revendre ou réutiliser l'application ou son code.</li>
        </Liste>
      </Section>

      <Section titre="4. Responsabilité de l'Utilisateur sur les documents émis">
        <p>
          L'application calcule les montants, applique les taux de TVA saisis et génère des devis et
          des factures au format PDF. Ces éléments sont une aide : l'Entreprise et l'Utilisateur
          restent responsables de l'exactitude des prix, des quantités, des taux de TVA, des
          mentions légales et des conditions figurant sur les documents envoyés à leurs clients.
          Relisez chaque document avant de l'émettre.
        </p>
        <p>
          Les conditions générales de vente et les mentions légales imprimées sur les documents sont
          un texte de base. Elles doivent être validées par l'Entreprise, au besoin avec un conseil
          juridique, avant usage.
        </p>
        <p>
          Une facture émise ne peut pas être supprimée. En cas d'erreur, il faut émettre un avoir ou
          une facture rectificative en dehors de l'application.
        </p>
      </Section>

      <Section titre="5. Fonctions d'intelligence artificielle">
        <p>
          Le devis assisté et la lecture automatique de documents utilisent un service
          d'intelligence artificielle. Leurs résultats peuvent contenir des erreurs (mauvaise
          désignation, quantité ou montant mal lu). Ils sont proposés à relecture et ne sont validés
          qu'après vérification par l'Utilisateur, qui en assume le contrôle. Le traitement des
          données par ces fonctions est décrit dans la{" "}
          <Link to="/confidentialite" className="underline underline-offset-4">
            politique de confidentialité
          </Link>
          .
        </p>
      </Section>

      <Section titre="6. Données">
        <p>
          Les données saisies (clients, prix, devis, factures, heures) appartiennent à l'Entreprise.
          L'Éditeur les traite uniquement pour faire fonctionner le service, conformément à la{" "}
          <Link to="/confidentialite" className="underline underline-offset-4">
            politique de confidentialité
          </Link>
          . L'Entreprise est responsable de la licéité des données qu'elle enregistre et de
          l'information de ses salariés et de ses clients.
        </p>
      </Section>

      <Section titre="7. Disponibilité">
        <p>
          L'Éditeur met en œuvre les moyens raisonnables pour que l'application soit disponible et
          sauvegardée, sans garantie d'accès continu : des interruptions peuvent survenir pour
          maintenance, mise à jour ou en raison de la défaillance d'un hébergeur. Il est recommandé
          à l'Entreprise de conserver une copie de ses documents importants (PDF de devis et de
          factures).
        </p>
      </Section>

      <Section titre="8. Responsabilité de l'Éditeur">
        <p>
          L'application est fournie en l'état. L'Éditeur n'est pas responsable des dommages
          indirects (perte de chiffre d'affaires, de clientèle, de données saisies par erreur) ni
          des conséquences d'une erreur de saisie, d'un calcul non relu ou d'un document émis sans
          vérification. Sa responsabilité ne peut excéder les sommes effectivement payées par
          l'Entreprise pour le service au cours des douze derniers mois, sauf faute lourde ou
          dolosive, ou disposition légale contraire.
        </p>
      </Section>

      <Section titre="9. Propriété intellectuelle">
        <p>
          L'application, son code et son interface restent la propriété de l'Éditeur. L'accès
          confère un droit d'usage personnel, non exclusif et non transférable, pour la durée
          d'accès au service.
        </p>
      </Section>

      <Section titre="10. Modification des conditions">
        <p>
          Ces conditions peuvent évoluer. La date de dernière mise à jour figure en haut de la page.
          Continuer à utiliser l'application après une modification vaut acceptation de la nouvelle
          version.
        </p>
      </Section>

      <Section titre="11. Droit applicable et contact">
        <p>
          Les présentes conditions sont soumises au droit français. Pour toute question ou
          réclamation, contactez {entreprise.email} ou l'Éditeur à <V v={editeur.email} />. À défaut
          d'accord amiable, les tribunaux français sont compétents.
        </p>
        <p>
          Voir aussi les{" "}
          <Link to="/mentions-legales" className="underline underline-offset-4">
            mentions légales
          </Link>{" "}
          et la{" "}
          <Link to="/cookies" className="underline underline-offset-4">
            politique de cookies
          </Link>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
