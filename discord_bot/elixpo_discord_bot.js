import { client, PERMISSIONS, getPermissionName } from './bot.js';
import { DISCORD_TOKEN, POLLINATIONS_TOKEN, CACHE_DURATION, DEFAULT_ASPECT_RATIO, DEFAULT_MODEL, DEFAULT_THEME, TEST_GUILD_ID } from './config.js';
import { setCache, getCache, deleteCache, cleanupCache, imageCache } from './cache.js';
import { sanitizeText, getSuffixPrompt } from './utils.js';
import { generateImage, generateRemixImage } from './imageService.js';
import { generateIntermediateText, generateConclusionText } from './textService.js';
import { createRemixButton, createDownloadButton, createMultipleDownloadButtons, buildActionRow } from './components.js';
import { handleGenerate } from './commands/generate.js'
import { handleEdit } from './commands/edit.js'
import { handlePing } from './commands/ping.js';
import { handleHelp } from './commands/help.js';
import {EmbedBuilder} from 'discord.js';
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

    // Handle help and ping directly
    if (interaction.commandName === 'help') {
      await handleHelp(interaction);
      return;
    }
    if (interaction.commandName === 'ping') {
      await handlePing(interaction);
      return;
    }

    // For generate and edit, defer reply and add to queue
    if (interaction.commandName === 'generate' || interaction.commandName === 'edit') {
      try {
        await interaction.deferReply({ ephemeral: false });
      } catch (e) {
        console.error("Failed to defer reply:", e);
        return;
      }
      interaction._missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);
      addToQueue(interaction);
      return;
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === 'edit_image') {
      try {
        const channel = interaction.channel;
        const botMember = interaction.guild?.members.me;
        if (channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages)) {
          await interaction.reply({
            content: "To edit an image, use the `/edit` command and provide the Message ID and Image img_index_to_edit as options.",
            ephemeral: true
          });
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
        try {
          await interaction.reply({
            content: "I do not have the necessary permissions (Send Messages, Attach Files) to provide the image file for download.",
            ephemeral: true
          });
        } catch (e) { console.error("Error sending fallback permission error for download button:", e); }
        return;
      }

      const parts = customId.split('_');
      if (parts.length !== 3 || parts[0] !== 'download' || isNaN(parseInt(parts[1], 10)) || isNaN(parseInt(parts[2], 10))) {
        try {
          await interaction.reply({
            content: "Could not process the download request due to an invalid button ID format.",
            ephemeral: true
          });
        } catch (e) { console.error("Error replying to invalid download button:", e); }
        return;
      }

      const originalInteractionId = parts[1];
      const imageIndex = parseInt(parts[2], 10);

      const cacheEntry = getCache(originalInteractionId);

      if (!cacheEntry || !cacheEntry.data || imageIndex < 0 || imageIndex >= cacheEntry.data.length) {
        try {
          await interaction.reply({
            content: "Sorry, the image data for this download button has expired or was not found in the cache. Please try generating the image again.",
            ephemeral: true
          });
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
          await interaction.reply({
            content: `Failed to send image #${imageIndex + 1}. An error occurred.`,
            ephemeral: true
          });
        } catch (e2) { console.error("Error sending fallback error for download button:", e2); }
      }
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

  try {
    // Initial status
    let initialStatusContent = '';
    if (missingEmbeds) {
      initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n`;
    }
    initialStatusContent += interaction.commandName === 'generate'
      ? '✨ Wowza I see.. Your request is on the way!'
      : '🪄 Getting ready to remix your creation!';
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

    let generationStatusContent = initialStatusContent;
    if (formattedIntermediateText) {
      generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${interaction.commandName === 'generate' ? '> 🎨 Painting my canvas!' : '> 🔄 Tweaking Pixels, just a moment!'}`;
    await interaction.editReply(generationStatusContent);

    // Generate images or remix
    if (interaction.commandName === 'generate') {
      generatedImagesWithUrls = await generateImage(interaction);
      console.log(generatedImagesWithUrls)
    } else if (interaction.commandName === 'edit') {
      const targetMessageId = interaction.options.getString("original_picture_message_id");
      const requestedIndex = interaction.options.getInteger("img_index_to_edit");
      const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
      if (!targetMessageId || requestedIndex === null) {
        finalContent = `${initialStatusContent}\n\n❌ Critical Error: Required options (\`original_picture_message_id\`, \`img_index_to_edit\`) were not provided or were invalid. Please ensure the command is used correctly.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }
      let referencedMessage;
      try {
        referencedMessage = await interaction.channel.messages.fetch(targetMessageId);
      } catch (fetchError) {
        finalContent = `${generationStatusContent}\n\n❌ Could not find the message with ID \`${targetMessageId}\`. It might have been deleted, is too old, or I lack permissions (**${getPermissionName(PERMISSIONS.ReadMessageHistory)}**).`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      if (referencedMessage.author.id !== client.user.id || !referencedMessage.embeds || referencedMessage.embeds.length === 0) {
        finalContent = `${generationStatusContent}\n\n❌ The message with ID \`${targetMessageId}\` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      const originalEmbed = referencedMessage.embeds[0];
      const footerText = originalEmbed?.footer?.text;
      const idMatch = footerText?.match(/ID: (\d+)/);
      const originalInteractionId = idMatch ? idMatch[1] : null;

      if (!originalInteractionId) {
        finalContent = `${generationStatusContent}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID \`${targetMessageId}\`. The message format might be outdated or corrupted.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }
      const originalCacheEntry = getCache(originalInteractionId);

      if (!originalCacheEntry || !originalCacheEntry.data) {
        finalContent = `${generationStatusContent}\n\n❌ The data for the original image from message ID \`${targetMessageId}\` has expired from the cache. Please try generating the original image again and then use the \`/edit\` command with the new message ID.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }
      if (requestedIndex < 1 || requestedIndex > originalCacheEntry.data.length) {
        finalContent = `${generationStatusContent}\n\n❌ Invalid image img_index_to_edit \`${requestedIndex}\` for message ID \`${targetMessageId}\`. Please provide an img_index_to_edit between 1 and ${originalCacheEntry.data.length} for that message.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }
      
      const sourceImageItem = originalCacheEntry.data[requestedIndex - 1];
      console.log(sourceImageItem);
      const sourceImageUrl = sourceImageItem.url;

      if (!sourceImageUrl) {
        finalContent = `${generationStatusContent}\n\n❌ Could not retrieve the URL for the selected image from the cache for message ID \`${targetMessageId}\`.`;
        await interaction.editReply({ content: finalContent });
        queue.shift();
        setImmediate(processQueueDiscord);
        return;
      }

      generatedImagesWithUrls = await generateRemixImage(interaction, sourceImageUrl, aspectRatio);
    }

    conclusionText = sanitizeText(await generateConclusionText(promptString));
    formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';

    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment);
    if (generatedAttachments && generatedAttachments.length > 0) {
      const prompt = interaction.options.getString("prompt");
      const numberOfImagesRequested = interaction.commandName === 'generate' ? (interaction.options.getInteger("number_of_images") || 1) : 1;
      const actualNumberOfImages = generatedAttachments.length;
      const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
      const theme = interaction.options.getString("theme") || DEFAULT_THEME;
      const enhancement = interaction.options.getBoolean("enhancement") || false;
      const modelUsed = interaction.commandName === 'edit' ? "gptimage" : (interaction.options.getString("model") || DEFAULT_MODEL);
      const seed = interaction.options.getInteger("seed");

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
                `${seed !== null && interaction.commandName === 'generate' && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`,
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
      const buttons = [createRemixButton()];
      if (actualNumberOfImages === 1) {
          const firstImageUrl = generatedImagesWithUrls[0]?.url;
          buttons.push(createDownloadButton(firstImageUrl, interaction.id));
      } else {
          buttons.push(...createMultipleDownloadButtons(actualNumberOfImages, interaction.id));
      }
      const actionRow = buildActionRow(buttons);
      const hasComponents = buttons.length > 0;
      const needsCaching = generatedImagesWithUrls.length > 0;

      if (needsCaching) {
        setCache(interaction.id, {
          data: generatedImagesWithUrls,
          timestamp: Date.now()
        });
        console.log(`Stored ${generatedImagesWithUrls.length} images in cache for interaction ${interaction.id} (Type: ${interaction.commandName}).`);
      } else {
        console.log(`No images generated for interaction ${interaction.id}. Nothing to cache.`);
      }

      // Final editReply
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
      let errorContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission.\n\n` : ''}` +
        (formattedIntermediateText || '');

      errorContent += `${errorContent ? '\n\n' : ''}⚠️ An unexpected error occurred while processing your request. Please try again later.`;
      if (formattedConclusionText) {
        errorContent += `${errorContent ? '\n\n' : ''}${formattedConclusionText}`;
      }
      if (!interaction.replied && !interaction.deferred) {
        console.warn(`Interaction ${interaction.id} became invalid before sending final error message.`);
      } else {
        await interaction.editReply({ content: errorContent });
      }
    } catch (editError) {
      console.error("Failed to edit reply with error message during main error handling:", editError);
    }

  } finally {
    if (queue.length > 0 && queue[0].id === interaction.id) {
      queue.shift();
    } else {
      console.warn(`Queue head does not match the interaction that just finished processing (${interaction.id}). Queue head: ${queue.length > 0 ? queue[0].id : 'empty'}. This might indicate a logic issue or multiple parallel processing attempts.`);
    }
    setImmediate(processQueueDiscord);
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



if (!DISCORD_TOKEN) {
    console.error("FATAL ERROR: Discord bot token not found in environment variables (TOKEN).");
    process.exit(1); // Exit if token is missing
}
if (!POLLINATIONS_TOKEN) {
     console.warn("Pollinations API token not found in environment variables (POLLINATIONS_TOKEN). Using default 'fEWo70t94146ZYgk'.");
}


// Add event listener for unhandled promise rejections to catch potential issues
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});


client.login(DISCORD_TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1); 
});


