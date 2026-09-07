-- =====================================================================
-- Chantier Hub — 033 : réduction à une seule entité (GP Ravalement)
-- =====================================================================
-- L'entreprise d'origine (EURL GP RAVALEMENT, ravalement de façades) exerce
-- une seule activité, contrairement à l'hypothèse de départ du template
-- (3 entités PRO/EXT/INT). Le modèle de données le permet nativement : les
-- entités sont des données, pas du code (cf. CLAUDE.md §1). On repositionne
-- l'entité PRO comme entité unique et on retire EXT/INT (aucune donnée
-- réelle ne les référence encore, cascade sans risque sur
-- conditions_paiement). Idempotent (réexécutable sans erreur).
-- =====================================================================

update entites
set nom = 'GP RAVALEMENT',
    adresse_societe = '11310 Saint-Denis'
where code = 'PRO';

delete from entites where code in ('EXT', 'INT');
