# Workflow n8n — Devis assisté (vocal + texte)
> Spécification à jour — version OpenAI de bout en bout, nœuds natifs, credentials n8n.
> Fichier à placer dans `n8n/` du repo.

---

## 1. Architecture & routage

```
App (navigateur) ──JWT──> Edge Function Supabase `devis-assiste` ──secret──> Webhook n8n
                                                                              │
                                                                   [STT gpt-4o-transcribe]
                                                                              │
                                                                   [Fetch biblio Supabase natif]
                                                                              │
                                                                   [LLM gpt-5.4-mini]
                                                                              │
                                                                   [Validation/normalisation]
                                                                              │
App (preview/diff) <────────────────── JSON lignes/opérations ────────────────┘
```

- **Synchrone** : l'app attend la réponse (loader 60 s max).
- **Fournisseur unique : OpenAI** — une seule clé couvre STT (`gpt-4o-transcribe`) ET LLM (`gpt-5.4-mini`).
- **Modèle de livraison** : Vous souscrivez votre propre compte OpenAI et fournissez votre cle. La clé est stockée dans un credential n8n — changement de clé = changer le credential, sans toucher au workflow.
- **Pourquoi l'Edge Function relais** : le secret webhook ne doit jamais être exposé côté navigateur. L'Edge Function vérifie le JWT Supabase, ajoute le secret, relaie.

---

## 2. Credentials n8n (jamais de variables d'env)

| Credential | Type n8n | Utilisé par |
|---|---|---|
| `OpenAI Artisan Pro` | OpenAI API | Nœuds 3 (STT) + 7 (LLM) |
| `Supabase Artisan Pro (service_role)` | Supabase API | Nœud 5 (biblio) |
| `Webhook secret (X-Webhook-Secret)` | Header Auth | Webhook (nœud 1) |

Renseignez vos propres cles dans ces 3 credentials. Aucun code à modifier.

---

## 3. Nœuds du workflow (17 nœuds)

| # | Nœud | Type | Rôle |
|---|---|---|---|
| 1 | Webhook devis-assiste | Webhook (Header Auth) | Reçoit le POST, vérifie le secret nativement (403 si absent/faux) |
| 2 | 1. Validation payload | Code | Vérifie mode/input_type/contexte, renvoie 400 si invalide |
| 3 | Payload valide ? | IF | Aiguillage valide/invalide |
| 4 | Réponse 400 | Respond to Webhook | Payload invalide + liste des champs manquants |
| 5 | Audio ? | IF | Aiguillage audio/texte |
| 6 | 2. Base64 vers binaire | Code | Décode l'audio base64 en binaire (MIME : audio/mp4 pour m4a en test, audio/webm en prod) |
| 7 | 3. STT (OpenAI natif) | OpenAI (Audio → Transcribe) | Transcription vocale via gpt-4o-transcribe, credential `OpenAI Artisan Pro` |
| 8 | 4. Consigne | Code | Convergence audio/texte, détection erreur STT |
| 9 | Erreur STT ? | IF | Aiguillage erreur/succès STT |
| 10 | Réponse erreur STT | Respond to Webhook | `{ok:false, erreur:"transcription_echouee"}` |
| 11 | 5. Biblio Supabase (natif) | Supabase (getAll prestations) | Lit toute la table `prestations`, credential `Supabase Artisan Pro` |
| 12 | 6. Construction prompt | Code | Assemble prompt système + biblio + contexte client + (édition) devis courant |
| 13 | 7. LLM (OpenAI natif) | OpenAI (Text → Message) | gpt-5.4-mini, sortie JSON forcée, credential `OpenAI Artisan Pro` |
| 14 | 8. Validation et normalisation | Code | Rejette prestation_id hallucités, normalise unités, clamp quantités, vérifie ligne_id en édition |
| 15 | Réponse JSON | Respond to Webhook | Sortie finale conforme au contrat |

---

## 4. Contrat d'entrée (app → n8n via Edge Function)

```jsonc
{
  "mode": "creation",          // "creation" | "edition"
  "input_type": "audio",       // "audio" | "texte"
  "texte": null,               // si texte : la consigne
  "audio_base64": "...",       // si audio : webm/opus base64 (max 25 Mo)
  "contexte": {
    "entite_code": "EXT",    // PRO | EXT | INT
    "client": {
      "id": "uuid",
      "nom": "Dupont",
      "categorie_tarifaire": "prive"
    },
    // mode edition uniquement :
    "devis_courant": {
      "lignes": [
        { "id": "uuid", "designation": "...", "unite": "m2", "quantite": 12, "est_titre": false, "est_option": false }
      ]
    }
  }
}
```

---

## 5. Contrat de sortie (n8n → app)

### Mode création
```jsonc
{
  "ok": true,
  "mode": "creation",
  "transcription": "texte transcrit...",   // null si input texte
  "lignes": [
    { "type": "titre", "designation": "Salle de bain" },
    {
      "type": "prestation",
      "prestation_id": "uuid | null",
      "designation": "Dépose carrelage existant",
      "unite": "m2",
      "quantite": 12,
      "est_option": false,
      "confiance": "haute | moyenne | basse",
      "candidats": []     // si ambigu : [{prestation_id, libelle}] max 3
    }
  ],
  "avertissements": []
}
```

### Mode édition (patch)
```jsonc
{
  "ok": true,
  "mode": "edition",
  "transcription": "...",
  "operations": [
    { "op": "ajouter_ligne", "position": "fin", "ligne": { ... } },
    { "op": "modifier_ligne", "ligne_id": "uuid", "champs": { "quantite": 15 } },
    { "op": "supprimer_ligne", "ligne_id": "uuid" },
    { "op": "ambigu", "message": "...", "candidats_ligne_ids": ["uuid1","uuid2"], "operation_en_attente": { ... } }
  ],
  "avertissements": []
}
```

### Erreur
```jsonc
{ "ok": false, "erreur": "transcription_echouee | llm_indisponible | payload_invalide | aucune_operation" }
```

**Règle cardinale** : le LLM ne calcule jamais de prix. La sortie ne contient que structure (désignations, unités, quantités) + prestation_id pour mapping. L'app résout les prix via le circuit de tarification existant.

---

## 6. Prompt LLM (dans le nœud 6 « Construction prompt »)

Le prompt système contient 8 règles :
1. Ne jamais calculer de montants/TVA.
2. Mapper sur la bibliothèque (haute/moyenne/basse confiance).
3. Décomposer les demandes globales en sous-tâches métier.
4. Unités autorisées : Fft, U, pce, m2, ml, h.
5. Gérer les options et titres de zones.
6. Mode édition : opérations ciblées par ligne_id uniquement.
7. Langue française, désignations professionnelles.
8. JSON strict, sans markdown.

---

## 7. Côté app (Claude Code)

Trois blocs à implémenter :
1. **Edge Function `devis-assiste`** : vérifie JWT, refuse ouvrier, ajoute secret, relaie vers n8n. Variables Supabase : `DEVIS_WEBHOOK_SECRET`, `N8N_WEBHOOK_URL`.
2. **`src/lib/devis-ia.ts`** : `startRecording()`, `callDevisIA()`, types TypeScript stricts.
3. **UI** : bouton micro sur écran création (après sélection entité+client) + écran preview (badges confiance, prix résolus, candidats) + bouton micro sur éditeur brouillon + écran diff (vert/rouge/surligné + opérations ambigu).

---

## 8. Résultats des tests (validés le 16/06/2026)

| Test | Résultat |
|---|---|
| T1 — sans secret | 403 ✅ |
| T2 — payload invalide | 400 + champs ✅ |
| T3 — création texte, mapping biblio clôtures EXT | Mapping exact, confiance haute ✅ |
| T4 — création audio (.m4a, vocabulaire chantier) | Transcription fidèle + mapping ✅ |
| T5 — édition patch | 2 opérations exactes, rien de plus ✅ |

Note T4 : en test, le nœud 2 utilise MIME `audio/mp4` (fichier .m4a local). En production, l'app envoie du `webm/opus` natif MediaRecorder → repasser nœud 2 en `audio.webm` / `audio/webm` avant livraison.

---

## 9. Évolutions prévues (ne pas construire maintenant)

- **Context biasing** (vocabulaire métier passé au STT) : à câbler quand le paramètre API est confirmé dans la doc OpenAI.
- **Biblio > ~600 lignes** (post-CAN) : pré-filtrage Postgres avant envoi au LLM.
- **Async** si latence > 30-40 s en prod réelle.
- **WhatsApp/Telegram** (Phase 2, refacturable) : second workflow conversationnel, réutilise les nœuds STT/biblio/LLM.
- **Lien « ajouter à la biblio »** sur lignes hors biblio (circuit pending→validé).
- **OCR factures** : workflow séparé, Supabase Storage → n8n → factures_fournisseurs.

---

## 10. Sécurité

- Webhook HTTPS uniquement (reverse proxy de votre hebergeur).
- Secret vérifié nativement par n8n (Header Auth credential), jamais en clair dans le code.
- Secret jamais exposé côté navigateur (Edge Function relais).
- Clé service_role Supabase : credential n8n uniquement.
- Clé OpenAI : credential n8n uniquement.
- Edge Function : refuse JWT absent/invalide (401) et rôle ouvrier (403).
