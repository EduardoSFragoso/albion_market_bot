import type { Interaction, MessageData } from './types.ts';

export async function followupEdit(interaction: Interaction, msg: MessageData): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }); // falha silenciosa: não há para onde reportar dentro do followup
  } catch {
    /* idem */
  }
}

// ---------- Worker ----------
