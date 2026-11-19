// Categoria fina do site: hortifruti, carnes, laticinios, bebidas, mercearia, limpeza, higiene, farmacia, outros.
// Usa o departamento que o próprio mercado informa (categoryRaw) e, sem ele (encartes, Extra), o nome do produto.
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// departamento de remédio e saúde (farmácias de rede e seção de farmácia dos mercados que detalham assim)
const FARMACIA = /medicamento|remedio|genericos?\b|similares?\b|vitamina|suplemento|primeiros socorros|curativo|ortopedi|fitoterapic|homeopat|saude|termometro|pressao arterial|nebuliza|preservativ|contracep|anticoncep|teste de gravidez|incontinencia|dor e febre|gripe e resfriado/;

const DEPT = [
  ['higiene', /higiene|perfumaria|beleza|cuidados pessoais|farmacia|infantil > fralda|fralda|bebe e crianca/],
  ['limpeza', /limpeza|lavanderia|descartave|utilidades domesticas > limpeza/],
  ['hortifruti', /hortifruti|hortifrut|frutas|verduras|legumes|feira/],
  ['laticinios', /laticinio|frios|embutido|queijo|iogurte|leite(?! em po)|manteiga|requeij|derivados do leite/],
  ['carnes', /acougue|carnes|aves|peixaria|peixes|suino|bovino|frango|linguica/],
  ['bebidas', /bebida|adega|cerveja|vinho|destilado|refrigerante|sucos|aguas|energetico|drinks/],
  ['mercearia', /mercearia|basicos|matinais|padaria|biscoito|doces|congelado|massas|graos|enlatado|conserva|tempero|molho|cereal|snack|salgadinho|chocolate|confeitaria|cafe|achocolatado|farinha|oleo|azeite|acucar|arroz|feij/],
  ['outros', /bazar|utilidades|eletro|petshop|pet shop|textil|automotivo|papelaria|brinquedo|casa e decoracao|jardim|ferramenta/],
];
const NAME = [
  ['higiene', /\b(shampoo|condicionador|sabonete|creme dental|escova dental|fio dental|desodorante|absorvente|fralda|papel higienico|protetor (solar|diario)|hidratante|enxaguante|enxaguatorio|esmalte|aparelho de barbear|lenco umedecido|algodao|hastes)\b/],
  ['limpeza', /\b(sabao|detergente|amaciante|alvejante|agua sanitaria|desinfetante|limpador|multiuso|esponja|lava ?loucas|lava ?roupas|saco de lixo|papel toalha|inseticida|tira manchas|limpa)\b/],
  ['bebidas', /\b(cerveja|refrigerante|suco|nectar|agua mineral|agua de coco|vinho|espumante|vodka|whisky|cachaca|gin|licor|energetico|isotonico|cha (pronto|gelado)|refresco|bebida(?! lactea))\b/],
  ['carnes', /\b(carne|picanha|alcatra|contrafile|costela|acem|patinho|cupim|frango|coxa|sobrecoxa|asa|peito|file de|linguica|bacon|lombo|pernil|bisteca|tilapia|salmao|peixe|camarao|hamburguer|almondega|nuggets|empanado|kani)\b/],
  ['laticinios', /\b(leite(?! em po| condensado)|queijo|mussarela|requeijao|iogurte|manteiga|margarina|creme de leite|bebida lactea|presunto|mortadela|salame|apresuntado|peito de peru|cream cheese)\b/],
  ['hortifruti', /\b(banana|maca|laranja|limao|mamao|melao|melancia|abacaxi|uva|manga|pera|tomate|batata(?! palha)|cebola|alho|cenoura|alface|chuchu|abobora|pepino|pimentao|mandioca)\b/],
];

export function fineCategory(o) {
  // no Extra o "departamento" é o termo de busca usado pelo coletor: não serve
  // nem as seções de campanha/ofertas do dia (Semar "Campanhas", Nagumo "ofertas-dia"), que misturam de tudo
  // tabloide Drogarias Joanin: o departamento é só 'Farmácia (Drogarias Joanin)'; decide pelo nome, como farmácia
const dept = /^(busca:|campanhas|ofertas)/i.test(o.categoryRaw ?? '') || o.section === 'farmacia' ? '' : strip(o.categoryRaw);
  const name = strip(o.name);
  // Farmácia (Fase 14): remédio de receita, ou o que o coletor já marcou como farmácia, ou departamento de
  // medicamento/saúde. Higiene e beleza vendidas em farmácia seguem para "higiene" e comparam com os mercados.
  if (o.rx || o.category === 'farmacia') return 'farmacia';
  if (dept && FARMACIA.test(dept) && !/^(higiene|beleza|perfumaria)/.test(dept)) return 'farmacia'; // 'Higiene > Saúde Bucal' é higiene
  // higiene e limpeza que o coletor já separou continuam (os coletores acertam bem essas duas)
  if (o.category === 'higiene' || o.category === 'limpeza') return o.category;
  if (dept) for (const [c, re] of DEPT) if (re.test(dept)) return c;
  // não é comida nem higiene/limpeza, mesmo com "carne", "laranja" ou "pão" no nome (ração, vela, semente, utensílio)
  // ("copo", "pote", "garrafa" e "prato" ficam de fora: são embalagem de comida ou marca, como Prato Fino)
  if (/\b(p\/? ?(caes|gatos?|cao)|para (caes|gatos?|cao)|caes|gatos|racao|petiscos?|bifinhos?|velas?|sementes? (feltrin|isla|topseed)|forma para|assadeira|frigideira|tigela|vasilha|caneca|espuma para|tacas?|colher|faca|espatula|espremedor|triturador|decanter|brinquedo|bolha de sabao|saboneteira)\b/.test(name)) return 'outros';
  // farmácia de rede: a folha do departamento ("Antihipertensivo") nem sempre diz que é remédio. O nome só tira do
  // chip Farmácia o que é claramente higiene, limpeza ou bebida (as regras de comida pegariam "Sal de Fruta", "Alho
  // em cápsulas"); Conveniência é a prateleira de comida; o resto é remédio ou saúde.
  if (o.segment === 'farmacia' || o.section === 'farmacia') {
    for (const [c, re] of NAME) if (['higiene', 'limpeza', 'bebidas'].includes(c) && re.test(name)) return c;
    // prateleira de beleza/acessórios (a Drogaria São Paulo dá só a folha: "Elástico de Cabelo", "Pente", "Cera")
    if (/cabelo|pente|cilios|pincel|maquiagem|\bcera\b|depilat|leave-in|talco|protetor labial|bloqueador de odor|esmalte|unha|perfume|colonia/.test(dept)) return 'higiene';
    // prateleira de comida e bebida (Conveniência na Farma Conde; folhas como "Bala", "Sorvete", "Adoçante" na DSP)
    if (/conveniencia|chocolate|bombom|\bbalas?\b|chiclete|pastilha|sorvete|picole|biscoito|cereal|\bcha\b|adocante|\bagua\b|papinha|alimento|snack/.test(dept)) {
      // sabor no nome não é hortifruti nem carne ("Bala Limão", "Chá de Maçã")
      for (const [c, re] of NAME) if (c !== 'hortifruti' && c !== 'carnes' && re.test(name)) return c;
      return /\bagua\b/.test(dept) ? 'bebidas' : 'mercearia';
    }
    return 'farmacia';
  }
  for (const [c, re] of NAME) if (re.test(name)) return c;
  if (/\b(azeite|oleo|arroz|feijao|acucar|cafe|farinha|macarrao|massa|biscoito|bolacha|chocolate|molho|tempero|achocolatado|cereal|aveia|fermento|sal|pao|torrada|bolo|salgadinho|pipoca|amendoim|bala|balas|chiclete|gelatina|doce|leite em po|leite condensado|barra de cereal)\b/.test(name)) return 'mercearia';
  return o.category === 'alimenticios' ? 'mercearia' : 'outros';
}
