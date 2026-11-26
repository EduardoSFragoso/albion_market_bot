import type { Env, Interaction } from './types.ts';
import { InteractionResponseType, reply } from './common.ts';
import { readInteractionBody, verifyDiscordSignature } from './discord-security.ts';
import { ApiError } from './site-api.ts';
import { cmdCraft } from './craft.ts';
import { cmdEncantamento } from './enchant.ts';
import { cmdLucro } from './profit.ts';
import { cmdOportunidades } from './opportunities.ts';
import { cmdPreco } from './prices.ts';
import { followupEdit } from './interaction-followup.ts';

// Dispatcher fino: valida o envelope do Discord e delega cada comando ao seu módulo.

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    if (request.method === 'GET') {
      return new Response('albion-market-bot online', { status: 200 });
    }
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    let rawBody: string | null;
    try {
      rawBody = await readInteractionBody(request);
    } catch {
      return new Response('invalid body', { status: 400 });
    }
    if (rawBody === null) return new Response('payload too large', { status: 413 });

    let valid = false;
    try {
      valid = await verifyDiscordSignature(env, request, rawBody);
    } catch {
      valid = false;
    }
    if (!valid) return new Response('invalid signature', { status: 401 });

    let interaction: Interaction;
    try {
      interaction = JSON.parse(rawBody) as Interaction;
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }

    if (interaction.type === 1) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (interaction.type === 2 && interaction.data) {
      const options = interaction.data.options;
      try {
        switch (interaction.data.name) {
          case 'preco': return reply(await cmdPreco(env, options));
          case 'craft': return reply(await cmdCraft(env, options));
          case 'lucro': return reply(await cmdLucro(env, options));
          case 'encantamento': return reply(await cmdEncantamento(env, options));
          case 'oportunidades':
            ctx.waitUntil(
              cmdOportunidades(env, options)
                .then((msg) => followupEdit(interaction, msg))
                .catch((err) => followupEdit(interaction, {
                  content: `⚠️ ${err instanceof ApiError ? err.message : 'Erro inesperado — tente novamente.'}`,
                })),
            );
            return new Response(JSON.stringify({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE }), {
              headers: { 'content-type': 'application/json' },
            });
          default:
            return reply({ content: `❓ Comando desconhecido: \`/${interaction.data.name}\`.` });
        }
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : 'Erro inesperado — tente novamente.';
        return reply({ content: `⚠️ ${detail}` });
      }
    }

    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
