# Workflow n8n n°2 — OCR factures fournisseurs
> Spécification. Même pattern que `n8n-workflow-devis-assiste.md` (credentials, Edge Function relais, sécurité).

---

## 1. Architecture & routage

```
App (écran Factures, upload fichier) ──JWT──> Edge Function `ocr-facture` ──secret──> Webhook n8n OCR
                                                                                        │
                                                            [Download fichier Storage (service_role)]
                                                                                        │
                                                                  [OpenAI Vision (gpt-5.4-mini)]
                                                                                        │
                                                                  [Validation / normalisation]
                                                                                        │
                                                       [UPDATE factures_fournisseurs (en-tête)]
                                                                                        │
App (pré-remplit le formulaire) <──────────── { ok, extracted } ────────────────────────┘
```

- **Synchrone**, loader « Extraction en cours… » (60 s max).
- Le fichier est **déjà** dans Storage (uploadé par l'app à l'attache, en édition). n8n ne reçoit que des **références**, pas le binaire.
- **Vision** : `gpt-5.4-mini` (confirmé Artisan Pro). Même clé/credential OpenAI que le workflow 1.
- L'Edge Function ajoute le secret webhook (jamais côté navigateur).

---

## 2. Credentials n8n (déjà créés)

| Credential | Type | Utilisé par |
|---|---|---|
| `OpenAI Artisan Pro` | OpenAI API | Nœud Vision |
| `Supabase Artisan Pro (service_role)` | Supabase API / HTTP | Download Storage + UPDATE |
| `Webhook Artisan Pro Facture` | Header Auth (`X-Webhook-Secret`) | Webhook (nœud 1) |

---

## 3. Contrat d'entrée (app → n8n via Edge Function)

```jsonc
{
  "facture_id": "uuid",                 // la ligne existe déjà (statut a_valider)
  "fichier_path": "uuid/nom-fichier.pdf", // {facture_id}/{filename}
  "bucket": "factures"
}
```

## 4. Contrat de sortie (n8n → app)

```jsonc
{
  "ok": true,
  "extracted": {
    "fournisseur": "NOM FOURNISSEUR",            // null si non lu
    "numero_facture": "260207182",
    "date_facture": "2026-02-28",       // ISO 8601 (YYYY-MM-DD)
    "montant_ht": 1234.50,              // numérique, null si non lu
    "taux_tva": 8.1
  }
}
```
```jsonc
{ "ok": false, "erreur": "ocr_echoue | fichier_introuvable | llm_indisponible | payload_invalide" }
```

**Règle** : l'OCR n'extrait QUE l'en-tête. Pas de lignes détail, pas de répartition, **jamais d'auto-validation** (statut reste `a_valider`).

---

## 5. Nœuds du workflow

| # | Nœud | Type | Rôle |
|---|---|---|---|
| 1 | Webhook ocr-facture | Webhook (Header Auth) | Reçoit le POST, vérifie le secret (403 si faux) |
| 2 | Validation payload | Code | Vérifie facture_id / fichier_path / bucket → 400 si invalide |
| 3 | Download fichier | HTTP Request | `GET {SUPABASE_URL}/storage/v1/object/{bucket}/{fichier_path}`, header `Authorization: Bearer {service_role}` → binaire |
| 4 | Fichier → base64 | Code | Encode le binaire (data URL `data:application/pdf;base64,…` ou `image/*`) |
| 5 | OpenAI Vision | OpenAI (Message, image input) | `gpt-5.4-mini`, image en base64, **JSON strict**, credential `OpenAI Artisan Pro` |
| 6 | Validation / normalisation | Code | montant_ht numérique > 0 (sinon null), date → ISO 8601 (sinon null), fournisseur non vide (sinon null). Aucun champ ≠ blocage. |
| 7 | UPDATE facture | HTTP Request (PATCH) | `PATCH {SUPABASE_URL}/rest/v1/factures_fournisseurs?id=eq.{facture_id}` (service_role) : `fournisseur, numero_facture, date, montant_ht, taux_tva`. **Pas** de `statut`. |
| 8 | Réponse | Respond to Webhook | `{ ok: true, extracted: {…} }` |

Note colonne : la date facture s'écrit dans la colonne **`date`** (et non `date_facture`) de `factures_fournisseurs`.

### Prompt d'extraction (nœud 5)
> Tu es un extracteur de données de factures fournisseurs suisses. À partir de l'image/PDF, renvoie UNIQUEMENT un JSON strict (sans markdown) avec : `fournisseur` (raison sociale émettrice), `numero_facture`, `date_facture` (YYYY-MM-DD), `montant_ht` (nombre, séparateur décimal point), `taux_tva` (nombre, ex 8.1). Mets `null` pour tout champ illisible/absent. N'invente jamais de valeur. N'extrais PAS les lignes de détail.

---

## 6. Sécurité (idem workflow 1)

- Secret webhook vérifié nativement par n8n, jamais côté navigateur (Edge Function relais).
- service_role uniquement en credential n8n (download Storage + UPDATE).
- Edge Function `ocr-facture` : refuse JWT absent/invalide (401) et rôle `ouvrier` (403). Env Supabase : `OCR_WEBHOOK_SECRET`, `OCR_WEBHOOK_URL`.
- ⚠️ Le credential Header Auth du webhook OCR attend le header **`OCR_FACTURE_WEBHOOK_SECRET`** (≠ du workflow devis qui utilise `X-Webhook-Secret`) — l'Edge Function envoie ce nom de header précis.

---

## 7. Hors périmètre

Lignes détail, validation automatique, répartition automatique sur chantiers, reparse de formats fournisseurs specifiques (workflows dedies ulterieurs).
