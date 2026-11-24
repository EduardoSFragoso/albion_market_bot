#!/usr/bin/env node
// Registra os 4 slash commands do bot globalmente na API do Discord.
// Node puro (fetch), sem dependências — nada de @albion/core aqui.
//
// Credenciais: env DISCORD_BOT_TOKEN e DISCORD_APPLICATION_ID,
// ou o arquivo apps/bot/.dev.vars no formato KEY=VALUE.
//
// Uso: node scripts/register-commands.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  const file = resolve(here, '..', '.dev.vars');
  if (!existsSync(file)) return {};
  const vars = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) vars[key] = value;
  }
  return vars;
}

const devVars = loadDevVars();
const TOKEN = process.env.DISCORD_BOT_TOKEN || devVars.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_APPLICATION_ID || devVars.DISCORD_APPLICATION_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN não definido (env ou apps/bot/.dev.vars).');
  console.error('   Pegue o token em: Discord Developer Portal → seu app → Bot → Reset Token.');
  process.exit(1);
}
if (!APP_ID) {
  console.error('❌ DISCORD_APPLICATION_ID não definido (env ou apps/bot/.dev.vars).');
  console.error('   Pegue o ID em: Discord Developer Portal → seu app → General Information.');
  process.exit(1);
}

const MAIN_CITIES = [
  'Thetford',
  'Fort Sterling',
  'Lymhurst',
  'Bridgewatch',
  'Martlock',
  'Caerleon',
  'Brecilien',
  'Black Market',
];

const commands = [
  {
    name: 'preco',
    description: 'Mostra preços de um item por cidade (vender por / comprar por) e a melhor rota.',
    options: [
      {
        name: 'item',
        description: 'Nome do item (PT ou EN) ou id exato (ex.: T4_BAG)',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'qualidade',
        description: 'Qualidade do item (padrão: 1 — Normal)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 5,
      },
    ],
  },
  {
    name: 'craft',
    description: 'Calcula custo de fabricação, receita e lucro líquido de um item.',
    options: [
      {
        name: 'item',
        description: 'Nome do item (PT ou EN) ou id exato (ex.: T4_BAG)',
        type: 3,
        required: true,
      },
      {
        name: 'cidade_compra',
        description: 'Cidade onde compra os materiais (padrão: Caerleon)',
        type: 3,
        required: false,
        choices: MAIN_CITIES.map((c) => ({ name: c, value: c })),
      },
      {
        name: 'cidade_venda',
        description: 'Cidade onde vende o produto (padrão: Black Market)',
        type: 3,
        required: false,
        choices: MAIN_CITIES.map((c) => ({ name: c, value: c })),
      },
      {
        name: 'rrr',
        description: 'Resource Return Rate (0–0.6; padrão 0.152 = base)',
        type: 10, // NUMBER
        required: false,
        min_value: 0,
        max_value: 0.6,
      },
    ],
  },
  {
    name: 'lucro',
    description: 'Top 5 rotas de lucro comprando instantâneo e vendendo em ordem, com impostos.',
    options: [
      {
        name: 'item',
        description: 'Nome do item (PT ou EN) ou id exato (ex.: T4_BAG)',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'oportunidades',
    description: 'Top 10 itens mais lucrativos para craftar e vender no Black Market (scan em massa).',
    options: [
      {
        name: 'tier_min',
        description: 'Tier inicial do scan (padrão: 4)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 8,
      },
      {
        name: 'tier_max',
        description: 'Tier final do scan (padrão: 6)',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 8,
      },
      {
        name: 'encantamento',
        description: 'Filtra por nível de encantamento (padrão: sem filtro)',
        type: 4,
        required: false,
        min_value: 0,
        max_value: 3,
      },
    ],
  },
];

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

let res;
try {
  res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
} catch (err) {
  console.error(`❌ Falha de rede ao chamar a API do Discord: ${err?.message ?? err}`);
  process.exit(1);
}

const text = await res.text();
if (res.status !== 200 && res.status !== 201) {
  console.error(`❌ Discord rejeitou o registro (HTTP ${res.status}):`);
  console.error(text);
  process.exit(1);
}

let list;
try {
  list = JSON.parse(text);
} catch {
  list = null;
}
console.log('✅ Comandos registrados globalmente no Discord:');
if (Array.isArray(list)) {
  for (const c of list) console.log(`   • /${c.name} — ${c.description}`);
} else {
  console.log(text);
}
