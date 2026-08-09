import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

// Clients PARTAGÉS (sans entite_id, §4). La catégorie tarifaire pointe vers
// categories_tarifaires (type 'client') — remplace l'ancien enum B2B/privé/luxe.
export type ClientRow = Tables<"clients">;
export type Client = ClientRow & {
  categorie: { id: string; code: string; libelle: string } | null;
};

const CLIENTS_KEY = ["clients"] as const;
const SELECT = "*, categorie:categories_tarifaires(id, code, libelle)";

export function useClients(includeArchived = false) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, { archived: includeArchived }],
    queryFn: async (): Promise<Client[]> => {
      let q = supabase.from("clients").select(SELECT).order("nom");
      if (!includeArchived) q = q.is("archive_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });
}

// Archivage (soft delete) / restauration d'un client.
export function useArchiveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, restore = false }: { id: string; restore?: boolean }) => {
      const { error } = await supabase.from("clients").update({ archive_at: restore ? null : new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      qc.invalidateQueries({ queryKey: [...CLIENTS_KEY, v.id] });
    },
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, id],
    queryFn: async (): Promise<Client | null> => {
      const { data, error } = await supabase.from("clients").select(SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Client) ?? null;
    },
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<"clients">): Promise<ClientRow> => {
      const { data, error } = await supabase.from("clients").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"clients"> }): Promise<ClientRow> => {
      const { data, error } = await supabase.from("clients").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      qc.invalidateQueries({ queryKey: [...CLIENTS_KEY, c.id] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}
