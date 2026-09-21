import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, Liste, Section, Tableau, V } from "@/components/LegalLayout";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/confidentialite")({ component: Confidentialite });

function Confidentialite() {
  const { entreprise, editeur, supabase, n8n } = LEGAL;
  return (
    <LegalLayout titre="Politique de confidentialité">
      <Section titre="Qui est responsable de vos données">
        <p>
          Le responsable du traitement est {entreprise.nom} ({entreprise.forme}), SIRET{" "}
          {entreprise.siret}, {entreprise.adresse}. Contact : {entreprise.email}.
        </p>
        <p>
          L'application est développée et exploitée par <V v={editeur.nom} />, qui agit en qualité
          de sous-traitant au sens de l'article 28 du RGPD : les données sont traitées uniquement
          pour le compte de l'entreprise et selon ses instructions.
        </p>
      </Section>

      <Section titre="Données traitées, finalités et durées">
        <Tableau
          entetes={["Données", "Pourquoi", "Base légale", "Durée de conservation"]}
          lignes={[
            [
              "Comptes utilisateurs : nom, prénom, identifiant de connexion (e-mail), rôle, mot de passe (stocké haché, jamais lisible), date de dernière connexion.",
              "Gérer l'accès sécurisé à l'application.",
              "Exécution du contrat ou de la relation de travail, intérêt légitime (sécurité).",
              "Tant que le compte est actif. Désactivation ou suppression à la demande de l'entreprise.",
            ],
            [
              "Heures pointées : date, chantier, nombre d'heures. Taux horaire utilisé pour calculer le coût de main-d'œuvre.",
              "Suivre le temps passé par chantier, calculer les marges, décompter le temps de travail.",
              "Obligation légale (décompte du temps de travail) et intérêt légitime de l'employeur.",
              "Durée de la relation de travail, puis archivage selon les délais légaux (au minimum 1 an, article D. 3171-16 du Code du travail).",
            ],
            [
              "Clients de l'entreprise : nom, adresse, ville, téléphone, e-mail.",
              "Établir les devis et factures, suivre la relation commerciale.",
              "Mesures précontractuelles et exécution du contrat, obligation légale de facturation.",
              "Durée de la relation commerciale, puis archivage des pièces comptables.",
            ],
            [
              "Devis, factures clients, factures fournisseurs (documents et montants).",
              "Facturer, suivre les paiements, tenir la comptabilité.",
              "Obligation légale.",
              "10 ans (article L. 123-22 du Code de commerce).",
            ],
            [
              "Données techniques : adresse IP et journaux de connexion ou d'erreur enregistrés par les hébergeurs.",
              "Sécurité, détection d'incidents, bon fonctionnement du service.",
              "Intérêt légitime.",
              "Selon les paramètres de chaque hébergeur.",
            ],
          ]}
        />
        <p>
          Aucune géolocalisation n'est collectée. Aucune donnée n'est utilisée à des fins de
          publicité ou de prospection, ni revendue.
        </p>
      </Section>

      <Section titre="Fonctions d'assistance par intelligence artificielle">
        <p>
          Trois fonctions envoient du contenu à un service d'intelligence artificielle pour en
          extraire des informations : le devis assisté (dictée vocale enregistrée avec le micro de
          l'appareil, ou texte saisi), la lecture automatique des factures fournisseurs et la
          lecture automatique des devis de sous-traitants (documents importés). Le contenu transite
          par un flux d'automatisation (n8n) puis par OpenAI, qui renvoie les informations
          extraites.
        </p>
        <Liste>
          <li>
            Ces fonctions ne sont déclenchées que par une action de l'utilisateur (lancer une
            dictée, importer un document). Le navigateur demande l'autorisation d'utiliser le micro,
            et l'enregistrement n'a lieu que pendant la dictée.
          </li>
          <li>L'enregistrement audio n'est pas conservé dans la base de l'application.</li>
          <li>
            Le résultat est toujours proposé à relecture : rien n'est validé automatiquement et
            aucune décision produisant un effet juridique n'est prise sans intervention humaine.
          </li>
          <li>
            N'importez pas de document contenant des données sans rapport avec l'usage prévu (par
            exemple des pièces d'identité).
          </li>
        </Liste>
      </Section>

      <Section titre="Qui reçoit vos données">
        <p>
          Les données ne sont accessibles qu'aux utilisateurs autorisés de l'entreprise, selon leur
          rôle : l'administrateur voit tout, le conducteur voit les devis et chantiers de ses
          entités, l'ouvrier ne voit que ses propres heures et les chantiers actifs. Elles sont
          également traitées par les sous-traitants techniques suivants.
        </p>
        <Tableau
          entetes={["Sous-traitant", "Rôle", "Localisation"]}
          lignes={[
            ["Vercel Inc.", "Hébergement de l'application web", "États-Unis"],
            [
              "Supabase, Inc.",
              "Base de données, authentification, stockage des fichiers, envoi des e-mails de réinitialisation de mot de passe",
              <V key="s" v={supabase.region} />,
            ],
            [
              "n8n",
              "Automatisation relayant les demandes d'assistance IA",
              <V key="n" v={n8n.hebergement} />,
            ],
            [
              "OpenAI",
              "Analyse des textes et documents pour les fonctions d'assistance IA",
              "États-Unis ou Union européenne selon l'entité contractante",
            ],
          ]}
        />
      </Section>

      <Section titre="Transferts hors de l'Union européenne">
        <p>
          Certains sous-traitants sont établis aux États-Unis. Ces transferts sont encadrés par les
          garanties prévues par le RGPD : clauses contractuelles types de la Commission européenne
          et, le cas échéant, adhésion du prestataire au Data Privacy Framework.
        </p>
      </Section>

      <Section titre="Sécurité">
        <Liste>
          <li>Connexion chiffrée (HTTPS) sur l'ensemble de l'application.</li>
          <li>
            Mots de passe stockés sous forme hachée (irréversible), jamais lisibles, y compris par
            l'éditeur.
          </li>
          <li>
            Contrôle d'accès par rôle appliqué directement dans la base de données, pas seulement
            dans l'interface.
          </li>
          <li>Les clés d'accès privilégiées ne sont jamais présentes dans le navigateur.</li>
          <li>
            Une facture émise ne peut pas être supprimée, afin de préserver la continuité de la
            numérotation.
          </li>
        </Liste>
      </Section>

      <Section titre="Vos droits">
        <p>
          Vous pouvez demander l'accès à vos données, leur rectification, leur effacement, la
          limitation de leur traitement, vous y opposer pour des raisons tenant à votre situation,
          et obtenir leur portabilité. L'effacement peut être refusé lorsqu'une obligation légale
          impose de conserver la donnée (documents comptables, décompte du temps de travail).
        </p>
        <p>
          Pour exercer ces droits, écrivez à {entreprise.email}. Une réponse vous est apportée dans
          un délai d'un mois. L'éditeur (<V v={editeur.email} />) relaie et exécute les demandes que
          l'entreprise lui transmet.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
          réclamation auprès de la CNIL : www.cnil.fr, 3 place de Fontenoy, TSA 80715, 75334 Paris
          Cedex 07.
        </p>
      </Section>

      <Section titre="Cookies">
        <p>
          L'application n'utilise que des traceurs strictement nécessaires. Le détail figure dans la{" "}
          <Link to="/cookies" className="underline underline-offset-4">
            politique de cookies
          </Link>
          .
        </p>
      </Section>

      <Section titre="Modification de cette politique">
        <p>
          Cette politique peut évoluer, notamment si de nouvelles fonctions sont ajoutées. La date
          de dernière mise à jour figure en haut de la page.
        </p>
      </Section>
    </LegalLayout>
  );
}
