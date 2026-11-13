// Sinônimos da busca: [o que a pessoa digita, outras formas que também valem].
// Tudo sem acento e em minúsculas. Vale só num sentido: buscar "refri" acha "refrigerante", não o contrário.
// Para acrescentar: uma linha nova. Frases ("sabao em po") são tratadas antes das palavras soltas.
export const SYNONYMS: [string, string[]][] = [
  ['refri', ['refrigerante']],
  ['refris', ['refrigerante']],
  ['sabao em po', ['lava roupas em po', 'lava roupa em po', 'detergente em po']],
  ['sabao liquido', ['lava roupas liquido', 'lava roupa liquido']],
  ['lava roupas', ['lava roupa', 'sabao em po', 'detergente em po']],
  ['papel higienico', ['papel hig']],
  ['achocolatado', ['toddy', 'nescau']],
  ['bolacha', ['biscoito']],
  ['bolachas', ['biscoito']],
  ['biscoito', ['bolacha']],
  ['salgadinho', ['snack', 'batata chips']],
  ['agua sanitaria', ['agua sanit', 'cloro']],
  ['amaciante', ['amac']],
  ['desodorante', ['desod']],
  ['creme dental', ['pasta de dente', 'gel dental']],
  ['pasta de dente', ['creme dental', 'gel dental']],
  ['requeijao', ['requeij']],
  ['mussarela', ['mucarela', 'muzzarela', 'mozzarella', 'muzarela']],
  ['mucarela', ['mussarela', 'muzzarela', 'mozzarella']],
  ['presunto', ['apresuntado']],
  ['leite condensado', ['leite cond']],
  ['cerveja', ['cerv']],
  ['frango', ['galinha']],
  ['carne moida', ['patinho moido', 'acem moido']],
];
