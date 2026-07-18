import { buildHelpMessage } from "../../config/help.js";

export const HelpCommandData = {
  name: "help",
  description: "What to run — setup, Ko-fi redeem, grants, and companion bot"
};

/**
 * @param {import('discord.js').Interaction} interaction
 */
export async function handleHelpCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "help") return false;

  const payload = { content: buildHelpMessage(), ephemeral: true };
  if (interaction.deferred) {
    await interaction.editReply(payload);
  } else if (interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
  return true;
}
