/**
 * Safe ephemeral interaction responses.
 * Prefer deferReply + editReply for work that may take >3s (avoids 50027 Invalid Webhook Token).
 */

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {string} content
 */
export async function replyEphemeral(interaction, content) {
  if (interaction.deferred) {
    return interaction.editReply({ content });
  }
  if (interaction.replied) {
    return interaction.followUp({ ephemeral: true, content });
  }
  return interaction.reply({ ephemeral: true, content });
}

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {string} [content]
 */
export async function deferEphemeral(interaction, content) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply({ ephemeral: true });
  if (content) await interaction.editReply({ content });
}

/**
 * Swallow expired/invalid interaction token errors (50027, 10062, 40060).
 * @param {unknown} err
 */
export function isInteractionTokenError(err) {
  const code = err?.code ?? err?.rawError?.code;
  return code === 50027 || code === 10062 || code === 40060;
}

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {() => Promise<void>} fn
 */
export async function withDeferredEphemeral(interaction, fn) {
  await deferEphemeral(interaction);
  try {
    await fn();
  } catch (err) {
    if (!isInteractionTokenError(err)) throw err;
    logInteractionTokenDrop(interaction, err);
  }
}

function logInteractionTokenDrop(interaction, err) {
  import("./logger.js").then(({ log }) =>
    log(`Interaction token expired before reply (${interaction.commandName || interaction.customId}): ${err.message}`)
  );
}
