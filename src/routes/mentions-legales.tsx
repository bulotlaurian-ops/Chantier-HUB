import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, Section, V } from "@/components/LegalLayout";
import { LEGAL } from "@/lib/legal-config";
import { APP } from "@/config/entreprise";

export const Route = createFileRoute("/mentions-legales")({ component: MentionsLegales });

function MentionsLegales() {
  const { editeur, entreprise, supabase } = LEGAL;
  return (
    <LegalLayout titre="Mentions légales">
      <Section titre="Éditeur de l'application">
        <p>
          L'application {APP.nom} est éditée par <V v={editeur.nom} />, <V v={editeur.statut} />,
          immatriculé sous le numéro SIRET <V v={editeur.siret} />, dont l'adresse est{" "}
          <V v={editeur.adresse} />.
        </p>
        <p>
          Contact : <V v={editeur.email} />.
        </p>
        <p>
          Directeur de la publication : <V v={editeur.nom} />.
        </p>
      </Section>

      <Section titre="Entreprise utilisatrice">
        <p>
          L'application est mise à disposition de {entreprise.nom} ({entreprise.forme}), SIRET{" "}
          {entreprise.siret}, {entreprise.adresse}. Représentant légal :{" "}
          <V v={entreprise.representant} />.
        </p>
        <p>
          Contact : {entreprise.email}, {entreprise.telephone}.
        </p>
      </Section>

      <Section titre="Hébergement">
        <p>
          Application web (code et interface) : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA
          91723, États-Unis.
        </p>
        <p>
          Base de données, authentification et fichiers : Supabase, Inc., <V v={supabase.adresse} />
          . Région d'hébergement des données : <V v={supabase.region} />.
        </p>
      </Section>

      <Section titre="Accès à l'application">
        <p>
          L'accès est réservé aux personnes disposant d'un compte créé par l'administrateur de
          l'entreprise utilisatrice. Les conditions d'usage figurent dans les{" "}
          <Link to="/cgu" className="underline underline-offset-4">
            conditions d'utilisation
          </Link>
          .
        </p>
      </Section>

      <Section titre="Propriété intellectuelle">
        <p>
          Le code, l'interface, les textes et les éléments graphiques de l'application sont protégés
          par le droit de la propriété intellectuelle. Toute reproduction ou réutilisation sans
          autorisation écrite de l'éditeur est interdite. Les données saisies par l'entreprise
          (clients, devis, factures, prix) restent sa propriété.
        </p>
      </Section>

      <Section titre="Données personnelles et cookies">
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <Link to="/confidentialite" className="underline underline-offset-4">
            politique de confidentialité
          </Link>
          . L'utilisation des cookies et du stockage local est décrite dans la{" "}
          <Link to="/cookies" className="underline underline-offset-4">
            politique de cookies
          </Link>
          .
        </p>
      </Section>

      <Section titre="Droit applicable">
        <p>
          Les présentes mentions sont soumises au droit français. En cas de litige, les tribunaux
          français sont compétents.
        </p>
      </Section>
    </LegalLayout>
  );
}
