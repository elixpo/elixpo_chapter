import { generateImage } from '../imageService.js';
import { sanitizeText } from '../utils.js';
import { generateIntermediateText, generateConclusionText } from '../textService.js';
import { getPermissionName, PERMISSIONS, client } from '../bot.js';
import { setCache } from '../cache.js';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Handles the /generate command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handleGenerate(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const channel = interaction.channel;
    const botMember = interaction.guild?.members.me;
    if (!channel || !botMember) {
        await interaction.reply({
            content: "Could not determine the channel or bot permissions for this interaction.",
            ephemeral: true
        });
        return;
    }
    const botPermissions = channel.permissionsFor(botMember);
    const requiredFlags = [
        PERMISSIONS.ViewChannel,
        PERMISSIONS.SendMessages,
        PERMISSIONS.AttachFiles,
    ];
    const missing = requiredFlags.filter(flag => !botPermissions.has(flag));
    if (missing.length > 0) {
        const permissionNames = missing.map(getPermissionName).join(', ');
        await interaction.reply({
            content: `⚠️ I am missing the following **required** permissions in this channel: **${permissionNames}**.\n\nPlease ensure I have them before using the \`/generate\` command.`,
            ephemeral: true
        });
        return;
    }
    const missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);

    

    // Intermediate status
    const prompt = interaction.options.getString("prompt");
    const numberOfImagesRequested = interaction.options.getInteger("number_of_images") || 1;
    const aspectRatio = interaction.options.getString("aspect_ratio") || "16:9";
    const theme = interaction.options.getString("theme") || "normal";
    const enhancement = interaction.options.getBoolean("enhancement") || false;
    const modelUsed = interaction.options.getString("model") || "flux";
    const seed = interaction.options.getInteger("seed");

    let initialStatusContent = '';
    if (missingEmbeds) {
        initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n`;
    }
    initialStatusContent += '✨ Wowza I see.. Your request is on the way!';

    await interaction.editReply(initialStatusContent);

    // Generate intermediate text
    const intermediateText = sanitizeText(await generateIntermediateText(prompt));
    const formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
    let generationStatusContent = initialStatusContent;
    if (formattedIntermediateText) {
        generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    generationStatusContent += `${generationStatusContent ? '\n\n' : ''}> 🎨 Painting my canvas!`;
    await interaction.editReply(generationStatusContent);

    // Generate images
    const generatedImagesWithUrls = await generateImage(interaction);
    setCache(interaction.id, { data: generatedImagesWithUrls, timestamp: Date.now() });
    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment);
    const actualNumberOfImages = generatedAttachments.length;

    // Generate conclusion text
    const conclusionText = sanitizeText(await generateConclusionText(prompt));
    const formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';

    let finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}` + (formattedIntermediateText || '');
    finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully generated!`;

    if (formattedConclusionText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`;
    }

    const embedsToSend = [];
    const actionRow = new ActionRowBuilder();

    if (!missingEmbeds && actualNumberOfImages > 0) {
        const embed = new EmbedBuilder()
            .setTitle('🖼️ Image Generated Successfully')
            .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
            .setColor('#5865F2')
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .addFields(
                {
                    name: '🛠️ Generation Parameters',
                    value:
                        `• **Theme**: \`${theme}\`\n` +
                        `• **Model**: \`${modelUsed}\`\n` +
                        `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                        `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
                        `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                        `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: `Created by ElixpoArt | \n Interaction ID: ${interaction.id} \n Message ID: ${interaction.channel?.lastMessageId || "Oopsie!!"}`,
                iconURL: client.user.displayAvatarURL()
            });
        embedsToSend.push(embed);
    }

    // Add Download buttons
    if (actualNumberOfImages === 1) {
        const firstImageUrl = generatedImagesWithUrls[0]?.url;
        actionRow.addComponents(createDownloadButton(firstImageUrl, interaction.id));
    
    } else {
        actionRow.addComponents(createMultipleDownloadButtons(actualNumberOfImages, interaction.id));
    }

    const finalEditOptions = {
        content: finalContent,
        files: generatedAttachments,
        components: actionRow.components.length > 0 ? [actionRow] : [],
    };
    if (!missingEmbeds && embedsToSend.length > 0) {
        finalEditOptions.embeds = embedsToSend;
    }

    if (actualNumberOfImages > 0) {
        await interaction.editReply(finalEditOptions);
    } else {
        await interaction.editReply({
            content: `${finalContent}\n\n⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data. Please try again later.`
        });
    }
}