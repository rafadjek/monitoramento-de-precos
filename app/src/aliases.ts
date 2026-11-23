// Quando dois grupos de produtos viram um (o agrupamento melhorou), um dos ids some. O build-site publica em
// index.json uma tabela "id antigo -> id novo" e estas funções trocam os ids guardados no navegador
// (favoritos e lista de compras) sem perder nada. Sem React nem dependências de runtime, para os testes com `node --test`.
export type Aliases = Record<string, string>;
type Item = { g: string; qty: number; m?: string };

/** Segue a tabela até o id final (com limite, para nunca ficar preso num ciclo). */
export function resolve(id: string, aliases: Aliases): string {
  let cur = id;
  for (let i = 0; i < 5 && aliases[cur] && aliases[cur] !== cur; i++) cur = aliases[cur];
  return cur;
}

export function migrateFavs(ids: string[], aliases: Aliases): string[] {
  return [...new Set(ids.map((id) => resolve(id, aliases)))];
}

/** Troca o id de cada item; dois itens que viram o mesmo produto no mesmo mercado somam a quantidade (até 99). */
export function migrateCart<T extends Item>(cart: T[], aliases: Aliases): T[] {
  const out: T[] = [];
  for (const c of cart) {
    const g = resolve(c.g, aliases);
    const jaTem = out.find((x) => x.g === g && (x.m ?? '') === (c.m ?? ''));
    if (jaTem) jaTem.qty = Math.min(99, jaTem.qty + c.qty);
    else out.push({ ...c, g });
  }
  return out;
}

/** true se a migração mudaria alguma coisa (para só gravar no navegador quando preciso). */
export const precisaMigrar = (ids: string[], aliases: Aliases) => ids.some((id) => resolve(id, aliases) !== id);
