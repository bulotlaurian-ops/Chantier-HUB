-- =====================================================================
-- Chantier Hub — 014 : Storage privé `factures` + policies alignées sur la RLS
-- =====================================================================
-- Bucket privé pour les PDF/photos de factures fournisseurs. Path =
-- {facture_id}/{filename}. Lecture via URL signée uniquement (jamais public).
-- Accès : admin tout ; conducteur si la facture est sienne ou visible (toutes
-- répartitions dans ses entités) ; ouvrier/anon : rien. Idempotent.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('factures', 'factures', false)
on conflict (id) do nothing;

-- Accès conducteur dérivé du 1er segment du path (= facture_id), null-safe.
-- (fonctions définies en 013 : public.facture_cree_par / public.facture_visible_conducteur / public.safe_uuid)

drop policy if exists factures_storage_select on storage.objects;
create policy factures_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'factures' and (
    public.current_role_app() = 'admin'::public.role_app
    or (public.current_role_app() = 'conducteur'::public.role_app and (
         public.facture_cree_par(public.safe_uuid(split_part(name, '/', 1))) = auth.uid()
         or public.facture_visible_conducteur(public.safe_uuid(split_part(name, '/', 1)))
       ))
  )
);

drop policy if exists factures_storage_insert on storage.objects;
create policy factures_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'factures' and (
    public.current_role_app() = 'admin'::public.role_app
    or (public.current_role_app() = 'conducteur'::public.role_app and (
         public.facture_cree_par(public.safe_uuid(split_part(name, '/', 1))) = auth.uid()
         or public.facture_visible_conducteur(public.safe_uuid(split_part(name, '/', 1)))
       ))
  )
);

drop policy if exists factures_storage_update on storage.objects;
create policy factures_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'factures' and (
    public.current_role_app() = 'admin'::public.role_app
    or (public.current_role_app() = 'conducteur'::public.role_app and (
         public.facture_cree_par(public.safe_uuid(split_part(name, '/', 1))) = auth.uid()
         or public.facture_visible_conducteur(public.safe_uuid(split_part(name, '/', 1)))
       ))
  )
);

drop policy if exists factures_storage_delete on storage.objects;
create policy factures_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'factures' and (
    public.current_role_app() = 'admin'::public.role_app
    or (public.current_role_app() = 'conducteur'::public.role_app and (
         public.facture_cree_par(public.safe_uuid(split_part(name, '/', 1))) = auth.uid()
         or public.facture_visible_conducteur(public.safe_uuid(split_part(name, '/', 1)))
       ))
  )
);
