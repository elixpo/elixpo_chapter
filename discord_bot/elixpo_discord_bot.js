import { client, PERMISSIONS, getPermissionName } from './bot.js';
import { DISCORD_TOKEN, POLLINATIONS_TOKEN, CACHE_DURATION, DEFAULT_ASPECT_RATIO, DEFAULT_MODEL, DEFAULT_THEME, TEST_GUILD_ID } from './config.js';
import { setCache, getCache, deleteCache, cleanupCache, imageCache } from './cache.js';
// Import command handlers - these will now contain the bulk of the command logic after deferral
import { handleGenerate } from './commands/generate.js';
import { handleEdit } from './commands/edit.js';
import { handlePing } from './commands/ping.js';
import { handleHelp } from './commands/help.js';
import { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

let queue = [];
let isProcessing = false;

// Schedule cache cleanup
setInterval(cleanupCache, 10 * 60 * 1000);
console.log("Cache cleanup scheduled.");

// --- Interaction Listener ---
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
    if (interaction.user.bot) return; // Ignore bot commands

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

    // Handle help and ping directly (permissions checked within handlers)
    if (interaction.commandName === 'help') {
        await handleHelp(interaction); // Handle permissions inside handleHelp
        return;
    }
    if (interaction.commandName === 'ping') {
        await handlePing(interaction); // Handle permissions inside handlePing
        return;
    }

    // For generate and edit, check permissions, defer reply and add to queue
    if (interaction.commandName === 'generate' || interaction.commandName === 'edit') {
      // Check specific permissions required for generate/edit commands
      const requiredCommandFlags = [
          PERMISSIONS.ViewChannel,
          PERMISSIONS.SendMessages,
          PERMISSIONS.AttachFiles,
          PERMISSIONS.UseExternalEmojis, // Often useful for embeds/reactions
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

      // Store missing embed permission for later check inside command handlers
      interaction._missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);

      // Defer the reply immediately as image generation takes time
      try {
        await interaction.deferReply({ ephemeral: false });
      } catch (e) {
        console.error("Failed to defer reply:", e);
        // Attempt a basic reply if defer fails, though deferral is preferred
        try {
             // Check if a reply has already been sent (e.g. permission error)
             if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({
                     content: `An error occurred while preparing your request. Please try again later. (Failed to defer reply)`,
                     ephemeral: true
                 });
             }
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

    // --- Handle Edit Button (Instructions Only) ---
    if (customId === 'edit_image') {
      // This button doesn't perform the edit directly, it instructs the user
      try {
        // Acknowledge the button interaction immediately
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate(); // Use deferUpdate for buttons that don't send a new reply
        } else if (interaction.deferred) {
            // If somehow already deferred, followUp ephemerally
            await interaction.followUp({ content: "Please use the `/edit` command.", ephemeral: true });
            return; // Avoid double reply if followUp succeeds
        }

        const channel = interaction.channel;
        const botMember = interaction.guild?.members.me;
        // Ensure bot can send messages before replying instructions
        if (channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages)) {
            await interaction.followUp({
              content: "To edit an image, use the `/edit` command and provide the Message ID and Image **index** (e.g., `1` for the first image) from the original message as options.",
              ephemeral: true // Make the reply visible only to the user who clicked
            });
        } else {
            console.warn(`Cannot reply to edit button interaction due to missing SendMessages permission in channel ${interaction.channel?.id}`);
            // No user feedback if bot can't send messages
        }
      } catch (e) {
        console.error("Error handling edit button interaction:", e);
      }
      return;
    }

    // --- Handle Download Buttons ---
    if (customId.startsWith('download_')) {
      // Acknowledge the button interaction first to prevent "This interaction failed"
      try {
          if (!interaction.replied && !interaction.deferred) {
              await interaction.deferReply({ ephemeral: true }); // Defer ephemerally as this is a personal download link/file
          }
      } catch (e) {
          console.error("Failed to deferReply for download button:", e);
          // If defer fails, attempt a regular ephemeral reply later
      }

      const channel = interaction.channel;
      const botMember = interaction.guild?.members.me;

      // Check essential permissions needed to send the file
      const requiredDownloadFlags = [PERMISSIONS.ViewChannel, PERMISSIONS.SendMessages, PERMISSIONS.AttachFiles];
      const missingDownload = requiredDownloadFlags.filter(flag => !botMember?.permissionsIn(channel).has(flag));

      if (missingDownload.length > 0) {
        const permissionNames = missingDownload.map(getPermissionName).join(', ');
        try {
          // Use editReply or followUp based on whether deferReply was successful
          if (interaction.replied || interaction.deferred) {
             await interaction.editReply({
               content: `I do not have the necessary permissions (**${permissionNames}**) in this channel to provide the image file for download.`,
             });
          } else {
             await interaction.reply({ // Fallback if defer failed
               content: `I do not have the necessary permissions (**${permissionNames}**) in this channel to provide the image file for download.`,
               ephemeral: true
             });
          }
        } catch (e) { console.error("Error sending fallback permission error for download button:", e); }
        return; // Stop processing
      }

      const parts = customId.split('_');
      // Expected format: 'download_INTERACTION_ID_INDEX'
      if (parts.length !== 3 || parts[0] !== 'download' || !/^\d+$/.test(parts[1]) || isNaN(parseInt(parts[2], 10))) {
        try {
           if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: "Could not process the download request due to an invalid button ID format.",
                });
           } else { // Fallback
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

      // Retrieve data from cache using the original interaction ID
      const cacheEntry = getCache(originalInteractionId);

      // Check if cache entry exists and has the expected data array
      if (!cacheEntry || !cacheEntry.data || !Array.isArray(cacheEntry.data)) {
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: "Sorry, the image data for this download button has expired or was not found in the cache, or its format is unexpected. Please try generating or remixing the image again.",
                });
            } else { // Fallback
                await interaction.reply({
                   content: "Sorry, the image data for this download button has expired or was not found in the cache, or its format is unexpected. Please try generating or remixing the image again.",
                   ephemeral: true
               });
            }
        } catch (e) { console.error("Error replying when image data not found:", e); }
        return; // Stop processing
      }

      const cachedImages = cacheEntry.data; // Get the array of images { attachment, url }

      // Check if the index is valid for the array length
      if (imageIndex < 0 || imageIndex >= cachedImages.length) {
         try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                     content: `Sorry, the image index (#${imageIndex + 1}) for this download button is invalid for the original message.`,
                 });
             } else { // Fallback
                 await interaction.reply({
                    content: `Sorry, the image index (#${imageIndex + 1}) for this download button is invalid for the original message.`,
                    ephemeral: true
                });
             }
         } catch (e) { console.error("Error replying when image index is out of bounds:", e); }
         return; // Stop processing
      }

      const imageItem = cachedImages[imageIndex]; // Get the specific image item { attachment, url }

      // Check if the specific image item has the attachment data required for sending
      if (!imageItem || !(imageItem.attachment instanceof AttachmentBuilder)) {
         try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                     content: `Sorry, the attachment data for image #${imageIndex + 1} from the cache is missing or corrupted.`,
                 });
             } else { // Fallback
                 await interaction.reply({
                   content: `Sorry, the attachment data for image #${imageIndex + 1} from the cache is missing or corrupted.`,
                   ephemeral: true
               });
             }
         } catch (e) { console.error("Error replying when attachment data is missing:", e); }
         return; // Stop processing
      }

      // Prepare the attachment to send
      const attachmentToSend = imageItem.attachment;

      try {
        // Use editReply or followUp based on whether deferReply was successful
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: `Here is image #${imageIndex + 1}:`,
            files: [attachmentToSend],
            ephemeral: true // Ensure the response is ephemeral
          });
        } else {
           // This case should ideally not happen if deferReply succeeded
           await interaction.reply({
             content: `Here is image #${imageIndex + 1}:`,
             files: [attachmentToSend],
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
           } else { // Fallback
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

// --- Queue Processing Logic ---
async function processQueueDiscord() {
  if (queue.length === 0) {
    isProcessing = false;
    // console.log("Queue empty. Stopping processing."); // Too verbose?
    return;
  }

  if (isProcessing) {
      // console.log("Already processing queue."); // Should not happen if addToQueue logic is correct
      return;
  }

  isProcessing = true;
  const interaction = queue[0]; // Get the current interaction from the front of the queue

  try {
    // Check if the interaction is still valid before processing
    // An interaction can become invalid if the bot restarts or the channel/guild is deleted
    // We check if deferral status is still valid. If not, it likely failed already or is too old.
    // isFromMessage() is for context menus on messages, not needed for chat commands here,
    // but keeping the spirit of validity checks. Checking deferred/replied is key.
    if (!interaction.deferred && !interaction.replied) {
         console.warn(`Interaction ${interaction.id} became invalid (not deferred/replied) before processing. Skipping.`);
         // Don't attempt to reply/editReply to an invalid interaction
         queue.shift(); // Remove from queue
         // No need to setImmediate/nextTick here, the finally block will handle the next item
         isProcessing = false; // Reset here since finally is skipped on error or return
         processQueueDiscord(); // Attempt to process next immediately
         return; // Exit this processing instance
    }

    // Dispatch to the appropriate command handler
    if (interaction.commandName === 'generate') {
        console.log(`Processing generate command for interaction ${interaction.id}`);
        // handleGenerate now contains all the logic after deferral
        await handleGenerate(interaction);
    } else if (interaction.commandName === 'edit') {
        console.log(`Processing edit command for interaction ${interaction.id}`);
        // handleEdit now contains all the logic after deferral
        await handleEdit(interaction);
    } else {
         console.warn(`Unknown command in queue: ${interaction.commandName} for interaction ${interaction.id}. Skipping.`);
         // Attempt to notify user if possible (should be deferred)
         try {
             await interaction.editReply({ content: `An internal error occurred: Unknown command \`${interaction.commandName}\` found in queue.` });
         } catch (e) { console.error("Failed to send unknown command error reply:", e); }
         queue.shift(); // Remove unknown command
         isProcessing = false;
         processQueueDiscord();
         return; // Exit this processing instance
    }

  } catch (error) {
    // --- Catch Block for Errors During Processing ---
    // This catches errors *thrown by* handleGenerate or handleEdit,
    // or errors during initial status updates within processQueueDiscord itself.
    console.error(`Error processing interaction ${interaction.id} (Type: ${interaction.commandName}):`, error);

    // Attempt to send a generic error message back to the user via the deferred reply
    try {
        // Check if the interaction is still valid/editable
        if (!interaction.deferred && !interaction.replied) {
             console.warn(`Interaction ${interaction.id} became invalid during error handling. Cannot send error reply.`);
        } else {
             // Use editReply as the interaction was deferred in interactionCreate
             // Provide a simple, safe error message
             await interaction.editReply({
                 content: `⚠️ An unexpected error occurred while processing your request for \`${interaction.commandName}\`. Please try again later. Error details have been logged.`,
                 // You could add more specific details here if available and safe to show users
             });
        }
    } catch (editError) {
      console.error(`Failed to edit reply for interaction ${interaction.id} during main error handling:`, editError);
    }

    // Ensure the queue is advanced even if an error occurred
    if (queue.length > 0 && queue[0] === interaction) {
        queue.shift();
    } else {
        console.warn(`Queue head mismatch during error handling. Expected interaction ${interaction.id}, found ${queue.length > 0 ? queue[0].id : 'none'}. Clearing queue head defensively.`);
        if (queue.length > 0) {
             queue.shift();
        }
    }

    // Reset processing flag and process next item
    isProcessing = false;
    if (queue.length > 0) {
         process.nextTick(processQueueDiscord);
    }


  } finally {
    // --- Finally Block: Clean up Queue and Process Next Item ---
    // This block is reached after the try block finishes *without* throwing
    // or after the catch block finishes handling the error.
    // It should only be responsible for cleaning up the queue and starting the next item
    // IF the try block successfully finished the command handler (which already sent the final reply).
    // If the try block *returned* early due to an error (like message not found in edit.js),
    // the queue advancement is handled within the catch/return path itself.
    // The most reliable way is to check if 'isProcessing' is still true here, and if so, it means
    // the try block completed successfully and we can advance the queue and start the next.
    // If 'isProcessing' was set to false within a catch or early return, this finally block might
    // still run, but it won't incorrectly start a new processing cycle.

    // Check if the item is still at the front of the queue before removing.
    // This handles cases where an error inside the catch block might have delayed things.
    // This final check is a double-check against the logic inside the catch block for safety.
    // A simpler approach is to always remove the head *here* since we entered
    // processQueueDiscord specifically to handle queue[0].
    if (queue.length > 0 && queue[0] === interaction) {
         queue.shift(); // Remove the item that was just processed
    }


    // Reset processing flag
    isProcessing = false; // Redundant if catch/return handles it, but safe here too.

    // Process the next item after yielding the event loop
    if (queue.length > 0) {
         // console.log(`Queue size after shift: ${queue.length}. Processing next item.`);
         process.nextTick(processQueueDiscord);
    } else {
        // console.log("Queue empty. Stopping processing.");
    }
  }
}

// --- Function to Add Interaction to Queue ---
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
    // Consider if a graceful shutdown or exit is needed depending on the error type
});

// Add event listener for uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Log error, perform cleanup, and ideally exit to prevent unpredictable state
    process.exit(1);
});


client.login(DISCORD_TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1); // Exit if login fails
});