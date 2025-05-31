/**
 * Handles the /help command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handleHelp(interaction) {
    const helpMessage = `
**Elixpo Discord Bot Commands:**

- **\`/generate\`** - Generate images based on a prompt.
  **Options:** \`prompt\` (required), \`theme\`, \`model\`, \`aspect_ratio\`, \`enhancement\`, \`number_of_images\` (1-4), \`seed\`.

- **\`/edit\`** - Remix or edit an existing image. **Use the \`original_picture_message_id\` and \`img_index_to_edit\` options to specify the image.**
  **Options:** \`original_picture_message_id\` (required), \`prompt\` (required), \`img_index_to_edit\` (1-4, required), \`aspect_ratio\`, \`theme\`, \`enhancement\`, \`seed\`. Note: \`model\` is fixed to \`gptimage\` for remixing, and **\`number_of_images\` is fixed to 1 for edits.**

- **\`/help\`** - Display this help message.
- **\`/ping\`** - Check if the bot is online.
    `;
    try {
        await interaction.reply({ content: helpMessage, ephemeral: false });
    } catch (e) {
        console.error("Error sending help message:", e);
        try {
            await interaction.reply({ content: "Oops! Something went wrong with the help command.", ephemeral: true });
        } catch {}
    }
}