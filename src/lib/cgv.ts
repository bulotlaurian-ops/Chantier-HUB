// Conditions générales de vente, rendues en fin de devis par pdf.ts
// (fonction `renderCgv`).
//
// ⚠️ TEXTE DE DÉMONSTRATION — AUCUNE VALEUR JURIDIQUE.
// Ce texte est un squelette structuré autour du droit français (Code de la
// consommation, garanties du bâtiment), mais n'a été relu par aucun
// professionnel. Faites-le valider par un avocat, un comptable, ou la
// fédération du métier (CAPEB, FFB…) AVANT d'émettre le moindre devis réel.
// Points à faire valider en priorité : le droit de rétractation (art. 4,
// applicable si le devis est signé hors de l'établissement de l'entreprise),
// les garanties légales du bâtiment (art. 8) et les références d'assurance.
//
// Format attendu : une chaîne unique, un titre de section par ligne (numéroté),
// le corps de section sur la ligne suivante. Le moteur PDF gère lui-même le
// repli des paragraphes et la pagination.

import { ENTREPRISE } from "../config/entreprise";

function cgvGenerique(entite: string): string {
  return `1. CHAMP D'APPLICATION
Les présentes conditions générales de vente (ci-après « CGV ») s'appliquent à toute prestation de travaux conclue entre ${entite} et le Client, professionnel ou particulier. Le fait de valider un devis, quel qu'en soit le mode (signature électronique ou manuscrite), vaut acceptation pleine et entière des présentes CGV. Toute condition contraire posée par le Client est inopposable à ${entite}, sauf acceptation expresse et écrite de sa part.
2. DEVIS
Le devis est établi gratuitement sur la base de la visite ou des informations transmises par le Client. Il est valable pour la durée indiquée sur le document ; passé ce délai, les prix et délais peuvent être révisés. Toute prestation non expressément décrite au devis fait l'objet d'un devis complémentaire avant exécution.
3. PRIX ET TVA
Les prix sont exprimés en euros, hors taxes puis toutes taxes comprises, au taux de TVA en vigueur applicable à la nature des travaux. Les prix indiqués au devis accepté sont fermes, sauf modification de la commande à l'initiative du Client ou découverte, en cours de chantier, d'une contrainte technique non visible lors de l'établissement du devis (auquel cas un devis complémentaire est soumis avant poursuite des travaux).
4. DROIT DE RÉTRACTATION (Client particulier)
Lorsque le devis est signé en dehors de l'établissement de ${entite} (au domicile du Client notamment), celui-ci bénéficie d'un délai de rétractation de 14 jours à compter de son acceptation, conformément aux articles L221-18 et suivants du Code de la consommation. Si le Client souhaite que les travaux débutent avant l'expiration de ce délai, il en fait la demande expresse et signée ; il renonce alors à son droit de rétractation pour les prestations déjà exécutées.
5. DÉLAIS D'EXÉCUTION
Les dates ou délais d'intervention indiqués sont donnés à titre indicatif et dépendent notamment des conditions météorologiques pour les travaux extérieurs. Un dépassement raisonnable ne peut donner lieu à pénalité, sauf stipulation contraire expresse au devis.
6. EXÉCUTION DES TRAVAUX
Les travaux sont exécutés selon les règles de l'art et les normes en vigueur (DTU applicables). Le Client garantit l'accès au chantier et signale toute contrainte particulière (réseaux, servitudes, copropriété) avant le démarrage. Toute modification demandée en cours de chantier fait l'objet d'un avenant écrit, avec incidence éventuelle sur le prix et le délai.
7. PAIEMENT
Les modalités de paiement (acompte à la commande, échéancier, solde à réception) figurent sur le devis. Toute somme non payée à son échéance porte intérêt au taux légal en vigueur, sans qu'un rappel préalable soit nécessaire. Aucune retenue de paiement ne peut être opérée par le Client pour un motif non expressément notifié par écrit avant l'échéance.
8. GARANTIES
Les travaux bénéficient des garanties légales applicables au secteur du bâtiment : garantie de parfait achèvement (1 an), garantie de bon fonctionnement des éléments d'équipement dissociables (2 ans), et garantie décennale pour les désordres compromettant la solidité de l'ouvrage ou le rendant impropre à sa destination (10 ans). ${entite} est couvert par une assurance responsabilité civile professionnelle et une assurance décennale ; les attestations sont communiquées sur demande.
9. RÉSERVE DE PROPRIÉTÉ
Les matériaux et fournitures restent la propriété de ${entite} jusqu'au complet paiement du prix, sans préjudice du transfert des risques dès leur mise en œuvre sur le chantier.
10. RÉCLAMATIONS ET MÉDIATION
Toute réclamation est adressée par écrit à ${entite}. À défaut de résolution amiable, le Client consommateur peut recourir gratuitement à un médiateur de la consommation, dans les conditions prévues par le Code de la consommation.
11. DONNÉES PERSONNELLES
Les données personnelles communiquées par le Client sont traitées par ${entite} aux seules fins de l'exécution du contrat et de la relation commerciale, et conservées pendant la durée nécessaire à ces finalités, conformément au Règlement Général sur la Protection des Données (RGPD). Le Client dispose d'un droit d'accès, de rectification et d'effacement de ses données.
12. DROIT APPLICABLE ET JURIDICTION
Les présentes CGV sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux du ressort du siège social de ${entite} sont seuls compétents, sous réserve des règles impératives de compétence applicables aux litiges de consommation.`;
}

export const CGV_PRO = cgvGenerique(ENTREPRISE.nom.toUpperCase());

export const CGV_PAR_CODE: Record<string, string> = {
  PRO: CGV_PRO,
};
