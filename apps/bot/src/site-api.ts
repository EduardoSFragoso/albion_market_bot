import type { Env, ItemIndexEntry } from './types.ts';
import { entryName, withEnchSuffix } from './common.ts';

// ---------- Acesso à API compartilhada do site ----------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function siteApi<T>(env: Env, path: string, params: Record<string, string>): Promise<T> {
  const url = `${env.SITE_URL.replace(/\/$/, '')}/api/${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    throw new ApiError('Serviço do site indisponível — tente novamente em instantes.', 503);
  }
  if (res.status !== 200) {
    if (res.status === 404) throw new ApiError('Item não encontrado no serviço do site.', 404);
    throw new ApiError('Serviço do site respondeu com erro — tente novamente em instantes.', res.status);
  }
  return (await res.json()) as T;
}

/** Busca um item: id "T4_BAG" direto; qualquer outra coisa via /api/search (locale pt). */
export async function resolveItem(
  env: Env,
  text: string,
): Promise<{ id: string; entry?: ItemIndexEntry } | null> {
  const t = text.trim();
  if (!t) return null;
  // id "exato" no estilo Albion: T4_BAG, T6_BAG@2, @ITEMTYPE etc.
  if (/^[A-Za-z0-9_]+(@\d+)?$/.test(t) && t.includes('_')) {
    return { id: t.toUpperCase() };
  }
  const data = await siteApi<{ results: ItemIndexEntry[] }>(env, 'search', {
    q: t,
    locale: 'pt',
    limit: '12',
  });
  return data.results[0] ?? null;
}

/** Nome em PT-BR de qualquer id (inclusive materiais): busca por id na API do site. */
export function nameResolver(env: Env, locale: 'pt' | 'en') {
  const cache = new Map<string, string>();
  return async (id: string): Promise<string> => {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    let name: string;
    try {
      const data = await siteApi<{ results: ItemIndexEntry[] }>(env, 'search', {
        q: id,
        locale,
        limit: '5',
      });
      const entry = data.results.find((r) => r.id === id) ?? data.results[0];
      name = entryName(entry, id);
    } catch {
      name = withEnchSuffix(id, id);
    }
    cache.set(id, name);
    return name;
  };
}

// ---------- Verificação de assinatura Ed25519 ----------
