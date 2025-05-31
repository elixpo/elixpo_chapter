import { generateImage } from '../imageService.js';
import { sanitizeText } from '../utils.js';
import { generateIntermediateText, generateConclusionText } from '../textService.js';
import { getPermissionName, PERMISSIONS, client } from '../bot.js';
import { setCache, deleteCache } from '../cache.js';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DEFAULT_ASPECT_RATIO, DEFAULT_MODEL, DEFAULT_THEME } from '../config.js';
import { createRemixButton, createDownloadButton, createMultipleDownloadButtons, buildActionRow } from '../components.js';


// Define Discord's maximum URL length for Link buttons (documented limit is 512 characters)
const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;

/**
 * Handles the execution logic for the /generate command after it has been deferred and queued.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
 */
export async function handleGenerate(interaction) {
    // Interaction is already deferred and initial permissions checked by elixpo_discord_bot.js
    // Retrieve missingEmbeds flag stored by the main bot file
    const missingEmbeds = interaction._missingEmbeds || false;

    const prompt = interaction.options.getString("prompt");
    // Retrieve options, using config defaults if not provided
    const numberOfImagesRequested = interaction.options.getInteger("number_of_images") || 1;
    const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
    const theme = interaction.options.getString("theme") || DEFAULT_THEME;
    const enhancement = interaction.options.getBoolean("enhancement") || false;
    const modelUsed = interaction.options.getString("model") || DEFAULT_MODEL;
    const seed = interaction.options.getInteger("seed");

    let statusContent = ''; // Content string for status updates

    // Initial status update (interaction was already deferred)
    statusContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    statusContent += '✨ Wowza I see.. Your request is on the way!';
    await interaction.editReply(statusContent);


    // Generate intermediate text
    let formattedIntermediateText = '';
    try {
       const intermediateText = sanitizeText(await generateIntermediateText(prompt));
       formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating intermediate text for generate interaction ${interaction.id}:`, err);
       formattedIntermediateText = `*Had trouble generating an intermediate thought.*`; // Provide a fallback
    }

    // Update status with intermediate text
    statusContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    if (formattedIntermediateText) {
        statusContent += `${statusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    statusContent += `${statusContent ? '\n\n' : ''}> 🎨 Painting my canvas!`;
    await interaction.editReply(statusContent);

    // --- Generate Images ---
    let generatedImagesWithUrls = [];
    try {
       generatedImagesWithUrls = await generateImage(interaction);
       console.log("Generated Images With URLs:", generatedImagesWithUrls);
    } catch (imgError) {
       console.error(`Error during generateImage for interaction ${interaction.id}:`, imgError);
       // Provide specific error feedback to the user
       await interaction.editReply({
           content: `${statusContent}\n\n❌ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data. Error details: ${imgError.message || 'Unknown error'}`
       });
       return; // Stop processing this command
    }


    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment).filter(att => att instanceof AttachmentBuilder); // Ensure only valid attachments
    const actualNumberOfImages = generatedAttachments.length;


    // --- Generate Conclusion Text ---
    let formattedConclusionText = '';
    try {
       const conclusionText = sanitizeText(await generateConclusionText(prompt));
       formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating conclusion text for generate interaction ${interaction.id}:`, err);
       formattedConclusionText = `*Had trouble generating a concluding thought.*`; // Provide a fallback
    }


    // --- Build Final Reply ---
    let finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    if (formattedIntermediateText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }

    if (actualNumberOfImages > 0) {
        finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully generated!`;
    } else {
         // Should ideally be caught by the try/catch around generateImage, but defensive
         finalContent += `${finalContent ? '\n\n' : ''}⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data.`;
    }


    if (formattedConclusionText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`;
    }

    const embedsToSend = [];
    const actionRow = new ActionRowBuilder();


    // Build Embed if permissions allow and images were generated
    if (!missingEmbeds && actualNumberOfImages > 0) {
        const embed = new EmbedBuilder()
          .setTitle('🖼️ Image Generated Successfully')
          .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
          .setColor('#5865F2') // Discord color for blue
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
            // Use the current interaction ID and message ID for the footer
            text: `Created by ElixpoArt | Interaction ID: ${interaction.id}`,
            iconURL: client.user.displayAvatarURL()
          });

        // REMOVED: embed.setImage(`attachment://${generatedAttachments[0].name}`);
        // This ensures the attachment is sent alongside the embed, not within it.

        embedsToSend.push(embed);
    } else if (missingEmbeds && actualNumberOfImages > 0) {
         // Add parameters to final content if embeds are missing and images were generated
         finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
            `• **Theme**: \`${theme}\`\n` +
            `• **Model**: \`${modelUsed}\`\n` +
            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
            `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
            `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`;
    }

    // Add Remix and Download buttons if images were generated
    if (actualNumberOfImages > 0) {
        actionRow.addComponents(createRemixButton()); // Add Remix button

        if (actualNumberOfImages === 1) {
            // For single image, use the URL if possible for a Link button, otherwise fallback to Primary
            const firstImageUrl = generatedImagesWithUrls[0]?.url;

            // Check if the URL is a valid HTTP(S) URL and within Discord's length limit
            const isValidUrlForLinkButton = typeof firstImageUrl === 'string'
                && (firstImageUrl.startsWith('http://') || firstImageUrl.startsWith('https://'))
                && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;

            if (isValidUrlForLinkButton) {
                 actionRow.addComponents(new ButtonBuilder()
                    .setLabel('Download')
                    .setStyle(ButtonStyle.Link)
                    .setURL(firstImageUrl.replace("&referrer=elixpoart&token=fEWo70t94146ZYgk", "")));
                 console.log(`Added Link button for download for interaction ${interaction.id}.`);
            } else {
                // Fallback to a Primary button if URL is invalid or too long
                 actionRow.addComponents(createDownloadButton(null, interaction.id, 0)); // Pass null URL, index 0
                 console.warn(`Image URL too long or invalid for Link button (${firstImageUrl?.length} chars, limit ${DISCORD_LINK_BUTTON_MAX_URL_LENGTH}). Added Primary download button for interaction ${interaction.id}.`);
            }
        } else {
             // For multiple images, add a download button for each (these are always Primary buttons)
             const maxButtonsPerMessage = 25; // Discord limit for components in a single message (action rows + buttons)
             // Ensure we don't exceed button limits including the remix button already added
             for (let i = 0; i < Math.min(actualNumberOfImages, maxButtonsPerMessage - actionRow.components.length); i++) {
                 actionRow.addComponents(createDownloadButton(null, interaction.id, i)); // Pass null URL, pass index i
             }
             console.log(`Added ${actionRow.components.length - 1} Primary download buttons for multiple images for interaction ${interaction.id}.`);
        }
    }

    // Cache images for download buttons (only if images were actually generated)
    if (generatedImagesWithUrls.length > 0) {
        // Cache using the current interaction ID, storing the { attachment, url } array
        setCache(interaction.id, {
          data: generatedImagesWithUrls,
          timestamp: Date.now()
        });
        console.log(`Stored ${generatedImagesWithUrls.length} generated images in cache for interaction ${interaction.id}.`);
    } else {
         // If no images were generated, ensure no partial cache entry is left
         deleteCache(interaction.id);
         console.log(`No images generated for interaction ${interaction.id}. Nothing cached.`);
    }


    // Final editReply options
    const finalEditOptions = {
        content: finalContent,
        files: generatedAttachments, // Pass the array of AttachmentBuilders
        components: actionRow.components.length > 0 ? [actionRow] : [], // Only send row if it has buttons
        embeds: embedsToSend.length > 0 ? embedsToSend : [], // Embeds if available and permitted
    };

    // Send the final reply (edit the deferred reply)
    try {
        // Check if there are files OR embeds OR content before sending
        if (finalEditOptions.files.length > 0 || finalEditOptions.embeds.length > 0 || finalEditOptions.content.trim().length > 0) {
             await interaction.editReply(finalEditOptions);
             console.log(`Generate command processing finished for interaction ${interaction.id}. Final reply sent.`);
        } else {
             // If no images, no embed, and no substantial content, send a basic error fallback
             // Use statusContent here as it contains initial warnings/messages
             await interaction.editReply({ content: `${statusContent}\n\n⚠️ Failed to generate images and could not construct a proper reply. Please try again.` });
             console.warn(`Generate command for interaction ${interaction.id} resulted in no files, no embeds, and empty content.`);
        }

    } catch (replyError) {
        console.error(`Failed to send final generate reply for interaction ${interaction.id}:`, replyError);
        // A fallback error message is handled by the processQueueDiscord catch block
    }
}