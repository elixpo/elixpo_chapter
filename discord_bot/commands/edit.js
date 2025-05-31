import { generateRemixImage } from '../imageService.js';
import { sanitizeText } from '../utils.js';
import { generateIntermediateText, generateConclusionText } from '../textService.js';
import { getPermissionName, PERMISSIONS, client } from '../bot.js';
import { setCache, getCache } from '../cache.js';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Handles the /edit command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handleEdit(interaction) {
    // Permission check
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
        PERMISSIONS.ReadMessageHistory
    ];
    const missing = requiredFlags.filter(flag => !botPermissions.has(flag));
    if (missing.length > 0) {
        const permissionNames = missing.map(getPermissionName).join(', ');
        await interaction.reply({
            content: `⚠️ I am missing the following **required** permissions in this channel: **${permissionNames}**.\n\nPlease ensure I have them before using the \`/edit\` command.`,
            ephemeral: true
        });
        return;
    }
    const missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);

    await interaction.deferReply({ ephemeral: false });

    // Intermediate status
    const prompt = interaction.options.getString("prompt");
    const targetMessageId = interaction.options.getString("original_picture_message_id");
    const requestedIndex = interaction.options.getInteger("img_index_to_edit");
    const aspectRatio = interaction.options.getString("aspect_ratio") || "16:9";
    const theme = interaction.options.getString("theme") || "normal";
    const enhancement = interaction.options.getBoolean("enhancement") || false;
    const modelUsed = "gptimage";
    const seed = interaction.options.getInteger("seed");

    let initialStatusContent = '';
    if (missingEmbeds) {
        initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n`;
    }
    initialStatusContent += '🪄 Getting ready to remix your creation!';

    await interaction.editReply(initialStatusContent);

    // Generate intermediate text
    const intermediateText = sanitizeText(await generateIntermediateText(prompt));
    const formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
    let generationStatusContent = initialStatusContent;
    if (formattedIntermediateText) {
        generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    generationStatusContent += `${generationStatusContent ? '\n\n' : ''}> 🔄 Tweaking Pixels, just a moment!`;
    await interaction.editReply(generationStatusContent);

    // Fetch the referenced message and image data
    let referencedMessage;
    try {
        referencedMessage = await interaction.channel.messages.fetch(targetMessageId);
    } catch (fetchError) {
        await interaction.editReply({
            content: `${generationStatusContent}\n\n❌ Could not find the message with ID \`${targetMessageId}\`. It might have been deleted, is too old, or I lack permissions (**${getPermissionName(PERMISSIONS.ReadMessageHistory)}**).`
        });
        return;
    }

    if (referencedMessage.author.id !== client.user.id || !referencedMessage.embeds || referencedMessage.embeds.length === 0) {
        await interaction.editReply({
            content: `${generationStatusContent}\n\n❌ The message with ID \`${targetMessageId}\` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages.`
        });
        return;
    }

    const originalEmbed = referencedMessage.embeds[0];
    const footerText = originalEmbed?.footer?.text;
    const idMatch = footerText?.match(/ID: (\d+)/);
    const originalInteractionId = idMatch ? idMatch[1] : null;

    if (!originalInteractionId) {
        await interaction.editReply({
            content: `${generationStatusContent}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID \`${targetMessageId}\`. The message format might be outdated or corrupted.`
        });
        return;
    }

    // Get the original image URL from cache
    const originalCacheEntry = getCache(originalInteractionId) || null;
    if (!originalCacheEntry || !originalCacheEntry.data) {
        await interaction.editReply({
            content: `${generationStatusContent}\n\n❌ The data for the original image from message ID \`${targetMessageId}\` has expired from the cache. Please try generating the original image again and then use the \`/edit\` command with the new message ID.`
        });
        return;
    }
    if (requestedIndex < 1 || requestedIndex > originalCacheEntry.data.length) {
        await interaction.editReply({
            content: `${generationStatusContent}\n\n❌ Invalid image img_index_to_edit \`${requestedIndex}\` for message ID \`${targetMessageId}\`. Please provide an img_index_to_edit between 1 and ${originalCacheEntry.data.length} for that message.`
        });
        return;
    }
    const sourceImageItem = originalCacheEntry.data[requestedIndex - 1];
    const sourceImageUrl = sourceImageItem.url;

    if (!sourceImageUrl) {
        await interaction.editReply({
            content: `${generationStatusContent}\n\n❌ Could not retrieve the URL for the selected image from the cache for message ID \`${targetMessageId}\`.`
        });
        return;
    }

    // Generate the remix image
    const generatedImagesWithUrls = await generateRemixImage(interaction, sourceImageUrl, aspectRatio);
    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment);
    const actualNumberOfImages = generatedAttachments.length;

    let finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}` + (formattedIntermediateText || '');
    finalContent += `${finalContent ? '\n\n' : ''}✨ Your image(s) have been successfully remixed!`;

    const embedsToSend = [];
    const actionRow = new ActionRowBuilder();

    if (!missingEmbeds && actualNumberOfImages > 0) {
        const embed = new EmbedBuilder()
            .setTitle('🔄 Image Remixed Successfully')
            .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
            .setColor('#E91E63')
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
                        `• **Images**: \`${actualNumberOfImages}\`` +
                        `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: `Created by ElixpoArt | \n Interaction ID: ${interaction.id} \n Message ID: ${interaction.channel?.lastMessageId || "Oopsie!!"}`,
                iconURL: client.user.displayAvatarURL()
            });

        const targetMessageLink = `[this message](https://discord.com/channels/${interaction.guild?.id || '@me'}/${interaction.channel?.id || 'unknown'}/${targetMessageId})`;
        embed.addFields({
            name: 'Source',
            value: `Remixed from image **#${requestedIndex}** in ${targetMessageLink} (ID: \`${targetMessageId}\`).`,
            inline: false
        });

        embedsToSend.push(embed);
    } else {
        finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
            `• **Theme**: \`${theme}\`\n` +
            `• **Model**: \`${modelUsed}\`\n` +
            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
            `• **Images**: \`${actualNumberOfImages}\`` +
            `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`;
        finalContent += `\n• **Source**: Remixed from image #${requestedIndex} in message ID \`${targetMessageId}\`.`;
    }

    // Add Remix and Download buttons
    const editButton = new ButtonBuilder()
        .setLabel('Remix')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('edit_image');
    actionRow.addComponents(editButton);

    if (actualNumberOfImages === 1) {
        const firstImageUrl = generatedImagesWithUrls[0]?.url;
        const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;
        const isValidUrl = typeof firstImageUrl === 'string'
            && firstImageUrl.startsWith('http')
            && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;
        if (isValidUrl) {
            const downloadButton = new ButtonBuilder()
                .setLabel('Download')
                .setStyle(ButtonStyle.Link)
                .setURL(firstImageUrl);
            actionRow.addComponents(downloadButton);
        } else {
            const downloadButton = new ButtonBuilder()
                .setLabel('Download')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`download_${interaction.id}_0`);
            actionRow.addComponents(downloadButton);
        }
    } else {
        for (let i = 0; i < actualNumberOfImages; i++) {
            const downloadButton = new ButtonBuilder()
                .setLabel(`Download #${i + 1}`)
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`download_${interaction.id}_${i}`);
            actionRow.addComponents(downloadButton);
        }
    }

    // Cache images for download buttons
    if (actualNumberOfImages > 0) {
        setCache(interaction.id, { data: generatedImagesWithUrls, timestamp: Date.now() });
    }

    // Final reply
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
            content: `${finalContent}\n\n⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data. Please try again later.`
        });
    }
}