// Conditions générales de vente, par entité, rendues en fin de devis par pdf.ts
// (fonction `renderCgv`).
//
// ⚠️ TEXTE DE DÉMONSTRATION — AUCUNE VALEUR JURIDIQUE.
// Ce fichier ne contient qu'un squelette générique destiné à montrer comment les
// CGV sont branchées au générateur de PDF. Remplacez intégralement le contenu
// ci-dessous par vos propres conditions, validées par votre conseil juridique,
// AVANT d'émettre le moindre devis réel.
//
// Format attendu : une chaîne unique, un titre de section par ligne (numéroté),
// le corps de section sur la ligne suivante. Le moteur PDF gère lui-même le
// repli des paragraphes et la pagination.

function cgvGenerique(entite: string): string {
  return `1. CHAMP D'APPLICATION
Les présentes conditions générales de vente (ci-après « CGV ») font partie intégrante de tout contrat conclu entre ${entite} et le Client. En acceptant le devis sans réserve, le Client déclare en accepter la validité pour le contrat en cours ainsi que pour toute relation ultérieure. Toute modification des présentes CGV doit être faite par écrit. La nullité éventuelle d'une disposition n'affecte pas la validité des autres.
2. OFFRE / DEVIS
Le devis est établi sur la base de la demande du Client et sa durée de validité est indiquée sur le document. Il doit être vérifié par le Client avant acceptation. Les demandes de modification postérieures à l'acceptation ne sont prises en compte que si l'état d'avancement des travaux le permet ; les frais et retards qui en découlent sont à la charge du Client.
3. PRIX
Les prix fixés à l'acceptation du devis sont fermes et définitifs. Le régime de TVA applicable est indiqué sur le devis. Sauf mention expresse, ne sont pas compris dans les prix : les modifications ultérieures de commande, les travaux supplémentaires non décrits au devis, les surcoûts résultant de circonstances non prévisibles au moment de l'offre, ainsi que les frais d'autorisation ou d'homologation.
4. LIVRAISON / DÉLAIS
Les délais annoncés sont indicatifs et courent dès l'acceptation du devis et la réception des éléments nécessaires à l'exécution. Un retard non fautif ne donne pas droit à des dommages-intérêts. Les réserves relatives au transport doivent être formulées par le Client à la livraison.
5. EXÉCUTION DES TRAVAUX
Les travaux compris dans l'offre acceptée sont exécutés dans les règles de l'art. Le Client facilite l'accès au chantier et fournit les informations nécessaires à la bonne organisation des travaux. Toute prestation supplémentaire demandée en cours d'exécution fait l'objet d'un devis complémentaire, avec adaptation des délais le cas échéant.
6. PAIEMENTS
Les conditions de paiement figurent sur le devis. Les factures non contestées par écrit dans le délai indiqué sont réputées acceptées. Tout retard de paiement peut donner lieu à un intérêt moratoire au taux légal. Une réclamation portant sur d'éventuels défauts ne suspend pas les conditions de paiement convenues.
7. RÉSERVE DE PROPRIÉTÉ
La marchandise livrée reste la propriété de ${entite} jusqu'à complet paiement du prix.
8. GARANTIE ET RESPONSABILITÉ
Les travaux exécutés doivent être contrôlés par le Client ou son représentant à la réception finale. Toute réclamation doit être communiquée par écrit dans le délai indiqué au devis. La durée de garantie court dès la date de réception. Lorsque la fourniture est réalisée sans prestation de pose, la garantie se limite au produit livré.
9. UTILISATION DES RÉFÉRENCES
Sauf opposition écrite du Client, ${entite} peut utiliser des photographies des travaux réalisés sur ses supports de communication, dans le respect des personnes et des biens photographiés.
10. PROTECTION DES DONNÉES
Les données personnelles communiquées par le Client sont traitées aux seules fins de l'exécution du contrat et conservées pendant la durée légale applicable. Le Client dispose d'un droit d'accès et de rectification.
11. DISPOSITIONS FINALES ET FOR JURIDIQUE
Les documents contractuels s'appliquent dans l'ordre suivant : le devis accepté, les présentes CGV, les normes techniques applicables, puis le droit national applicable. Le for juridique est le siège de ${entite}.`;
}

export const CGV_PRO = cgvGenerique('ARTISAN PRO');
export const CGV_EXT = cgvGenerique('EXTERIEUR');
export const CGV_INT = cgvGenerique('INTERIEUR');

export const CGV_PAR_CODE: Record<string, string> = {
  PRO: CGV_PRO,
  EXT: CGV_EXT,
  INT: CGV_INT,
};
