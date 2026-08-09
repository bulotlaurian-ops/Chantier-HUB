# Workflow n8n — Devis assisté (vocal + texte)

> Spécification de conception. À déposer dans `n8n/` du repo.
> Côté app : Claude Code implémente l'appel + l'écran de preview à partir de ce contrat.
> Cote n8n : vous construisez le workflow sur votre propre instance.
> Principe cardinal : **le LLM propose la structure, l'app calcule les montants.**
> Rien ne s'applique sans validation humaine (preview + diff).

---

## 1. Architecture & routage

```
App (navigateur) ──JWT──> Edge Function Supabase `devis-assiste` ──secret──> Webhook n8n
                                                                              │
                                                                   [STT Voxtral si audio]
                                                                              │
                                                                   [Fetch biblio Supabase]
                                                                              │
                                                                   [LLM Gemini 3 Flash]
                                                                              │
                                                                   [Validation/normalisation]
                                                                              │
App (preview/diff) <────────────────── JSON lignes/opérations ────────────────┘
```

- **Synchrone** : l'app attend la réponse (loader). Timeout app : 60 s.
  Si on dépasse régulièrement 30-40 s en réel → bascule async (pas avant).
- **Pourquoi l'Edge Function relais** : le navigateur ne doit JAMAIS porter le
  secret du webhook n8n (tout ce qui est dans le front est public). L'Edge
  Function vérifie le JWT Supabase de l'utilisateur (automatique), ajoute le
  header secret côté serveur, relaie, et renvoie la réponse. Ça règle aussi le CORS.
- Services : **Voxtral Mini Transcribe V2** (STT, ~0,003 $/min),
  **Gemini 3 Flash** (LLM, JSON schema). Le nœud LLM doit rester
  interchangeable : prompt et schémas identiques quel que soit le modèle.

## 2. Contrat d'entrée (app → n8n, via Edge Function)

`POST /webhook/devis-assiste` — Headers : `X-Webhook-Secret: <secret>` (ajouté par l'Edge Function)

```jsonc
{
  "mode": "creation",            // "creation" | "edition"
  "input_type": "audio",         // "audio" | "texte"
  "texte": null,                 // si input_type=texte : la consigne tapée
  "audio_base64": "...",         // si audio : webm/opus base64 (≈1 Mo/min, max ~5 min)
  "contexte": {
    "entite_code": "EXT",      // PRO | EXT | INT
    "client": {
      "id": "uuid",
      "nom": "Dupont",
      "categorie_tarifaire": "prive"   // code de la catégorie (prive/pro/pro_stock/public)
    },
    // mode edition UNIQUEMENT — l'état courant du brouillon :
    "devis_courant": {
      "lignes": [
        {
          "id": "uuid",
          "designation": "Dépose carrelage existant",
          "unite": "m2",
          "quantite": 12,
          "prix_unitaire": 45.0,
          "remise_pct": 0,
          "est_titre": false,
          "est_option": false
        }
      ]
    }
  }
}
```

Règles :
- En **création**, `devis_courant` est absent.
- L'app n'envoie PAS la biblio : c'est n8n qui la lit (source unique, § 4.3).
- Édition vocale **sur brouillon uniquement** (garde-fou déjà en place côté app).

## 3. Contrat de sortie (n8n → app)

### 3.1 Mode création

```jsonc
{
  "ok": true,
  "mode": "creation",
  "transcription": "alors pour la salle de bain dépose du carrelage...", // si audio (affichée à l'utilisateur, repliable)
  "lignes": [
    { "type": "titre", "designation": "Salle de bain" },
    {
      "type": "prestation",
      "prestation_id": "uuid",          // null si pas trouvée en biblio
      "designation": "Dépose carrelage existant",
      "unite": "m2",                    // Fft | U | pce | m2 | ml | h
      "quantite": 12,
      "est_option": false,
      "confiance": "haute",             // haute | moyenne | basse
      "candidats": []                   // si ambigu : [{prestation_id, libelle}] (max 3)
    }
  ],
  "avertissements": [
    "« joint silicone » non trouvé en bibliothèque → ligne libre à tarifer"
  ]
}
```

### 3.2 Mode édition — liste d'OPÉRATIONS (patch), jamais le devis réécrit

```jsonc
{
  "ok": true,
  "mode": "edition",
  "transcription": "...",
  "operations": [
    { "op": "ajouter_ligne",  "position": "fin",            // "fin" | { "apres_ligne_id": "uuid" }
      "ligne": { "type": "prestation", "prestation_id": null, "designation": "Joint silicone périphérie", "unite": "ml", "quantite": 8, "est_option": false, "confiance": "moyenne", "candidats": [] } },
    { "op": "modifier_ligne", "ligne_id": "uuid", "champs": { "quantite": 15 } },
    { "op": "supprimer_ligne", "ligne_id": "uuid" },
    { "op": "ambigu", "message": "« le carrelage » peut désigner 2 lignes",
      "candidats_ligne_ids": ["uuid1", "uuid2"],
      "operation_en_attente": { "op": "modifier_ligne", "champs": { "quantite": 20 } } }
  ],
  "avertissements": []
}
```

### 3.3 Erreur

```jsonc
{ "ok": false, "erreur": "transcription_echouee" }   // ou: llm_indisponible, payload_invalide, timeout_interne
```

L'app affiche un message et **retombe TOUJOURS sur la saisie manuelle** — l'IA
est une assistance, jamais un point de blocage.

### 3.4 Ce que la sortie ne contient JAMAIS

- Aucun prix calculé, aucun total, aucune TVA, aucune remise chiffrée.
  L'app résout les prix (prestation_id → tarif de la catégorie du client,
  comme en saisie manuelle), calcule, arrondit au 0.05.
- `prix_unitaire` n'apparaît dans une opération `modifier_ligne` QUE si
  l'utilisateur a dicté un prix explicite (« mets le ponçage à 50 francs »),
  et il transite tel quel comme valeur dictée, pas calculée.

## 4. Workflow n8n — nœud par nœud

| # | Nœud | Rôle |
|---|------|------|
| 1 | **Webhook** (POST, Respond: Using Respond node) | Vérifie `X-Webhook-Secret` (Code node juste après → 401 sinon). Valide la forme du payload (`mode`, `input_type`, `contexte.entite_code`, `contexte.client`). |
| 2 | **IF audio** | Si `input_type=audio` → nœud 3, sinon → nœud 4 avec `texte`. |
| 3 | **HTTP Request — Voxtral** (`POST api.mistral.ai/v1/audio/transcriptions`, modèle `voxtral-mini-transcribe-v2` ou équivalent courant) | **Context biasing** : passer la liste de vocabulaire métier (§ 6). Sortie = `transcription`. |
| 4 | **Supabase — fetch biblio** (HTTP avec clé service_role stockée dans les credentials n8n) | `select id, code, libelle, unite, prix_vente_reference from prestations where actif` (adapter au schéma). En Phase 1 (≤ ~600 lignes) : tout passe dans le prompt. Au-delà (post-CAN) : pré-filtrage par recherche (évolution § 8). |
| 5 | **LLM — Gemini 3 Flash** (JSON schema strict = schémas § 3) | Prompt § 5. Entrée : transcription/texte + biblio + contexte + (édition) devis_courant. `temperature: 0`. |
| 6 | **Code — validation/normalisation** | Parse + rejette tout ce qui sort du schéma : `prestation_id` inexistant en biblio → null + confiance basse ; unités hors liste → normalisées (`m²`→`m2`, `forfait`→`Fft`) ; quantités ≤ 0 → 1 + avertissement ; en édition, `ligne_id` inconnu → opération transformée en `ambigu`. **Ne jamais faire confiance au JSON brut du LLM.** |
| 7 | **Respond to Webhook** | JSON § 3. Toute erreur interceptée (Error Workflow ou branche d'erreur) → § 3.3. |

## 5. Prompt LLM (squelette)

```
SYSTÈME :
Tu es l'assistant de chiffrage d'une entreprise suisse de rénovation/construction
({ENTITE_NOM}). Tu transformes une consigne (dictée ou tapée) en lignes de devis
structurées. Règles absolues :
1. Tu ne calcules JAMAIS de montants, totaux ou TVA. Tu ne produis que la
   structure : désignations, unités, quantités.
2. Pour chaque prestation, cherche la correspondance dans la BIBLIOTHÈQUE
   fournie (par libellé/code). Correspondance sûre → prestation_id + confiance
   "haute". Plusieurs candidats plausibles → prestation_id null + jusqu'à 3
   "candidats" + confiance "moyenne". Aucune → prestation_id null + désignation
   libre propre + confiance "basse".
3. Décompose les demandes globales en sous-tâches métier. Exemple : « carrelage
   salle de bain 12 m² » → dépose de l'existant, préparation/ragréage du support,
   fourniture du carrelage, pose, joints. Une ligne par tâche, quantités déduites
   de la consigne (la surface dictée s'applique aux lignes surfaciques).
4. Unités autorisées : Fft (forfait), U, pce, m2, ml, h. Si la consigne dit
   « forfait » → Fft, quantité 1.
5. « en option » / « si le client veut » → est_option=true.
   Les intitulés de zones (« salle de bain », « cuisine ») → lignes type "titre".
6. Mode ÉDITION : tu reçois le devis courant (lignes + ids). Tu renvoies
   UNIQUEMENT des opérations (ajouter/modifier/supprimer) sur ces ids — jamais le
   devis complet. Désigne les lignes par leur id. Si la consigne est ambiguë
   (« le carrelage » alors que 2 lignes correspondent) → opération "ambigu" avec
   les candidats, ne tranche pas toi-même.
7. Langue : français. Désignations professionnelles, concises, sans fautes,
   utilisables telles quelles sur un devis client.
8. Réponds STRICTEMENT au schéma JSON imposé. Rien d'autre.

UTILISATEUR :
MODE: {creation|edition}
ENTITÉ: {code + nom}
CLIENT: {nom} (catégorie {categorie_tarifaire})
BIBLIOTHÈQUE (id | code | libellé | unité):
{liste}
{SI ÉDITION → DEVIS COURANT (id | désignation | unité | qté | option/titre): {lignes}}
CONSIGNE:
{transcription ou texte}
```

> Le point 3 (standards de décomposition) s'appuie pour l'instant sur la
> connaissance générale du LLM. Les standards techniques PROPRES à Artisan Pro
> (confirmés au call du 19/05 comme paramétrables) viendront enrichir ce bloc
> quand le client les fournira — prévoir une section `STANDARDS DE
> DÉCOMPOSITION` injectée depuis une table `parametres` ou un fichier n8n.

## 6. Vocabulaire context biasing (Voxtral)

À passer au STT pour fiabiliser l'orthographe (≤ 100 termes) — liste de départ,
à enrichir à l'usage :
`Fft, forfait, mètre linéaire, m2, ragréage, dépose, ponçage,
faïence, plinthe, garde-corps, pergola, portail, crépi, gypserie, galandage,
parquet, chape, enduit, sous-couche, dispersion, acrylique, ARTISAN PRO,
EXTERIEUR, INTERIEUR` + villes fréquentes (Ville A, Ville B, …).

## 7. Côté app (périmètre Claude Code, à prompter séparément)

1. **Edge Function `devis-assiste`** : vérifie le JWT (natif), relaie vers le
   webhook n8n avec le secret (variable d'env Supabase), renvoie la réponse.
   Timeout 60 s.
2. **Capture audio** : MediaRecorder (webm/opus), bouton enregistrer/stop,
   durée max 5 min, envoi base64.
3. **Écran preview (création)** : lignes proposées avec badge de confiance ;
   ligne mappée → prix résolu par l'app (tarif catégorie client) ; ligne
   `prestation_id null` → champ prix à saisir, marquée « hors biblio » ;
   `candidats` → sélecteur. L'utilisateur édite/supprime, puis « Insérer dans
   le devis » → circuit de calcul existant (totaux, arrondi 0.05, marge).
4. **Écran diff (édition)** : ajouts en vert, suppressions en rouge, modifs
   surlignées (avant → après) ; opérations `ambigu` → question à l'utilisateur ;
   « Appliquer » → patch + recalcul. Rien ne s'applique sans validation.
5. **Lien biblio (plus tard, avec le workflow pending→validé)** : les lignes
   `prestation_id null` validées pourront proposer « ajouter à la bibliothèque ».

## 8. Évolutions identifiées (ne PAS construire maintenant)

- **Biblio > ~600 lignes (post-CAN)** : pré-filtrer les prestations envoyées au
  LLM (recherche plein texte Postgres sur les mots de la consigne, ou embeddings
  pgvector). Le contrat ne change pas.
- **Async** : si latence réelle > 30-40 s (job_id + polling/realtime).
- **Standards de décomposition Artisan Pro** : section de prompt paramétrable.
- **Révisions de devis émis (`/R`)** : a arbitrer selon le besoin.

## 9. Sécurité — checklist

- [ ] Webhook n8n : HTTPS uniquement (reverse proxy de votre hebergeur), secret fort
      vérifié en premier nœud, 401 sinon.
- [ ] Secret JAMAIS dans le front ni le repo : env Supabase (Edge Function) +
      credentials n8n.
- [ ] Clé service_role Supabase : credentials n8n uniquement.
- [ ] Clés Mistral/Google : credentials n8n uniquement.
- [ ] Edge Function : rejette les requêtes sans JWT valide ; refuse le rôle
      `ouvrier` (seuls admin/conducteur créent des devis).
- [ ] Taille payload limitée (~10 Mo) côté Edge Function et n8n.

## 10. Plan de test (avant de brancher l'UI)

1. **n8n seul** (curl sur le webhook) : texte simple → JSON conforme ; audio
   reel dicte par un utilisateur (FR, vocabulaire chantier) → transcription + lignes.
2. **Les 3 confiances** : une consigne 100 % biblio (clôtures EXT), une
   ambiguë, une totalement hors biblio (PRO, biblio vide → tout en lignes libres).
3. **Édition** : « passe le ponçage à 15 m² et supprime la ligne plinthes » sur
   un brouillon réel → opérations correctes ; « modifie le carrelage » avec 2
   lignes carrelage → opération `ambigu`.
4. **Robustesse** : payload sans secret → 401 ; LLM qui renvoie du JSON cassé
   (simulé) → `ok:false` propre ; audio vide → erreur propre.
5. Mesurer la **latence bout en bout** sur 5 dictées réelles (cible < 25 s).
