import { client, PERMISSIONS, getPermissionName } from './bot.js';
import { DISCORD_TOKEN, POLLINATIONS_TOKEN, CACHE_DURATION, DEFAULT_ASPECT_RATIO, DEFAULT_MODEL, DEFAULT_THEME, TEST_GUILD_ID } from './config.js';
import { setCache, getCache, deleteCache, cleanupCache, imageCache } from './cache.js';
import { sanitizeText, getSuffixPrompt } from './utils.js';
import { generateImage, generateRemixImage } from './imageService.js';
import { generateIntermediateText, generateConclusionText } from './textService.js';
import { createRemixButton, createDownloadButton, createMultipleDownloadButtons, buildActionRow } from './components.js';
import { handleGenerate } from './commands/generate.js' // Note: These handlers are not called directly anymore if using the queue
import { handleEdit } from './commands/edit.js'       // Note: These handlers are not called directly anymore if using the queue
import { handlePing } from './commands/ping.js';
import { handleHelp } from './commands/help.js';
import { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'; 

let queue = [];
let isProcessing = false;



setInterval(cleanupCache, 10 * 60 * 1000);
console.log("Cache cleanup scheduled.");

client.on('interactionCreate', async interaction => {
  // Restrict bot usage to the test server only
  if (interaction.guildId !== TEST_GUILD_ID) {
    try {
      await interaction.reply({
        content: "🚧 The bot is currently under development and only available in the test server.",
        ephemeral: true
      });
    } catch (e) {
      console.error("Error sending dev-only message:", e);
    }
    return;
  }

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.user.bot) return;

    const channel = interaction.channel;
    const botMember = interaction.guild?.members.me;
    if (!channel || !botMember) {
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
      try {
        await interaction.reply({
          content: "Could not determine bot permissions for this channel.",
          ephemeral: true
        });
      } catch (e) { console.error("Error sending permissions check error:", e); }
      return;
    }

    // Handle help and ping directly (no queue or deferral needed usually)
    if (interaction.commandName === 'help') {
      // Check permissions for help command reply
       const requiredHelpFlags = [PERMISSIONS.ViewChannel, PERMISSIONS.SendMessages];
       const missingHelp = requiredHelpFlags.filter(flag => !botPermissions.has(flag));
       if (missingHelp.length > 0) {
           const permissionNames = missingHelp.map(getPermissionName).join(', ');
           try {
                await interaction.reply({
                    content: `⚠️ I am missing the following **required** permissions in this channel to send help: **${permissionNames}**.\n\nPlease ensure I have them.`,
                    ephemeral: true
                });
           } catch (e) { console.error("Error sending help permission error:", e); }
           return;
       }
      await handleHelp(interaction);
      return;
    }
    if (interaction.commandName === 'ping') {
       // Check permissions for ping command reply
       const requiredPingFlags = [PERMISSIONS.ViewChannel, PERMISSIONS.SendMessages];
       const missingPing = requiredPingFlags.filter(flag => !botPermissions.has(flag));
       if (missingPing.length > 0) {
            const permissionNames = missingPing.map(getPermissionName).join(', ');
            try {
                await interaction.reply({
                    content: `⚠️ I am missing the following **required** permissions in this channel to respond to ping: **${permissionNames}**.\n\nPlease ensure I have them.`,
                    ephemeral: true
                });
            } catch (e) { console.error("Error sending ping permission error:", e); }
            return;
       }
      await handlePing(interaction);
      return;
    }

    // For generate and edit, check permissions, defer reply and add to queue
    if (interaction.commandName === 'generate' || interaction.commandName === 'edit') {
      // Check specific permissions required for generate/edit commands
      const requiredCommandFlags = [
          PERMISSIONS.ViewChannel,
          PERMISSIONS.SendMessages,
          PERMISSIONS.AttachFiles,
      ];
      if (interaction.commandName === 'edit') {
           requiredCommandFlags.push(PERMISSIONS.ReadMessageHistory); // Edit needs history
      }
      const missing = requiredCommandFlags.filter(flag => !botPermissions.has(flag));
      if (missing.length > 0) {
          const permissionNames = missing.map(getPermissionName).join(', ');
          try {
               await interaction.reply({
                   content: `⚠️ I am missing the following **required** permissions in this channel to use \`${interaction.commandName}\`: **${permissionNames}**.\n\nPlease ensure I have them before using this command.`,
                   ephemeral: true
               });
          } catch (e) { console.error(`Error sending missing permissions error for ${interaction.commandName}:`, e); }
          return;
      }

      // Store missing embed permission for later check inside queue processing
      interaction._missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);

      // Defer the reply immediately as image generation takes time
      try {
        await interaction.deferReply({ ephemeral: false });
      } catch (e) {
        console.error("Failed to defer reply:", e);
        // Attempt a basic reply if defer fails, though deferral is preferred
        try {
             await interaction.reply({
                 content: `An error occurred while preparing your request. Please try again later. (Failed to defer reply)`,
                 ephemeral: true
             });
        } catch (replyError) { console.error("Failed to send fallback reply after defer failed:", replyError); }
        return; // Stop processing this interaction
      }

      // Add interaction to the processing queue
      addToQueue(interaction);
      return;
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === 'edit_image') {
      // This button doesn't perform the edit directly, it instructs the user
      try {
        const channel = interaction.channel;
        const botMember = interaction.guild?.members.me;
        // Ensure bot can send messages before replying
        if (channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages)) {
          // Check if user has permissions to use slash commands in this channel if possible
          // (Optional: More advanced check could see if the /edit command is available to the user)
          const userPermissions = channel.permissionsFor(interaction.user);
          if (!userPermissions?.has(PERMISSIONS.SendMessages)) { // Basic check if user can even talk in channel
             await interaction.reply({
                content: "To edit an image, use the `/edit` command and provide the Message ID and Image img_index_to_edit as options. (You may need permissions to use commands in this channel).",
                ephemeral: true
             });
          } else {
              await interaction.reply({
                content: "To edit an image, use the `/edit` command and provide the Message ID and Image `original_picture_message_id` and `img_index_to_edit` as options.",
                ephemeral: true // Make the reply visible only to the user who clicked
              });
          }

        } else {
          console.warn(`Cannot reply to edit button interaction due to missing SendMessages permission in channel ${interaction.channel?.id}`);
          // Consider sending a DM to the user if cannot reply in channel? Or just log?
        }
      } catch (e) {
        console.error("Error replying to edit button interaction:", e);
      }
      // Always acknowledge button interaction to remove "thinking..." state
      if (!interaction.replied && !interaction.deferred) {
           try { await interaction.deferUpdate(); } catch (e) { console.error("Failed to deferUpdate for edit_image button:", e); }
      } else if (interaction.deferred) {
           // If already deferred by previous logic (less likely for this button)
           try { await interaction.followUp({ content: 'Use the /edit command!', ephemeral: true }); } catch (e) { console.error("Failed to followUp for edit_image button:", e); }
      }


      return;
    }

    if (customId.startsWith('download_')) {
      // Acknowledge the button interaction first to prevent "This interaction failed"
      try {
          if (!interaction.replied && !interaction.deferred) {
              await interaction.deferReply({ ephemeral: true }); // Defer ephemerally as this is a personal download link
          }
      } catch (e) {
          console.error("Failed to deferReply for download button:", e);
          // If defer fails, attempt a regular ephemeral reply later
      }


      const channel = interaction.channel;
      const botMember = interaction.guild?.members.me;

      // Check essential permissions needed to send the file
      if (!(channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages, PERMISSIONS.AttachFiles))) {
        const permissionNames = [PERMISSIONS.SendMessages, PERMISSIONS.AttachFiles].map(getPermissionName).join(', ');
        try {
          // Check if already replied/deferred before attempting a new reply
          if (interaction.replied || interaction.deferred) {
             await interaction.editReply({
               content: `I do not have the necessary permissions (**${permissionNames}**) in this channel to provide the image file for download.`,
             });
          } else {
             await interaction.reply({
               content: `I do not have the necessary permissions (**${permissionNames}**) in this channel to provide the image file for download.`,
               ephemeral: true
             });
          }
        } catch (e) { console.error("Error sending fallback permission error for download button:", e); }
        return; // Stop processing
      }

      const parts = customId.split('_');
      if (parts.length !== 3 || parts[0] !== 'download' || isNaN(parseInt(parts[1], 10)) || isNaN(parseInt(parts[2], 10))) {
        try {
           if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: "Could not process the download request due to an invalid button ID format.",
                });
           } else {
               await interaction.reply({
                   content: "Could not process the download request due to an invalid button ID format.",
                   ephemeral: true
               });
           }
        } catch (e) { console.error("Error replying to invalid download button:", e); }
        return; // Stop processing
      }

      const originalInteractionId = parts[1];
      const imageIndex = parseInt(parts[2], 10); // 0-based index from button customId

      const cacheEntry = getCache(originalInteractionId);

      // Check if cache entry exists and has the expected structure
      if (!cacheEntry || !cacheEntry.data || !Array.isArray(cacheEntry.data)) {
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: "Sorry, the image data for this download button has expired or was not found in the cache, or its format is unexpected. Please try generating the image again.",
                });
            } else {
                await interaction.reply({
                   content: "Sorry, the image data for this download button has expired or was not found in the cache, or its format is unexpected. Please try generating the image again.",
                   ephemeral: true
               });
            }
        } catch (e) { console.error("Error replying when image data not found:", e); }
        return; // Stop processing
      }

      const cachedImages = cacheEntry.data; // Get the array of images

      // Check if the index is valid for the array length
      if (imageIndex < 0 || imageIndex >= cachedImages.length) {
         try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                     content: `Sorry, the image index (#${imageIndex + 1}) for this download button is invalid for the original message.`,
                 });
             } else {
                 await interaction.reply({
                    content: `Sorry, the image index (#${imageIndex + 1}) for this download button is invalid for the original message.`,
                    ephemeral: true
                });
             }
         } catch (e) { console.error("Error replying when image index is out of bounds:", e); }
         return; // Stop processing
      }


      const imageItem = cachedImages[imageIndex]; // Get the specific image item { attachment, url }

      // Check if the specific image item has the attachment
      if (!imageItem || !(imageItem.attachment instanceof AttachmentBuilder)) {
         try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                     content: `Sorry, the attachment data for image #${imageIndex + 1} from the cache is missing or corrupted.`,
                 });
             } else {
                 await interaction.reply({
                   content: `Sorry, the attachment data for image #${imageIndex + 1} from the cache is missing or corrupted.`,
                   ephemeral: true
               });
             }
         } catch (e) { console.error("Error replying when attachment data is missing:", e); }
         return; // Stop processing
      }


      try {
        // Use editReply or followUp based on whether deferReply was successful
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: `Here is image #${imageIndex + 1}:`,
            files: [imageItem.attachment],
            ephemeral: true // Ensure the response is ephemeral
          });
        } else {
           // This case should ideally not happen if deferReply succeeded
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
          // Fallback error message if sending the file fails
           if (interaction.replied || interaction.deferred) {
              await interaction.editReply({
                 content: `Failed to send image #${imageIndex + 1}. An error occurred.`,
                 ephemeral: true // Ensure the response is ephemeral
              });
           } else {
              await interaction.reply({
                 content: `Failed to send image #${imageIndex + 1}. An error occurred.`,
                 ephemeral: true
              });
           }
        } catch (e2) { console.error("Error sending fallback error for download button:", e2); }
      }
      return; // Stop processing
    }
  }
});


async function processQueueDiscord() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const interaction = queue[0]; // Get the current interaction from the front of the queue
  const missingEmbeds = interaction._missingEmbeds || false; // Retrieve the stored flag
  let intermediateText = '';
  let conclusionText = '';
  let formattedIntermediateText = '';
  let formattedConclusionText = '';
  let finalContent = '';
  const embedsToSend = [];

  // Use a local variable for the generated images array for the current processing interaction
  let currentGeneratedImagesWithUrls = [];

  try {
    // Initial status update (already deferred in interactionCreate)
    let initialStatusContent = '';
    if (missingEmbeds) {
      initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n`;
    }
    initialStatusContent += interaction.commandName === 'generate'
      ? '✨ Wowza I see.. Your request is on the way!'
      : '🪄 Getting ready to remix your creation!';

    // Check if the interaction is still valid and can be edited (prevent crashes on old interactions)
    if (!interaction.replied && !interaction.deferred && !interaction.isFromMessage()) {
         console.warn(`Interaction ${interaction.id} became invalid before processing queue step 1. Skipping.`);
         queue.shift();
         setImmediate(processQueueDiscord); // Process next item
         return;
    }
    // Interaction *should* be deferred by now
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

    // Generate intermediate text (can be done while waiting for image service)
    try {
       intermediateText = sanitizeText(await generateIntermediateText(promptString));
       formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating intermediate text for interaction ${interaction.id}:`, err);
       formattedIntermediateText = `*Had trouble generating an intermediate thought.*`; // Provide a fallback
    }


    // Update status with intermediate text
    let generationStatusContent = initialStatusContent;
    if (formattedIntermediateText) {
      generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${interaction.commandName === 'generate' ? '> 🎨 Painting my canvas!' : '> 🔄 Tweaking Pixels, just a moment!'}`;

    // Check interaction validity again before editing
    if (!interaction.replied && !interaction.deferred && !interaction.isFromMessage()) {
        console.warn(`Interaction ${interaction.id} became invalid before processing queue step 2. Skipping.`);
        queue.shift();
        setImmediate(processQueueDiscord); // Process next item
        return;
    }
    await interaction.editReply(generationStatusContent);


    // --- Image Generation or Remix Logic ---
    if (interaction.commandName === 'generate') {
      try {
         currentGeneratedImagesWithUrls = await generateImage(interaction);
         console.log("Generated Images With URLs:", currentGeneratedImagesWithUrls);
      } catch (imgError) {
         console.error(`Error during generateImage for interaction ${interaction.id}:`, imgError);
         // currentGeneratedImagesWithUrls remains []
      }

    } else if (interaction.commandName === 'edit') {
      let referencedMessage;
      const targetMessageId = interaction.options.getString("original_picture_message_id");
      const requestedIndex = interaction.options.getInteger("img_index_to_edit"); // User-facing index (1-based)
      const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;

      // These checks were already done via required options in interactionCreate,
      // but adding here provides a safeguard if command structure changes or queue logic shifts.
      if (!targetMessageId || requestedIndex === null) {
         // Should ideally not happen due to interactionCreate checks, but error handling
         finalContent = `${generationStatusContent}\n\n❌ Critical Error: Required options for \`/edit\` were missing.`;
         await interaction.editReply({ content: finalContent });
         queue.shift(); setImmediate(processQueueDiscord); return;
      }


      try {
        referencedMessage = await interaction.channel.messages.fetch(targetMessageId);
      } catch (fetchError) {
        finalContent = `${generationStatusContent}\n\n❌ Could not find the message with ID \`${targetMessageId}\`. It might have been deleted, is too old, or I lack permissions (**${getPermissionName(PERMISSIONS.ReadMessageHistory)}**).`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      // Validate the referenced message
      if (referencedMessage.author.id !== client.user.id || !referencedMessage.embeds || referencedMessage.embeds.length === 0) {
        finalContent = `${generationStatusContent}\n\n❌ The message with ID \`${targetMessageId}\` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      const originalEmbed = referencedMessage.embeds[0];
      const footerText = originalEmbed?.footer?.text;
      // Regex to find the Interaction ID within the footer text
      const idMatch = footerText?.match(/Interaction ID: (\d+)/); // Make sure this matches the exact text in the footer
      console.log("ID Matched: ", idMatch);
      const originalInteractionId = idMatch ? idMatch[1] : null;

      // Validate the extracted original interaction ID
      if (!originalInteractionId) {
        finalContent = `${generationStatusContent}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID \`${targetMessageId}\`. The message format might be outdated or corrupted.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      // --- CORRECTED CACHE DATA RETRIEVAL AND VALIDATION ---
      const originalCacheEntry = getCache(originalInteractionId); // getCache is synchronous

      console.log("Original Cache Entry from cache:", originalCacheEntry); // Log the retrieved entry


      // Check if the cache entry exists and has the expected 'data' property which is an array
      if (!originalCacheEntry || !originalCacheEntry.data || !Array.isArray(originalCacheEntry.data)) {
        finalContent = `${generationStatusContent}\n\n❌ The data for the original image from message ID \`${targetMessageId}\` has expired or was not found in the cache, or its format is unexpected. Please try generating the original image again and then use the \`/edit\` command with the new message ID.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      // The actual array of images is in originalCacheEntry.data
      const originalImageDataArray = originalCacheEntry.data;

      // Check if the requested index is valid for the array length
      // requestedIndex is 1-based, array index is 0-based
      const zeroBasedIndex = requestedIndex - 1;
      if (zeroBasedIndex < 0 || zeroBasedIndex >= originalImageDataArray.length) {
        finalContent = `${generationStatusContent}\n\n❌ Invalid image index \`${requestedIndex}\` for message ID \`${targetMessageId}\`. Please provide an index between 1 and ${originalImageDataArray.length} for that message.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      // Get the specific image item from the array using the 0-based index
      const sourceImageItem = originalImageDataArray[zeroBasedIndex];

      console.log("Source Image Item retrieved from cache:", sourceImageItem); // Log the retrieved item

      // Check if the item exists and has a valid URL property
      if (!sourceImageItem || typeof sourceImageItem.url !== 'string') {
           finalContent = `${generationStatusContent}\n\n❌ Could not retrieve valid image data (missing URL) for the selected image from the cache for message ID \`${targetMessageId}\` (index #${requestedIndex}). The data might be corrupted.`;
           await interaction.editReply({ content: finalContent });
           queue.shift();
           setImmediate(processQueueDiscord);
           return;
      }

      // Get the URL
      const sourceImageUrl = sourceImageItem.url; // Correctly access the URL property

      console.log("Source Image URL for remix:", sourceImageUrl); // Log the URL being used

      // --- END OF CORRECTED CACHE DATA RETRIEVAL AND VALIDATION ---

      // Generate the remix image using the correctly retrieved sourceImageUrl
      try {
         currentGeneratedImagesWithUrls = await generateRemixImage(interaction, sourceImageUrl, aspectRatio);
         console.log("Generated Remix Images With URLs:", currentGeneratedImagesWithUrls); // Log the remix result
      } catch (remixError) {
         console.error(`Error during generateRemixImage for interaction ${interaction.id}:`, remixError);
         // currentGeneratedImagesWithUrls remains []
      }
    } // End of /edit logic

    // Generate conclusion text (can be done regardless of image generation success)
    try {
       conclusionText = sanitizeText(await generateConclusionText(promptString));
       formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating conclusion text for interaction ${interaction.id}:`, err);
       formattedConclusionText = `*Had trouble generating a concluding thought.*`; // Provide a fallback
    }


    // --- Final Reply Construction ---
    const generatedAttachments = currentGeneratedImagesWithUrls.map(item => item.attachment).filter(att => att instanceof AttachmentBuilder); // Ensure only valid attachments are included
    const actualNumberOfImages = generatedAttachments.length;

    // Build the final content string
    finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`; // Start with embed warning if applicable
    if (formattedIntermediateText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedIntermediateText}`; // Add intermediate text if available
    }

    if (actualNumberOfImages > 0) {
        finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully ${interaction.commandName === 'generate' ? 'generated' : 'remixed'}!`;
    } else {
         // Specific error message if no images were generated
         finalContent += `${finalContent ? '\n\n' : ''}⚠️ Failed to ${interaction.commandName === 'generate' ? 'generate images' : 'remix the image'}. The image service might be temporarily unavailable or returned no valid image data.`;
    }

    if (formattedConclusionText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`; // Add conclusion text if available
    }

    // Add parameters to final content if embeds are missing
    if (missingEmbeds && actualNumberOfImages > 0) { // Only add parameters if images were generated and embeds are missing
        const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
        const theme = interaction.options.getString("theme") || DEFAULT_THEME;
        const enhancement = interaction.options.getBoolean("enhancement") || false;
        const modelUsed = interaction.commandName === 'edit' ? "gptimage" : (interaction.options.getString("model") || DEFAULT_MODEL);
        const seed = interaction.options.getInteger("seed");
        const numberOfImagesRequested = interaction.commandName === 'generate' ? (interaction.options.getInteger("number_of_images") || 1) : 1;


        finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
            `• **Theme**: \`${theme}\`\n` +
            `• **Model**: \`${modelUsed}\`\n` +
            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
            `• **Images**: \`${actualNumberOfImages}${interaction.commandName === 'generate' && numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
            `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`;

        if (interaction.commandName === 'edit') {
          const targetMessageId = interaction.options.getString("original_picture_message_id");
          const requestedIndex = interaction.options.getInteger("img_index_to_edit");
          finalContent += `\n• **Source**: Remixed from image #${requestedIndex} in message ID \`${targetMessageId}\`.`;
        }
    }


    // Build Embed if permissions allow and images were generated
    if (!missingEmbeds && actualNumberOfImages > 0) {
        const prompt = interaction.options.getString("prompt");
        const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
        const theme = interaction.options.getString("theme") || DEFAULT_THEME;
        const enhancement = interaction.options.getBoolean("enhancement") || false;
        const modelUsed = interaction.commandName === 'edit' ? "gptimage" : (interaction.options.getString("model") || DEFAULT_MODEL);
        const seed = interaction.options.getInteger("seed");
        const numberOfImagesRequested = interaction.commandName === 'generate' ? (interaction.options.getInteger("number_of_images") || 1) : 1;


        const embed = new EmbedBuilder()
          .setTitle(interaction.commandName === 'generate' ? '🖼️ Image Generated Successfully' : '🔄 Image Remixed Successfully')
          .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
          .setColor(interaction.commandName === 'generate' ? '#5865F2' : '#E91E63') // Discord colors
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
                `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`,
              inline: false
            }
          )
          .setTimestamp()
          .setFooter({
            // Use the current interaction ID for the footer
            text: `Created by ElixpoArt | Interaction ID: ${interaction.id}`,
            iconURL: client.user.displayAvatarURL()
          });

        if (interaction.commandName === 'edit') {
          const targetMessageId = interaction.options.getString("original_picture_message_id");
          const requestedIndex = interaction.options.getInteger("img_index_to_edit");
          // Attempt to create a message link, fallback if guild/channel ID missing
          const messageLink = interaction.guild?.id && interaction.channel?.id
             ? `[this message](https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${targetMessageId})`
             : `message ID \`${targetMessageId}\``;

          embed.addFields({
            name: 'Source',
            value: `Remixed from image **#${requestedIndex}** in ${messageLink}.`,
            inline: false
          });
        }
         // Set image in embed if only one image was generated
         if (actualNumberOfImages === 1 && generatedAttachments.length > 0) {
             embed.setImage(`attachment://${generatedAttachments[0].name}`); // Use attachment name
         }


        embedsToSend.push(embed);
    }

    // Build Action Row with buttons
    const buttons = [];
    // Add Remix button always if images were generated
    if (actualNumberOfImages > 0) {
        buttons.push(createRemixButton());
    }

    // Add Download buttons if images were generated
    if (actualNumberOfImages === 1) {
        // For single image, use the URL if possible for a Link button
        const firstImageUrl = currentGeneratedImagesWithUrls[0]?.url;
        // Check if the URL is a valid HTTP(S) URL (Pollinations returns URLs)
        const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512; // Discord limit for link button URLs
        const isValidUrl = typeof firstImageUrl === 'string'
            && (firstImageUrl.startsWith('http://') || firstImageUrl.startsWith('https://'))
            && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;

        if (isValidUrl) {
             buttons.push(new ButtonBuilder()
                .setLabel('Download')
                .setStyle(ButtonStyle.Link)
                .setURL(firstImageUrl));
        } else {
            // Fallback to a Primary button if URL is invalid or too long
             buttons.push(createDownloadButton(null, interaction.id, 0)); // Pass null URL, index 0
        }

    } else if (actualNumberOfImages > 1) {
        // For multiple images, add a download button for each
         // Limit to a reasonable number of buttons per row/message if needed, Discord has limits
         const maxButtonsPerMessage = 25; // Discord limit
         for (let i = 0; i < Math.min(actualNumberOfImages, maxButtonsPerMessage - (buttons.length)); i++) { // Subtract buttons already added (like remix)
             buttons.push(createDownloadButton(null, interaction.id, i)); // Pass null URL, pass index i
         }
    }

    // Only build action row if there are buttons
    const actionRow = buttons.length > 0 ? buildActionRow(buttons) : null;
    const components = actionRow ? [actionRow] : [];


    // Cache images for download buttons (only if images were actually generated)
    // Cache the *local* variable containing the { attachment, url } objects
    if (currentGeneratedImagesWithUrls.length > 0) {
        setCache(interaction.id, { // Cache using the current interaction ID
          data: currentGeneratedImagesWithUrls, // Store the array
          timestamp: Date.now()
        });
        console.log(`Stored ${currentGeneratedImagesWithUrls.length} images in cache for interaction ${interaction.id} (Type: ${interaction.commandName}).`);
    } else {
        console.log(`No images generated for interaction ${interaction.id}. Nothing to cache.`);
         // If no images were generated, delete any potential partial cache entry for this ID
         deleteCache(interaction.id); // Clean up if generation failed
    }

    // Final editReply options
    const finalEditOptions = {
      content: finalContent,
      files: generatedAttachments, // Attachments from the local array
      components: components, // Action row component(s)
      embeds: embedsToSend.length > 0 ? embedsToSend : [], // Embeds if available and permitted
    };

    // Check interaction validity one last time before sending final reply
     if (!interaction.replied && !interaction.deferred && !interaction.isFromMessage()) {
        console.warn(`Interaction ${interaction.id} became invalid before sending final reply. Skipping.`);
     } else {
        // Use editReply as the interaction was deferred
        await interaction.editReply(finalEditOptions);
     }


  } catch (error) {
    // --- Catch Block for Errors During Processing ---
    console.error(`Error processing interaction ${interaction.id} (Type: ${interaction.commandName}):`, error);

    // Attempt to send an error message back to the user
    try {
      // Use the initial status content or generation status content if available, otherwise start fresh
      let errorContent = generationStatusContent || initialStatusContent || '';

      // Add a generic error message
      errorContent += `${errorContent ? '\n\n' : ''}⚠️ An unexpected error occurred while processing your request. Please try again later.`;

      // Add conclusion text if it was successfully generated before the error
      if (formattedConclusionText) {
        errorContent += `${errorContent ? '\n\n' : ''}${formattedConclusionText}`;
      }

      // Check interaction validity before sending error reply
      if (!interaction.replied && !interaction.deferred && !interaction.isFromMessage()) {
        console.warn(`Interaction ${interaction.id} became invalid during error handling. Cannot send error reply.`);
      } else {
         // Use editReply if deferred, otherwise attempt a reply (less likely)
         if (interaction.deferred) {
              await interaction.editReply({ content: errorContent });
         } else {
              await interaction.reply({ content: errorContent, ephemeral: true }); // Fallback reply
         }
      }

    } catch (editError) {
      console.error(`Failed to edit/send error reply for interaction ${interaction.id} during main error handling:`, editError);
    }

  } finally {
    // --- Finally Block: Clean up Queue and Process Next Item ---
    // Only shift if the interaction currently being processed is still at the front
    if (queue.length > 0 && queue[0].id === interaction.id) {
      queue.shift();
    } else {
      // This case suggests an issue where the queue head changed unexpectedly.
      // Log a warning and clear the current head to avoid potential infinite loops or processing wrong items.
      console.warn(`Queue head does not match the interaction that just finished processing (${interaction.id}). Expected queue head: ${queue.length > 0 ? queue[0].id : 'empty'}. Clearing queue head.`);
      if (queue.length > 0) {
           queue.shift(); // Force remove the head
      }
    }

    // Reset processing flag
    isProcessing = false;

    // Process the next item in the queue after a short delay
    // Use setImmediate or process.nextTick to yield the event loop
    if (queue.length > 0) {
         console.log(`Queue size after shift: ${queue.length}. Processing next item.`);
         process.nextTick(processQueueDiscord);
         // setImmediate(processQueueDiscord); // Also a valid choice
    } else {
        console.log("Queue empty. Stopping processing.");
    }
  }
}

function addToQueue(interaction) {
  queue.push(interaction);
  console.log(`Added interaction ${interaction.id} (Type: ${interaction.commandName}) to queue. Queue size: ${queue.length}`);
  if (!isProcessing) {
    console.log("Queue is not processing, starting processQueueDiscord.");
    // Use process.nextTick or setImmediate to ensure the current event loop
    // finishes before processing the queue, preventing blocking.
    process.nextTick(processQueueDiscord);
    // setImmediate(processQueueDiscord); // setImmediate also works well here
  } else {
    console.log("Queue is already processing.");
  }
}


// --- Bot Login and Error Handling ---
if (!DISCORD_TOKEN) {
    console.error("FATAL ERROR: Discord bot token not found in environment variables (DISCORD_TOKEN).");
    process.exit(1); // Exit if token is missing
}
if (!POLLINATIONS_TOKEN) {
     console.warn("Pollinations API token not found in environment variables (POLLINATIONS_TOKEN). Using default 'fEWo70t94146ZYgk'.");
}


// Add event listener for unhandled promise rejections to catch potential issues
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
    // Optionally, handle specific types of errors or log more details
    // process.exit(1); // Consider exiting on critical unhandled rejections
});

// Add event listener for uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Perform any necessary cleanup (e.g., close database connections)
    // process.exit(1); // Exit on uncaught exceptions as application state is unreliable
});


client.login(DISCORD_TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1);
});