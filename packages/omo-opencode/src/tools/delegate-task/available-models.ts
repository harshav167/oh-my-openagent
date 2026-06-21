import type { OpencodeClient } from "./types"
import { log } from "../../shared/logger"
import { isRecord } from "../../shared/record-type-guard"
import * as connectedProvidersCache from "../../shared/connected-providers-cache"

type ModelListClient = OpencodeClient & {
  model: { list: () => Promise<unknown> }
}

function hasModelList(client: OpencodeClient): client is ModelListClient {
  return "model" in client && isRecord(client.model) && typeof client.model.list === "function"
}

function isModelRow(value: unknown): value is { provider: string; id: string } {
  return isRecord(value) && typeof value.provider === "string" && typeof value.id === "string"
}

function extractModelRows(result: unknown): Array<{ provider: string; id: string }> {
  const rows = Array.isArray(result) ? result : isRecord(result) && Array.isArray(result.data) ? result.data : []
  return rows.filter(isModelRow)
}

function addFromProviderModels(
  out: Set<string>,
  providerID: string,
  models: Array<string | { id?: string }> | undefined
): void {
  if (!models) return
  for (const item of models) {
    const modelID = typeof item === "string" ? item : item?.id
    if (!modelID) continue
    out.add(`${providerID}/${modelID}`)
  }
}

export async function getAvailableModelsForDelegateTask(client: OpencodeClient): Promise<Set<string>> {
  const providerModelsCache = connectedProvidersCache.readProviderModelsCache()

  if (providerModelsCache?.models) {
    const connected = new Set(providerModelsCache.connected)

    const out = new Set<string>()
    for (const [providerID, models] of Object.entries(providerModelsCache.models)) {
      if (!connected.has(providerID)) continue
      addFromProviderModels(out, providerID, models as Array<string | { id?: string }> | undefined)
    }
    return out
  }

  const connectedProviders = connectedProvidersCache.readConnectedProvidersCache()

  // Cold cache: on a fresh session the provider-models cache file is not written
  // yet, so the connected-providers cache is often empty. Returning an empty set
  // here is what made list_models report "no connected models" and forced the
  // override gate into cold-cache passthrough. Instead, fetch the live model list
  // directly to warm discovery on the first call. When the connected-providers
  // cache IS known we still filter to it; otherwise we surface every model the
  // client reports so a known-good slug resolves immediately.
  if (hasModelList(client)) {
    try {
      const result = await client.model.list()
      const rows = extractModelRows(result)

      const connected = connectedProviders && connectedProviders.length > 0 ? new Set(connectedProviders) : undefined
      const out = new Set<string>()
      for (const row of rows) {
        if (connected && !connected.has(row.provider)) continue
        out.add(`${row.provider}/${row.id}`)
      }
      return out
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      log("[delegate-task] client.model.list failed", { error: errorMessage })
      return new Set()
    }
  }

  return new Set()
}
