import { client, PERMISSIONS, getPermissionName } from './bot.js';
import {
  Client,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

let queue = [];
let isProcessing = false;
const imageCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; 



const helpMessage = `
    **Elixpo Discord Bot Commands:**

  - **\`/generate\`** - Generate images based on a prompt.
    **Options:** \`prompt\` (required), \`theme\`, \`model\`, \`aspect_ratio\`, \`enhancement\`, \`number_of_images\` (1-4), \`seed\`.

  - **\`/edit\`** - Remix or edit an existing image. **Use the \`original_picture_message_id\` and \`img_index_to_edit\` options to specify the image.**
    **Options:** \`original_picture_message_id\` (required), \`prompt\` (required), \`img_index_to_edit\` (1-4, required), \`aspect_ratio\`, \`theme\`, \`enhancement\`, \`seed\`. Note: \`model\` is fixed to \`gptimage\` for remixing, and **\`number_of_images\` is fixed to 1 for edits.**

  - **\`/help\`** - Display this help message.
  - **\`/ping\`** - Check if the bot is online.
            `;


function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of imageCache) {
        if (now - value.timestamp > CACHE_DURATION) {
            console.log(`Cleaning up cache for interaction ${key}`);
            imageCache.delete(key);
        }
    }
}

setInterval(cleanupCache, 10 * 60 * 1000);
console.log("Cache cleanup scheduled.");



client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.user.bot) return; 

  const channel = interaction.channel;
  const botMember = interaction.guild?.members.me;

  // Basic checks first
  if (!channel || !botMember) {
      console.warn(`Interaction occurred in a null channel or botMember is null. ID: ${interaction.id}`);
      try {
          await interaction.reply({
              content: "Could not determine the channel or bot permissions for this interaction.",
              ephemeral: true
          });
      } catch (e) { console.error("Error sending null channel/member error:", e); }
      return;
  }

  const botPermissions = channel.permissionsFor(botMember);

  if (!botPermissions) {
      console.warn(`Could not get permissions for bot in channel. ID: ${interaction.id}`);
      try {
          await interaction.reply({
              content: "Could not determine bot permissions for this channel.",
              ephemeral: true
          });
      } catch (e) { console.error("Error sending permissions check error:", e); }
      return;
  }

  if (interaction.commandName === 'help' || interaction.commandName === 'ping') {
    const essentialPermissionsSimple = [
      PERMISSIONS.ViewChannel,
      PERMISSIONS.SendMessages
    ];

    const missingPerms = essentialPermissionsSimple.filter(perm => !botPermissions.has(perm));

    if (missingPerms.length > 0) {
      const permissionNames = missingPerms.map(getPermissionName).join(', ');
      try {
        await interaction.reply({
          content: `⚠️ I am missing the following required permissions to respond in this channel: **${permissionNames}**\nPlease ensure I have these permissions.`,
          ephemeral: true
        });
      } catch (e) { console.error("Error sending missing permissions message for simple command:", e); }
      return;
    }

       if (interaction.commandName === 'help') {
            try { await interaction.reply({ content: helpMessage, ephemeral: false }); } catch (e) { console.error("Error sending help message:", e); }
        } else if (interaction.commandName === 'ping') {
            try { await interaction.reply({ content: "Yooo! I'm ready to paint xD", ephemeral: false }); } catch (e) { console.error("Error sending ping message:", e); }
        }
        return;
  }

  if (interaction.commandName === 'generate' || interaction.commandName === 'edit') {

       const requiredFatalFlags = [
           PERMISSIONS.ViewChannel,
           PERMISSIONS.SendMessages,
           PERMISSIONS.AttachFiles,
       ];

       if (interaction.commandName === 'edit') {
           requiredFatalFlags.push(PERMISSIONS.ReadMessageHistory);
       }

       const missingFatal = requiredFatalFlags.filter(flag => !botPermissions.has(flag));

       if (missingFatal.length > 0) {
            const permissionNames = missingFatal.map(getPermissionName).join(', ');
            try {
                await interaction.reply({
                    content: `⚠️ I am missing the following **required** permissions in this channel: **${permissionNames}**.\n\nPlease ensure I have them before using the \`${interaction.commandName}\` command.`,
                    ephemeral: true
                });
            } catch (e) {
                console.error(`Error sending FATAL missing permissions message for ${interaction.commandName}:`, e);
            }
            return;
       }

       let missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);
       try {
           await interaction.deferReply({ ephemeral: false });
       } catch (e) {
           console.error("Fatal: Could not defer interaction after permission check:", e);
           return;
       }
       interaction._missingEmbeds = missingEmbeds;
       addToQueue(interaction);
   }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (customId === 'edit_image') {
        try {
             // Check permissions before attempting to reply
             const channel = interaction.channel;
             const botMember = interaction.guild?.members.me;
             if (channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages)) {
                await interaction.reply({ content: "To edit an image, use the `/edit` command and provide the Message ID and Image img_index_to_edit as options.", ephemeral: true });
             } else {
                console.warn(`Cannot reply to edit button interaction due to missing SendMessages permission in channel ${interaction.channel?.id}`);
             }
        } catch (e) {
            console.error("Error replying to edit button interaction:", e);
        }
        return;
    }

    if (customId.startsWith('download_')) {
         const channel = interaction.channel;
         const botMember = interaction.guild?.members.me;

         if (!(channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages, PERMISSIONS.AttachFiles))) {
             console.warn(`Cannot reply to download button interaction due to missing SendMessages or AttachFiles permission in channel ${channel?.id}`);
             try {
                 await interaction.reply({ content: "I do not have the necessary permissions (Send Messages, Attach Files) to provide the image file for download.", ephemeral: true });
             } catch (e) { console.error("Error sending fallback permission error for download button:", e); }
             return;
        }

        const parts = customId.split('_');
        if (parts.length !== 3 || parts[0] !== 'download' || isNaN(parseInt(parts[1], 10)) || isNaN(parseInt(parts[2], 10))) {
            console.error(`Invalid download button customId format: ${customId}`);
            try {
                 await interaction.reply({ content: "Could not process the download request due to an invalid button ID format.", ephemeral: true });
            } catch (e) { console.error("Error replying to invalid download button:", e); }
            return;
        }

        const originalInteractionId = parts[1];
        const imageIndex = parseInt(parts[2], 10);

        const cacheEntry = imageCache.get(originalInteractionId);

        if (!cacheEntry || !cacheEntry.data || imageIndex < 0 || imageIndex >= cacheEntry.data.length) {
            console.warn(`Image data not found in cache for interaction ${originalInteractionId} img_index_to_edit ${imageIndex}. Cache keys: ${Array.from(imageCache.keys()).join(', ')}`);
            try {
                await interaction.reply({ content: "Sorry, the image data for this download button has expired or was not found in the cache. Please try generating the image again.", ephemeral: true });
            } catch (e) { console.error("Error replying when image data not found:", e); }
            return;
        }

        const imageItem = cacheEntry.data[imageIndex];

        try {
             if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                      content: `Here is image #${imageIndex + 1}:`,
                      files: [imageItem.attachment],
                  });
             } else {
                await interaction.reply({
                    content: `Here is image #${imageIndex + 1}:`,
                    files: [imageItem.attachment],
                    ephemeral: true 
                });
             }

             console.log(`Successfully sent image #${imageIndex + 1} for interaction ${originalInteractionId} via button click.`);
        } catch (e) {
            console.error(`Error replying with image #${imageIndex + 1} for interaction ${originalInteractionId}:`, e);
            try {
                 await interaction.reply({ content: `Failed to send image #${imageIndex + 1}. An error occurred.`, ephemeral: true });
            } catch (e2) { console.error("Error sending fallback error for download button:", e2); }
        }
    }
});


async function processQueueDiscord() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const interaction = queue[0];
  const missingEmbeds = interaction._missingEmbeds || false;
  let intermediateText = '';
  let conclusionText = '';
  let formattedIntermediateText = '';
  let formattedConclusionText = '';
  let generatedImagesWithUrls = [];
  let finalContent = '';
  const embedsToSend = [];
  const actionRow = new ActionRowBuilder();

  try {
    let initialStatusContent = '';
    if (missingEmbeds) {
         initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n`;
    }
     initialStatusContent += interaction.commandName === 'generate' ? '✨ Wowza I see.. Your request is on the way!' : '🪄 Getting ready to remix your creation!';
    if (!interaction.replied && !interaction.deferred) {
        console.warn(`Interaction ${interaction.id} was not replied or deferred before processing queue. Skipping.`);
        queue.shift(); 
        setImmediate(processQueueDiscord); 
        return; 
    }

    await interaction.editReply(initialStatusContent);
    const promptString = interaction.options.getString("prompt");
    if (!promptString) { 
        finalContent = `${initialStatusContent}\n\n❌ Critical Error: Prompt option is missing. Please ensure the command is used correctly.`;
        await interaction.editReply({ content: finalContent });
        console.error(`[processQueueDiscord] Prompt option missing for interaction ${interaction.id}`);
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
    }

     intermediateText = sanitizeText(await generateIntermediateText(promptString));
     formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';

    let generationStatusContent = initialStatusContent; // Start from initial content
    if (formattedIntermediateText) {
        generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${interaction.commandName === 'generate' ? '> 🎨 Painting my canvas!' : '> 🔄 Tweaking Pixels, just a moment!'}`;
    await interaction.editReply(generationStatusContent);


    if (interaction.commandName === 'generate') {
       generatedImagesWithUrls = await generateImage(interaction);
    } else if (interaction.commandName === 'edit') {
       const targetMessageId = interaction.options.getString("original_picture_message_id");
       const requestedIndex = interaction.options.getInteger("img_index_to_edit");
       const aspectRatio = interaction.options.getString("aspect_ratio") || "16:9";
       if (!targetMessageId || requestedIndex === null) {
            console.error(`[processQueueDiscord][/edit] Required options missing for interaction ${interaction.id}: original_picture_message_id=${targetMessageId}, img_index_to_edit=${requestedIndex}`);
             finalContent = `${initialStatusContent}\n\n❌ Critical Error: Required options (\`original_picture_message_id\`, \`img_index_to_edit\`) were not provided or were invalid. Please ensure the command is used correctly.`;
             await interaction.editReply({ content: finalContent });
             queue.shift(); setImmediate(processQueueDiscord); return; 
       }
       let referencedMessage;
       try {
            console.log(`[processQueueDiscord][/edit] Attempting to fetch message with ID: ${targetMessageId} for user ${interaction.user.id} in channel ${interaction.channel?.id}`);
            if (interaction.channel && 'messages' in interaction.channel) {
                 referencedMessage = await interaction.channel.messages.fetch(targetMessageId);
                 console.log(`[processQueueDiscord][/edit] Successfully fetched message ID: ${targetMessageId}`);
            } else {
                 console.error(`[processQueueDiscord][/edit] Interaction channel is null or does not have a messages manager.`);
                 finalContent = `${generationStatusContent}\n\n❌ Could not fetch message data. Invalid channel.`; 
                 await interaction.editReply({ content: finalContent });
                 queue.shift(); setImmediate(processQueueDiscord); return; 
            }

       } catch (fetchError) {
            console.error(`Failed to fetch message ID ${targetMessageId} for user ${interaction.user.id} in channel ${interaction.channel?.id}:`, fetchError);
            finalContent = `${generationStatusContent}\n\n❌ Could not find the message with ID \`${targetMessageId}\`. It might have been deleted, is too old, or I lack permissions (**${getPermissionName(PERMISSIONS.ReadMessageHistory)}**).`; // Use generationStatusContent
            await interaction.editReply({ content: finalContent });
            queue.shift(); setImmediate(processQueueDiscord); return; 
       }

       if (referencedMessage.author.id !== client.user.id || !referencedMessage.embeds || referencedMessage.embeds.length === 0) {
            finalContent = `${generationStatusContent}\n\n❌ The message with ID \`${targetMessageId}\` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages.`; // Use generationStatusContent
            await interaction.editReply({ content: finalContent });
            console.warn(`/edit provided message ID ${targetMessageId} which is not a bot/image message by user ${interaction.user.id}`);
            queue.shift(); setImmediate(processQueueDiscord); return; 
       }

       const originalEmbed = referencedMessage.embeds[0];
       const footerText = originalEmbed?.footer?.text;
       const idMatch = footerText?.match(/ID: (\d+)/);
       const originalInteractionId = idMatch ? idMatch[1] : null;

       if (!originalInteractionId) {
           finalContent = `${generationStatusContent}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID \`${targetMessageId}\`. The message format might be outdated or corrupted.`; // Use generationStatusContent
           await interaction.editReply({ content: finalContent });
           console.warn(`Could not parse original interaction ID from footer "${footerText}" for user ${interaction.user.id} (message ID: ${targetMessageId})`);
            queue.shift(); setImmediate(processQueueDiscord); return; 
       }
       const originalCacheEntry = imageCache.get(originalInteractionId);

       if (!originalCacheEntry || !originalCacheEntry.data) {
           finalContent = `${generationStatusContent}\n\n❌ The data for the original image from message ID \`${targetMessageId}\` has expired from the cache. Please try generating the original image again and then use the \`/edit\` command with the new message ID.`; // Use generationStatusContent
           await interaction.editReply({ content: finalContent });
           console.warn(`Original cache data not found for interaction ${originalInteractionId} (via message ID ${targetMessageId}). User ${interaction.user.id} requested edit.`);
            queue.shift(); setImmediate(processQueueDiscord); return; 
       }
       if (requestedIndex < 1 || requestedIndex > originalCacheEntry.data.length) {
            finalContent = `${generationStatusContent}\n\n❌ Invalid image img_index_to_edit \`${requestedIndex}\` for message ID \`${targetMessageId}\`. Please provide an img_index_to_edit between 1 and ${originalCacheEntry.data.length} for that message.`; // Use generationStatusContent
            await interaction.editReply({ content: finalContent });
            console.warn(`Invalid image img_index_to_edit ${requestedIndex} provided by user ${interaction.user.id} for message ID ${targetMessageId}. Max img_index_to_edit was ${originalCacheEntry.data.length}`);
            queue.shift(); setImmediate(processQueueDiscord); return; 
       }

       const sourceImageItem = originalCacheEntry.data[requestedIndex - 1];
       const sourceImageUrl = sourceImageItem.url;

       if (!sourceImageUrl) {
            finalContent = `${generationStatusContent}\n\n❌ Could not retrieve the URL for the selected image from the cache for message ID \`${targetMessageId}\`.`; // Use generationStatusContent
            await interaction.editReply({ content: finalContent });
            console.warn(`Could not get URL for image ${requestedIndex} from cache for interaction ${originalInteractionId} (via message ID ${targetMessageId}).`);
             queue.shift(); setImmediate(processQueueDiscord); return; 
       }

       console.log(`User ${interaction.user.tag} is editing image ${requestedIndex} from message ID ${targetMessageId} (original interaction ${originalInteractionId}) using source URL: ${sourceImageUrl} with aspect ratio: ${aspectRatio}`);
       generatedImagesWithUrls = await generateRemixImage(interaction, sourceImageUrl, aspectRatio); 
    }
    // conclusionText = sanitizeText(await generateConclusionText(promptString));
    // formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';


    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment);
    if (generatedAttachments && generatedAttachments.length > 0) {
       const prompt = interaction.options.getString("prompt");
       const numberOfImagesRequested = interaction.commandName === 'generate' ? (interaction.options.getInteger("number_of_images") || 1) : 1;
       const actualNumberOfImages = generatedAttachments.length; 
       const aspectRatio = interaction.options.getString("aspect_ratio") || "16:9";
       const theme = interaction.options.getString("theme") || "normal";
       const enhancement = interaction.options.getBoolean("enhancement") || false;
       const modelUsed = interaction.commandName === 'edit' ? "gptimage" : (interaction.options.getString("model") || "flux");
       const seed = interaction.options.getInteger("seed"); 

       // Construct the final content string
       finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}` + (formattedIntermediateText || ''); 
       if (interaction.commandName === 'generate') {
            finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully generated!`;
       } else if (interaction.commandName === 'edit') {
            finalContent += `${finalContent ? '\n\n' : ''}✨ Your image(s) have been successfully remixed!`;
       }

       if (formattedConclusionText) {
           finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`;
       }

       if (!missingEmbeds) {
           const embed = new EmbedBuilder()
              .setTitle(interaction.commandName === 'generate' ? '🖼️ Image Generated Successfully' : '🔄 Image Remixed Successfully')
              .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
              .setColor(interaction.commandName === 'generate' ? '#5865F2' : '#E91E63')
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
                    `• **Images**: \`${actualNumberOfImages}${interaction.commandName === 'generate' && numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                    `${seed !== null && interaction.commandName === 'generate' && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`, // Only show user seed if generate and n=1
                  inline: false
                }
              )
              .setTimestamp()
              .setFooter({
                text: `Created by ElixpoArt | \n Interaction ID: ${interaction.id} \n Message ID: ${interaction.channel?.lastMessageId || "Oopsie!!"}`,
                iconURL: client.user.displayAvatarURL()
              });

            if (interaction.commandName === 'edit') {
                 const targetMessageId = interaction.options.getString("original_picture_message_id");
                 const requestedIndex = interaction.options.getInteger("img_index_to_edit");
                 const targetMessageLink = `[this message](https://discord.com/channels/${interaction.guild?.id || '@me'}/${interaction.channel?.id || 'unknown'}/${targetMessageId})`;
                 embed.addFields({
                     name: 'Source',
                     value: `Remixed from image **#${requestedIndex}** in ${targetMessageLink} (ID: \`${targetMessageId}\`).`,
                     inline: false
                 });
            }

           embedsToSend.push(embed);
       } else {
            finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
                            `• **Theme**: \`${theme}\`\n` +
                            `• **Model**: \`${modelUsed}\`\n` +
                            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
                             `• **Images**: \`${actualNumberOfImages}${interaction.commandName === 'generate' && numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                            `${seed !== null && interaction.commandName === 'generate' && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`;

            if (interaction.commandName === 'edit') {
                 const targetMessageId = interaction.options.getString("original_picture_message_id");
                 const requestedIndex = interaction.options.getInteger("img_index_to_edit");
                 finalContent += `\n• **Source**: Remixed from image #${requestedIndex} in message ID \`${targetMessageId}\`.`;
            }
       }

       const editButton = new ButtonBuilder()
           .setLabel('Remix')
           .setStyle(ButtonStyle.Secondary)
           .setCustomId('edit_image'); 
       actionRow.addComponents(editButton);

       // Add Download buttons based on the number of images generated *in this response*
       if (actualNumberOfImages === 1) {
        const firstImageUrl = generatedImagesWithUrls[0]?.url;
        const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;
        // Validate URL: must be a non-empty string, start with http, and not exceed Discord's limit
        const isValidUrl = typeof firstImageUrl === 'string'
            && firstImageUrl.startsWith('http')
            && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;
        if (isValidUrl) {
            const downloadButton = new ButtonBuilder()
                .setLabel('Download')
                .setStyle(ButtonStyle.Link)
                .setURL(firstImageUrl);
            actionRow.addComponents(downloadButton);
            console.log(`[processQueueDiscord] Added Link button for single image (URL length: ${firstImageUrl.length}).`);
        } else {
            // Always fallback to a customId button if URL is invalid
            const downloadButton = new ButtonBuilder()
                .setLabel('Download')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`download_${interaction.id}_0`);
            actionRow.addComponents(downloadButton);
            if (!firstImageUrl) {
                console.log(`[processQueueDiscord] No valid URL for Link button, using Primary button with Custom ID.`);
            } else {
                console.log(`[processQueueDiscord] URL too long or invalid (${firstImageUrl}), using Primary button with Custom ID.`);
            }
        }
       } else { // Multiple images require custom download buttons
            for (let i = 0; i < actualNumberOfImages; i++) {
                const downloadButton = new ButtonBuilder()
                    .setLabel(`Download #${i + 1}`)
                    .setStyle(ButtonStyle.Primary)
                    .setCustomId(`download_${interaction.id}_${i}`); // Use interaction.id and current img_index_to_edit
                 actionRow.addComponents(downloadButton);
            }
             console.log(`[processQueueDiscord] Added ${actualNumberOfImages} Primary buttons for multiple images.`);
       }
       // --- End Buttons ---

       const hasComponents = actionRow.components.length > 0;

       // Cache if any images were generated. This is necessary for download buttons on the *new* message
       // and for editing the result of this generation.
       const needsCaching = generatedImagesWithUrls.length > 0;

       if (needsCaching) {
               imageCache.set(interaction.id, {
                   data: generatedImagesWithUrls,
                   timestamp: Date.now()
               });
               console.log(`Stored ${generatedImagesWithUrls.length} images in cache for interaction ${interaction.id} (Type: ${interaction.commandName}).`);
       } else {
           console.log(`No images generated for interaction ${interaction.id}. Nothing to cache.`);
       }


      // Final editReply includes content, embed (if available), files, and components (buttons)
      const finalEditOptions = {
        content: finalContent,
        files: generatedAttachments,
        components: hasComponents ? [actionRow] : [],
      };
      if (!missingEmbeds && embedsToSend.length > 0) {
          finalEditOptions.embeds = embedsToSend;
      }

      await interaction.editReply(finalEditOptions);

    } else {
       // If no attachments were generated, send error message
       let errorContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission.\n\n` : ''}` +
                          (formattedIntermediateText || '');

       if (interaction.commandName === 'generate') {
            errorContent += `${errorContent ? '\n\n' : ''}⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data.`;
       } else if (interaction.commandName === 'edit') {
             errorContent += `${errorContent ? '\n\n' : ''}⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data.`;
       }
       errorContent += ` Please try again later.`;

        if (formattedConclusionText) {
           errorContent += `${errorContent ? '\n\n' : ''}${formattedConclusionText}`;
        }

       await interaction.editReply({
         content: errorContent,
       });
       console.error(`Image generation/remix failed for interaction ${interaction.id} (Type: ${interaction.commandName}). No attachments generated.`);
    }

  } catch (error) {
    console.error('Error processing queue / generating/remixing image:', error);
    try {
       // formattedIntermediateText and formattedConclusionText are now in scope here
       let errorContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission.\n\n` : ''}` +
                          (formattedIntermediateText || ''); // Use the potentially empty string

        errorContent += `${errorContent ? '\n\n' : ''}⚠️ An unexpected error occurred while processing your request. Please try again later.`;
        if (formattedConclusionText) { // Use the potentially empty string
           errorContent += `${errorContent ? '\n\n' : ''}${formattedConclusionText}`;
        }
       // Check if interaction is still in a state where editReply is possible
        if (!interaction.replied && !interaction.deferred) {
             console.warn(`Interaction ${interaction.id} became invalid before sending final error message.`);
        } else {
            await interaction.editReply({ content: errorContent });
        }
    } catch (editError) {
       console.error("Failed to edit reply with error message during main error handling:", editError);
    }

  } finally {
    // IMPORTANT: Only shift and process the next item if the current interaction was processed successfully or failed *after* being the head of the queue
    if (queue.length > 0 && queue[0].id === interaction.id) {
       queue.shift();
    } else {
        console.warn(`Queue head does not match the interaction that just finished processing (${interaction.id}). Queue head: ${queue.length > 0 ? queue[0].id : 'empty'}. This might indicate a logic issue or multiple parallel processing attempts.`);
         // If the queue head doesn't match, something is wrong, don't shift. Log the state.
         // Consider adding more robust queue management if this warning occurs frequently.
    }
    setImmediate(processQueueDiscord); // Use setImmediate for async processing
  }
}

function addToQueue(interaction) {
  queue.push(interaction);
  console.log(`Added interaction ${interaction.id} (Type: ${interaction.commandName}) to queue. Queue size: ${queue.length}`);
  if (!isProcessing) {
    console.log("Queue is not processing, starting processQueueDiscord.");
    setImmediate(processQueueDiscord); // Use setImmediate for async processing
  } else {
    console.log("Queue is already processing.");
  }
}

// Updated sanitizeText to allow basic markdown like bold/italics
function sanitizeText(text) {
    if (!text) return '';
    let sanitized = text;
    // Remove links/URLs
    sanitized = sanitized.replace(/(https?:\/\/[^\s]+)/g, '');
    // Remove Markdown code blocks (backticks)
    sanitized = sanitized.replace(/```.*?```/gs, '');
    sanitized = sanitized.replace(/`.*?`/g, '');
     // Remove Markdown quotes (>)
    sanitized = sanitized.replace(/^>.*$/gm, '');
     // Remove list markers
    sanitized = sanitized.replace(/^[\s]*[-+*][\s]+/gm, '');
    // Remove extra asterisks/underscores that aren't part of valid markdown pairs or are at word boundaries
    // Less aggressive regex, allows **bold** and *italics*
    sanitized = sanitized.replace(/(?<!\s)\*\*([^\s*]+)\*\*(?!\s)/g, '**$1**'); // Protect **...** surrounded by non-space
    sanitized = sanitized.replace(/(?<!\s)\*([^\s*]+)\*(?!\s)/g, '*$1*');   // Protect *...* surrounded by non-space
    sanitized = sanitized.replace(/(?<!\s)__([^\s_]+)__(?!\s)/g, '__$1__'); // Protect __...__ surrounded by non-space
    sanitized = sanitized.replace(/(?<!\s)_([^\s_]+)_(?!\s)/g, '_$1_');   // Protect _..._ surrounded by non-space
    sanitized = sanitized.replace(/(?<!\s)~~([^\s~]+)~~(?!\s)/g, '~~$1~~'); // Protect ~~...~~ surrounded by non-space
    // Then remove any remaining unpaired markdown characters
    sanitized = sanitized.replace(/[\*_~`]/g, '');


    // Basic HTML entities (less likely but safe)
    sanitized = sanitized.replace(/</g, '<').replace(/>/g, '>'); // Properly escape HTML

    // Trim leading/trailing whitespace
    sanitized = sanitized.trim();

    // Collapse multiple newlines into max two
     sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    return sanitized;
}


async function generateIntermediateText(promptContent) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil", // Using 'evil' as requested, but consider if a different model is better for this task
    messages: [
      {
        role: "system",
        content: "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly sarcastic remark related to the user's prompt, indicating that the image is being generated/processed. Keep it concise and engaging, ideally one or two sentences. Feel free to use **bold** or *italics* for emphasis within the text. Avoid standard bot responses. Be creative and slightly dramatic about the process. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
      },
      {
        role: "user",
        content: promptContent
      },
    ],
    // Use a fixed seed or a different one for text generation? Keep 23 or make random?
    // Let's use a fixed seed (e.g., 42) for consistent text style, distinct from image seeds.
    seed: 42,
    referrer: "elixpoart",
  };

  try {
    const response = await fetch(textURL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Error generating intermediate text: ${response.status} ${response.statusText}`, errorBody);
      return 'Summoning the creative spirits...'; // Fallback text
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : 'Wooglie Boogliee.. Something is cooking!!'; // Fallback text

  } catch (error) {
    console.error('Network or parsing error generating intermediate text:', error);
    return 'The AI generators are whirring...'; // Fallback text
  }
}

async function generateConclusionText(promptContent) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil", // Using 'evil' as requested
    messages: [
      {
        role: "system",
        content: "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly dramatic flourish acknowledging that the image based on the user's prompt is complete and ready to be viewed. Keep it concise and fun, ideally one sentence, like a reveal. Feel free to use **bold** or *italics* for emphasis. Do not ask questions or continue the conversation. Just a short, punchy statement about the completion. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
      },
      {
        role: "user",
        content: `The image based on "${promptContent}" is now complete.` // Use the prompt in the user message
      },
    ],
    // Use a fixed seed (e.g., 43) for consistent text style, distinct from image seeds.
    seed: 43,
    referrer: "elixpoart",
  };

  try {
    const response = await fetch(textURL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Error generating conclusion text: ${response.status} ${response.statusText}`, errorBody);
      return null; // Allow null or provide a fallback like "Done!"
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : 'Behold the creation!'; // Fallback text
  } catch (error) {
    console.error('Network or parsing error generating conclusion text:', error);
    return null; // Allow null or provide a fallback
  }
}


// Modified to return objects containing { attachment, url } and handle multiple seeds
async function generateImage(interaction) {
  const prompt = interaction.options.getString("prompt");
  const numberOfImages = interaction.options.getInteger("number_of_images") || 1;
  const aspectRatio = interaction.options.getString("aspect_ratio") || "16:9";
  const theme = interaction.options.getString("theme") || "normal";
  const enhancement = interaction.options.getBoolean("enhancement") || false;
  const model = interaction.options.getString("model") || "flux"; 
  const userProvidedSeed = interaction.options.getInteger("seed");

  let width = 1024, height = 683;

  const numImagesToGenerate = Math.max(1, Math.min(4, numberOfImages));

  switch (aspectRatio) {
    case '16:9': width = 1024; height = 576; break;
    case '9:16': width = 576; height = 1024; break;
    case '1:1': width = height = 1024; break;
    case '4:3': width = 1024; height = 768; break;
    case '3:2': width = 1024; height = 683; break;
    default: 
      width = 1024; height = 576; break;
  }

  const suffixPrompt = getSuffixPrompt(theme);
  let encodedPrompt = `${prompt.trim()} ${suffixPrompt}`.trim();

  const imagesWithUrls = [];
  const errors = [];

  for (let i = 0; i < numImagesToGenerate; i++) {
    let currentSeed;
    if (numImagesToGenerate === 1) {
        currentSeed = userProvidedSeed !== null ? userProvidedSeed : Math.floor(Math.random() * 1000000000) + 1;
    } else {
        currentSeed = Math.floor(Math.random() * 1000000000) + 1;
    }

    if(model === 'gptimage') {
        encodedPrompt = `${prompt.trim()} with the strict aspect ratio of ${aspectRatio}`;
    }

    const baseURL = "https://image.pollinations.ai/prompt/";
    const promptParam = encodeURIComponent(encodedPrompt);


    const queryParams = new URLSearchParams({
        width: width.toString(),
        height: height.toString(),
        seed: currentSeed.toString(), 
        model: model,
        enhance: enhancement.toString(),
        nologo: 'true',
        referrer: 'elixpoart',
        token: process.env.POLLINATIONS_TOKEN
    });

    const imgurl = `${baseURL}${promptParam}?${queryParams.toString()}`;

    try {
      console.log(`[Generate] Fetching image ${i + 1}/${numImagesToGenerate} (Seed: ${currentSeed}) from: ${imgurl}`);
      const response = await fetch(imgurl, { method: 'GET' });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Generate] Error fetching image ${i + 1}: ${response.status} ${response.statusText}`, errorText);
        errors.push(`Image ${i + 1} failed to generate.`);
        continue;
      }

      const buffer = await response.buffer();

      // Pollinations returns a small HTML page on errors, check buffer size
      if (buffer.length > 2000) { // Increased check size slightly to avoid small HTML responses
         const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_image_${i + 1}.jpg` });
         imagesWithUrls.push({ attachment: attachment, url: imgurl });
         console.log(`[Generate] Successfully fetched image ${i + 1}. Buffer size: ${buffer.length}`);
      } else {
         console.error(`[Generate] Fetched data for image ${i + 1} is too small (${buffer.length} bytes), likely an error response payload.`);
         errors.push(`Image ${i + 1} returned unexpected data.`);
      }

    } catch (error) {
      console.error(`[Generate] Network or fetching error for image ${i + 1}:`, error);
      errors.push(`Image ${i + 1} failed due to network error.`);
    }
  }

  if (imagesWithUrls.length === 0 && errors.length > 0) {
     console.error("[Generate] All image generation attempts failed. Errors:", errors);
  } else if (errors.length > 0) {
      console.warn("[Generate] Some image generation attempts failed. Errors:", errors);
  }

  return imagesWithUrls;
}


async function generateRemixImage(interaction, sourceImageUrl, aspectRatio) {
  const prompt = interaction.options.getString("prompt");
  const numImagesToGenerate = 1;
  const userProvidedSeed = interaction.options.getInteger("seed");
  const currentSeed = userProvidedSeed !== null ? userProvidedSeed : Math.floor(Math.random() * 1000000000) + 1;
  const imagesWithUrls = [];
  const errors = [];

  // Loop runs only once because numImagesToGenerate is fixed at 1
  for (let i = 0; i < numImagesToGenerate; i++) {
      const baseURL = "https://image.pollinations.ai/prompt/";
      const promptParam = `${prompt.trim()} with the stric aspect ratio of ${aspectRatio}`;

      const queryParams = new URLSearchParams({
          seed: currentSeed.toString(), 
          model: 'gptimage', 
          token: process.env.POLLINATIONS_TOKEN,
          private: 'true',
          nologo: 'true',
          referrer: 'elixpoart',
      });

      let imgurl = `${baseURL}${promptParam}?${queryParams.toString()}`;
      if (sourceImageUrl) {
          imgurl += `&image=${encodeURIComponent(sourceImageUrl)}`;
      }

      try {
          console.log(`[Remix] Fetching image ${i + 1}/${numImagesToGenerate} (Seed: ${currentSeed}) from: ${imgurl}`);
          const response = await fetch(imgurl, { method: 'GET' });

          if (!response.ok) {
              const errorText = await response.text();
              console.error(`[Remix] Error fetching image ${i + 1}: ${response.status} ${response.statusText}`, errorText);
              errors.push(`Remixed Image ${i + 1} failed to generate.`);
              continue;
          }

          const buffer = await response.buffer();

          // Pollinations returns a small HTML page on errors, check buffer size
          if (buffer.length > 2000) { // Increased check size slightly
              const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_remix_${i + 1}.jpg` });
              imagesWithUrls.push({ attachment: attachment, url: imgurl });
              console.log(`[Remix] Successfully fetched image ${i + 1}. Buffer size: ${buffer.length}`);
          } else {
              console.error(`[Remix] Fetched data too small: ${buffer.length} bytes`);
              errors.push(`Remixed Image ${i + 1} returned unexpected data.`);
          }

      } catch (error) {
          console.error(`[Remix] Network or fetching error for image ${i + 1}:`, error);
          errors.push(`Remixed Image ${i + 1} failed due to network error.`);
      }
  }

  if (imagesWithUrls.length === 0 && errors.length > 0) {
      console.error("[Remix] All remix attempts failed. Errors:", errors);
  }

  return imagesWithUrls;
}


function getSuffixPrompt(theme) {
  switch (theme) {
    case "fantasy": return "in a magical fantasy setting, with mythical creatures and surreal landscapes";
    case "halloween": return "with spooky Halloween-themed elements, pumpkins, and eerie shadows";
    case "structure": return "in the style of monumental architecture, statues, or structural art";
    case "crayon": return "in the style of colorful crayon art with vibrant, childlike strokes";
    case "space": return "in a vast, cosmic space setting with stars, planets and nebulae";
    case "chromatic": return "in a chromatic style with vibrant, shifting colors and gradients";
    case "cyberpunk": return "in a futuristic cyberpunk setting with neon lights and dystopian vibes";
    case "anime": return "in the style of anime, with detailed character designs and dynamic poses";
    case "landscape": return "depicting a breathtaking landscape with natural scenery and serene views";
    case "samurai": return "featuring a traditional samurai theme with warriors and ancient Japan";
    case "wpap": return "in the WPAP style with geometric shapes and vibrant pop-art colors";
    case "vintage": return "in a vintage, old-fashioned style with sepia tones and retro aesthetics";
    case "pixel": return "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics";
    case "normal": return "realistic and natural style";
    case "synthwave": return "in a retro-futuristic synthwave style with neon colors and 80s vibes";
    default: return "artistic style"; // Fallback
  }
}

if (!process.env.TOKEN) {
    console.error("FATAL ERROR: Discord bot token not found in environment variables (TOKEN).");
    process.exit(1); // Exit if token is missing
}
if (!process.env.POLLINATIONS_TOKEN) {
     console.warn("Pollinations API token not found in environment variables (POLLINATIONS_TOKEN). Using default 'fEWo70t94146ZYgk'.");
}


// Add event listener for unhandled promise rejections to catch potential issues
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});


client.login(process.env.TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1); // Exit if login fails
});


/*

1. change in the edit command params [checked]
2. fix the message id in the embeds  [checked]
3. let 16:9 be the default ratio [checked]
4. change the default model to flux [checked]
5. change enhancement to type true/false  [checked]
 
*/ 