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
// Use node-fetch explicitly as in your test.js, though discord.js might polyfill fetch
// If using Node < 18, you need this explicit import and npm install node-fetch
import fetch from 'node-fetch';

dotenv.config();

let queue = [];
let isProcessing = false;

// Cache structure: Map<interactionId, { data: [{ attachment: AttachmentBuilder, url: string }, ...], timestamp: number }>
const imageCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Cleanup function for the cache
function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of imageCache) {
        if (now - value.timestamp > CACHE_DURATION) {
            console.log(`Cleaning up cache for interaction ${key}`);
            imageCache.delete(key);
        }
    }
}

// Run cache cleanup periodically (e.g., every 10 minutes)
setInterval(cleanupCache, 10 * 60 * 1000);
console.log("Cache cleanup scheduled.");

// --- Define permission flags using their numeric values ---
// Using hardcoded numeric values is the safest way to prevent
// "Invalid bitfield flag or number: undefined" errors like RangeError [BitFieldInvalid].
// These BigInt values are stable representations of the permission flags.
const PERMISSIONS = {
    ViewChannel: 4n,           // Allows viewing channels
    SendMessages: 2048n,       // Allows sending messages
    AttachFiles: 32768n,       // Allows uploading images/files
    EmbedLinks: 16384n,        // Allows sending messages with embeds (for rich image replies)
    ReadMessageHistory: 65536n,// Allows fetching past messages (needed for /edit command to fetch message by ID)
    MessageContent: 4194304n,  // Allows reading message content (privileged intent, useful for reading original prompt/context)
};


const client = new Client({
  intents: ['Guilds', 'GuildMessages', 'MessageContent'], // MessageContent Intent required to read message content if you were to use it
});

client.on('ready', async () => {
  console.log(`${client.user.tag} is online and ready!`);
  client.user.setActivity("Generating Images for You", { type: 4 }); // WATCHING

  const activityInterval = setInterval(() => {
    const activities = [
      { name: "Generating Images for You", type: 4 }, // WATCHING
      { name: "AI Art Creation", type: 0 }, // PLAYING
      { name: "Your Commands", type: 3 }, // LISTENING
    ];
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    client.user.setActivity(randomActivity.name, { type: randomActivity.type });
  }, 10 * 60 * 1000);
});


// --- Command Interaction Handler ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.user.bot) return; // Ignore bots

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

   // Helper function to map numeric flags back to names (uses the PERMISSIONS object keys)
   const getPermissionName = (flagValue) => {
        const name = Object.keys(PERMISSIONS).find(key => PERMISSIONS[key] === flagValue);
        // Fallback to discord.js Flags lookup if somehow not in our object (unlikely now with hardcoded)
        if (!name) {
             const discordjsName = Object.keys(PermissionsBitField.Flags).find(key => PermissionsBitField.Flags[key] === flagValue);
             return discordjsName || 'Unknown Permission';
        }
        return name;
   };


  // Handle simple commands first (/help, /ping)
  if (interaction.commandName === 'help' || interaction.commandName === 'ping') {
    // Essential permissions just to reply to simple commands
    const essentialPermissionsSimple = [
      PERMISSIONS.SendMessages,
      PERMISSIONS.ViewChannel
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
            const helpMessage = `
    **Elixpo Discord Bot Commands:**

  - **\`/generate\`** - Generate images based on a prompt.
    **Options:** \`prompt\` (required), \`theme\`, \`model\`, \`aspect_ratio\`, \`enhancement\`, \`number_of_images\` (1-4), \`seed\`.

  - **\`/edit\`** - Remix or edit an existing image. **Use the \`message_id\` and \`index\` options to specify the image.**
    **Options:** \`message_id\` (required), \`prompt\` (required), \`index\` (1-4, required), \`number_of_images\` (1-4, required), \`seed\`, \`aspect_ratio\`, \`theme\`, \`enhancement\`, \`model\`. Note: \`model\` is fixed to \`gptimage\` for remixing.

  - **\`/help\`** - Display this help message.
  - **\`/ping\`** - Check if the bot is online.
            `;
            try { await interaction.reply({ content: helpMessage, ephemeral: false }); } catch (e) { console.error("Error sending help message:", e); }
        } else if (interaction.commandName === 'ping') {
            try { await interaction.reply({ content: "Yooo! I'm ready to paint xD", ephemeral: false }); } catch (e) { console.error("Error sending ping message:", e); }
        }
        return;
  }


  // Handle commands that need queueing and processing (/generate, /edit)
  if (interaction.commandName === 'generate' || interaction.commandName === 'edit') {

       // --- Fatal Permissions Check (MUST happen before deferring) ---
       // These permissions are absolutely required for the command to function at all.
       const requiredFatalFlags = [
           PERMISSIONS.ViewChannel,
           PERMISSIONS.SendMessages,
           PERMISSIONS.AttachFiles,
       ];
       // /edit requires reading the history to fetch the message by ID
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

       // --- Non-Fatal Permissions Check (for warnings after deferral) ---
       // MessageContent is needed to read the *content* of the referenced message, though your
       // current /edit logic primarily relies on the embed footer ID. Still good to warn.
       let missingEmbeds = !botPermissions.has(PERMISSIONS.EmbedLinks);
       let missingMessageContent = interaction.commandName === 'edit' && !botPermissions.has(PERMISSIONS.MessageContent);


       try {
           await interaction.deferReply({ ephemeral: false });
       } catch (e) {
           console.error("Fatal: Could not defer interaction after permission check:", e);
           return;
       }

       interaction._missingEmbeds = missingEmbeds;
       interaction._missingMessageContent = missingMessageContent;
       addToQueue(interaction);
   }
});

// --- Button Interaction Handler ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    // Handle the Edit button click - Now points to command usage with ID/index
    if (customId === 'edit_image') {
        try {
             if (interaction.channel && interaction.guild?.members.me && interaction.channel.permissionsFor(interaction.guild.members.me)?.has(PERMISSIONS.SendMessages)) {
                // Inform the user to use the /edit command with options
                await interaction.reply({ content: "To edit an image, use the `/edit` command and provide the Message ID and Image Index as options.", ephemeral: true });
             } else {
                console.warn(`Cannot reply to edit button interaction due to missing SendMessages permission in channel ${interaction.channel?.id}`);
             }
        } catch (e) {
            console.error("Error replying to edit button interaction:", e);
        }
        return;
    }

    // Handle Download buttons (using custom IDs for multiple images)
    if (customId.startsWith('download_')) {
        if (!(interaction.channel && interaction.guild?.members.me && interaction.channel.permissionsFor(interaction.guild.members.me)?.has(PERMISSIONS.SendMessages, PERMISSIONS.AttachFiles))) {
             console.warn(`Cannot reply to download button interaction due to missing SendMessages or AttachFiles permission in channel ${interaction.channel?.id}`);
             try {
                 await interaction.reply({ content: "I do not have the necessary permissions (Send Messages, Attach Files) to provide the image file for download.", ephemeral: true });
             } catch (e) { console.error("Error sending fallback permission error for download button:", e); }
             return;
        }

        const parts = customId.split('_');
        // Updated check: parts length should be 3 for download_interactionid_index
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
            console.warn(`Image data not found in cache for interaction ${originalInteractionId} index ${imageIndex}. Cache keys: ${Array.from(imageCache.keys()).join(', ')}`);
            try {
                await interaction.reply({ content: "Sorry, the image data for this download button has expired or was not found in the cache. Please try generating the image again.", ephemeral: true });
            } catch (e) { console.error("Error replying when image data not found:", e); }
            return;
        }

        const imageItem = cacheEntry.data[imageIndex];

        try {
            await interaction.reply({
                content: `Here is image #${imageIndex + 1}:`,
                files: [imageItem.attachment],
                ephemeral: true // Sending files ephemeral is usually better
            });
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

  // Retrieve non-fatal permission flags stored earlier
  const missingEmbeds = interaction._missingEmbeds || false;
  const missingMessageContent = interaction._missingMessageContent || false;

  // --- Declare these variables BEFORE the try block ---
  let intermediateText = '';
  let conclusionText = '';
  let formattedIntermediateText = '';
  let formattedConclusionText = '';
  // --- End variable declaration changes ---

  let generatedImagesWithUrls = [];
  let finalContent = '';
  const embedsToSend = [];
  const actionRow = new ActionRowBuilder();

  try {
    let initialStatusContent = '';
    if (missingEmbeds) {
         initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n`;
    }
     // Note: MessageContent is not strictly required by this /edit flow, but warning is okay
    if (missingMessageContent) {
         initialStatusContent += `⚠️ I am missing the **${getPermissionName(PERMISSIONS.MessageContent)}** permission, which might limit understanding of the original message's content.\n\n`;
    }
     initialStatusContent += interaction.commandName === 'generate' ? '✨ Wowza I see.. Your request is on the way!' : '🪄 Getting ready to remix your creation!';

    await interaction.editReply(initialStatusContent);

    // Prompt is required for both commands per your config
    const promptString = interaction.options.getString("prompt");
    if (!promptString) { // Defensive check, should be guaranteed by command config
        finalContent = `${initialStatusContent}\n\n❌ Critical Error: Prompt option is missing. Please ensure the command is used correctly.`;
        await interaction.editReply({ content: finalContent });
        console.error(`[processQueueDiscord] Prompt option missing for interaction ${interaction.id}`);
        return;
    }

     // --- Generate text and format within the try block ---
     intermediateText = sanitizeText(await generateIntermediateText(promptString));
     conclusionText = sanitizeText(await generateConclusionText(promptString));

     formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
     formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';
     // --- End text generation/formatting ---


    let generationStatusContent = initialStatusContent;
    if (formattedIntermediateText) {
        generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    generationStatusContent += `${generationStatusContent ? '\n\n' : ''}${interaction.commandName === 'generate' ? '🎨 Generating your image(s)...' : '🔄 Remixing your image(s)...'}`;

    await interaction.editReply(generationStatusContent);


    if (interaction.commandName === 'generate') {
       generatedImagesWithUrls = await generateImage(interaction);
    } else if (interaction.commandName === 'edit') {
       // --- Handle /edit logic using Message ID and Index options ---

       // Retrieve the required message_id and index options as defined in your command config
       const targetMessageId = interaction.options.getString("message_id"); // Use "message_id" as per your config
       const requestedIndex = interaction.options.getInteger("index"); // Use "index" as per your config
       const numberOfImages = interaction.options.getInteger("number_of_images"); // Use "number_of_images" as per your config

       // Check if required options are actually present (should be if command is defined correctly)
       // prompt and number_of_images are also required according to your config
       if (!targetMessageId || requestedIndex === null || promptString === null || numberOfImages === null) {
            console.error(`[processQueueDiscord][/edit] Required options missing for interaction ${interaction.id}: message_id=${targetMessageId}, index=${requestedIndex}, prompt=${promptString}, numberOfImages=${numberOfImages}`);
             finalContent = `${initialStatusContent}\n\n❌ Critical Error: Required options (\`message_id\`, \`index\`, \`prompt\`, \`number_of_images\`) were not provided or were invalid. Please ensure the command is used correctly.`;
             await interaction.editReply({ content: finalContent });
             return;
       }

       let referencedMessage;
       try {
            // ReadMessageHistory permission was checked as fatal before queueing
            console.log(`[processQueueDiscord][/edit] Attempting to fetch message with ID: ${targetMessageId} for user ${interaction.user.id}`);
            referencedMessage = await interaction.channel.messages.fetch(targetMessageId);
            console.log(`[processQueueDiscord][/edit] Successfully fetched message ID: ${targetMessageId}`);
       } catch (fetchError) {
            console.error(`Failed to fetch message ID ${targetMessageId} for user ${interaction.user.id}:`, fetchError);
            finalContent = `${initialStatusContent}\n\n❌ Could not find the message with ID \`${targetMessageId}\`. It might have been deleted, is too old, or I lack permissions (**${getPermissionName(PERMISSIONS.ReadMessageHistory)}**).`;
             if (formattedConclusionText) finalContent += `\n\n${formattedConclusionText}`;
            await interaction.editReply({ content: finalContent });
            return;
       }

       // Basic validation of the fetched message
       if (referencedMessage.author.id !== client.user.id || !referencedMessage.embeds || referencedMessage.embeds.length === 0) {
            finalContent = `${initialStatusContent}\n\n❌ The message with ID \`${targetMessageId}\` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages.`;
            if (formattedConclusionText) finalContent += `\n\n${formattedConclusionText}`;
            await interaction.editReply({ content: finalContent });
            console.warn(`/edit provided message ID ${targetMessageId} which is not a bot/image message by user ${interaction.user.id}`);
            return;
       }

       // Try to get the original interaction ID from the footer
       const originalEmbed = referencedMessage.embeds[0];
       const footerText = originalEmbed?.footer?.text;
       // Assuming footer format is "Created by Elixpo AI | ID: <interaction_id>"
       const idMatch = footerText?.match(/ID: (\d+)/);
       const originalInteractionId = idMatch ? idMatch[1] : null;

       if (!originalInteractionId) {
           finalContent = `${initialStatusContent}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID \`${targetMessageId}\`. The message format might be outdated or corrupted.`;
           if (formattedConclusionText) finalContent += `\n\n${formattedConclusionText}`;
           await interaction.editReply({ content: finalContent });
           console.warn(`Could not parse original interaction ID from footer "${footerText}" for user ${interaction.user.id} (message ID: ${targetMessageId})`);
           return;
       }

       // Retrieve the original image data from the cache using the original interaction ID
       const originalCacheEntry = imageCache.get(originalInteractionId);

       if (!originalCacheEntry || !originalCacheEntry.data) {
           finalContent = `${initialStatusContent}\n\n❌ The data for the original image from message ID \`${targetMessageId}\` has expired from the cache. Please try generating the original image again and then use the \`/edit\` command with the new message ID.`;
           if (formattedConclusionText) finalContent += `\n\n${formattedConclusionText}`;
           await interaction.editReply({ content: finalContent });
           console.warn(`Original cache data not found for interaction ${originalInteractionId} (via message ID ${targetMessageId}). User ${interaction.user.id} requested edit.`);
           return;
       }

       // Validate the index against the available images in the cache
       if (requestedIndex < 1 || requestedIndex > originalCacheEntry.data.length) {
            finalContent = `${initialStatusContent}\n\n❌ Invalid image index \`${requestedIndex}\` for message ID \`${targetMessageId}\`. Please provide an index between 1 and ${originalCacheEntry.data.length} for that message.`;
            if (formattedConclusionText) finalContent += `\n\n${formattedConclusionText}`;
            await interaction.editReply({ content: finalContent });
            console.warn(`Invalid image index ${requestedIndex} provided by user ${interaction.user.id} for message ID ${targetMessageId}. Max index was ${originalCacheEntry.data.length}`);
            return;
       }

       const sourceImageItem = originalCacheEntry.data[requestedIndex - 1]; // Get the object for the specific image (0-indexed)
       const sourceImageUrl = sourceImageItem.url; // Get the URL of the image from the cache

       // We need to ensure the sourceImageUrl used in the Pollinations API call
       // is just the base URL and prompt, without any extra parameters that might
       // have been added after the initial generation (like the token/referrer in the cached URL).
       // Let's try to reconstruct the base URL or clean the cached one.
       // A simple way might be to just take the part before the first '&', but this is fragile.
       // A slightly better way is using URL object or regex if the format is consistent.
       // Based on the test.js structure, the base image URL for remixing is usually just
       // https://image.pollinations.ai/prompt/encoded_prompt - but this is not what's in your cache (it's the full generated URL).
       // Let's stick to cleaning the cached URL assuming it's a base + params string.
       // Removing specific known params seems the safest approach given the cached format.
       // The test.js `generateImageURL` takes a prompt and optionally an image URL.
       // This implies the API expects the *source image URL* itself as the `image` parameter.
       // So we should pass the `sourceImageUrl` from the cache directly as the `image` parameter.
       // The only cleaning needed might be if the URL somehow got corrupted, but let's assume it's fine.

       if (!sourceImageUrl) {
            finalContent = `${initialStatusContent}\n\n❌ Could not retrieve the URL for the selected image from the cache for message ID \`${targetMessageId}\`.`;
            if (formattedConclusionText) finalContent += `\n\n${formattedConclusionText}`;
            await interaction.editReply({ content: finalContent });
            console.warn(`Could not get URL for image ${requestedIndex} from cache for interaction ${originalInteractionId} (via message ID ${targetMessageId}).`);
            return;
       }

       console.log(`User ${interaction.user.tag} is editing image ${requestedIndex} from message ID ${targetMessageId} (original interaction ${originalInteractionId}) using source URL: ${sourceImageUrl}`);

       // Generate the new image(s) using the remix function, passing the cleaned source URL
       generatedImagesWithUrls = await generateRemixImage(interaction, sourceImageUrl); // Pass the URL fetched from cache
       // --- End /edit logic ---
    }

    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment);

    // --- Send the final reply with images, embed, text, and buttons ---
    if (generatedAttachments && generatedAttachments.length > 0) {
       const prompt = interaction.options.getString("prompt"); // Prompt is required for both commands
       const numberOfImagesRequested = interaction.options.getInteger("number_of_images") || 1; // Default to 1 if somehow missing, but config says required
       const actualNumberOfImages = generatedAttachments.length;
       const aspectRatio = interaction.options.getString("aspect_ratio") || "3:2";
       const theme = interaction.options.getString("theme") || "normal";
       const enhancement = interaction.options.getBoolean("enhancement") || false;
       const seed = interaction.options.getInteger("seed"); // Seed is optional
       // Model for remix is always gptimage regardless of the 'model' option provided by the user
       const modelUsed = interaction.commandName === 'edit' ? "gptimage" : (interaction.options.getString("model") || "flux");


       // Construct the final content string
       finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}` +
                      `${missingMessageContent ? `⚠️ Missing **${getPermissionName(PERMISSIONS.MessageContent)}** permission.\n\n` : ''}` +
                      (formattedIntermediateText || '');

       if (interaction.commandName === 'generate') {
            finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully generated!`;
       } else if (interaction.commandName === 'edit') {
            finalContent += `${finalContent ? '\n\n' : ''}✨ Your image(s) have been successfully remixed!`;
       }

       if (formattedConclusionText) {
           finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`;
       }


       // Build the enhanced embed *only if* EmbedLinks permission is present
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
                    `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                    `${seed !== null ? `\n• **Seed**: \`${seed}\`` : ''}`,
                  inline: false
                }
              )
              .setTimestamp()
              .setFooter({
                text: `Created by Elixpo AI | ID: ${interaction.id}`, // IMPORTANT: Add the current interaction ID here
                iconURL: client.user.displayAvatarURL()
              });

            // For /edit, add a field showing the source using the options
            if (interaction.commandName === 'edit') {
                 const targetMessageId = interaction.options.getString("message_id");
                 const requestedIndex = interaction.options.getInteger("index");
                 const targetMessageLink = `[this message](https://discord.com/channels/${interaction.guild?.id || '@me'}/${interaction.channel?.id || 'unknown'}/${targetMessageId})`;
                 embed.addFields({
                     name: 'Source',
                     value: `Remixed from image **#${requestedIndex}** in ${targetMessageLink} (ID: \`${targetMessageId}\`).`,
                     inline: false
                 });
            }

           embedsToSend.push(embed);
       } else {
            // If EmbedLinks is missing, add parameters to content instead
            finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
                            `• **Theme**: \`${theme}\`\n` +
                            `• **Model**: \`${modelUsed}\`\n` +
                            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
                            `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                            `${seed !== null ? `\n• **Seed**: \`${seed}\`` : ''}`;

            if (interaction.commandName === 'edit') {
                 const targetMessageId = interaction.options.getString("message_id");
                 const requestedIndex = interaction.options.getInteger("index");
                 finalContent += `\n• **Source**: Remixed from image #${requestedIndex} in message ID \`${targetMessageId}\`.`;
            }
       }


       // --- Add Buttons ---
       // Add Edit button (always exists)
       const editButton = new ButtonBuilder()
           .setLabel('Edit / Remix') // Updated label
           .setStyle(ButtonStyle.Secondary)
           .setCustomId('edit_image'); // Custom ID needed for interaction handling
       actionRow.addComponents(editButton);

       // Add Download buttons based on the number of images generated *in this response*
       if (actualNumberOfImages === 1) {
            const firstImageUrl = generatedImagesWithUrls[0]?.url;
            // --- FIX: Check URL length before using Link button ---
            const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512; // Discord limit
            if (firstImageUrl && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH) {
               // Use Link style button if it's a single image and URL is short enough
               const downloadButton = new ButtonBuilder()
                   .setLabel('Download')
                   .setStyle(ButtonStyle.Link)
                   .setURL(firstImageUrl);
               actionRow.addComponents(downloadButton);
               console.log(`[processQueueDiscord] Added Link button for single image (URL length: ${firstImageUrl.length}).`);
            } else {
                // Fallback to custom ID button if URL is too long or not available
                 console.log(`[processQueueDiscord] URL too long (${firstImageUrl?.length || 'N/A'} > ${DISCORD_LINK_BUTTON_MAX_URL_LENGTH}) or unavailable for single image. Using Primary button with Custom ID.`);
                 const downloadButton = new ButtonBuilder()
                    .setLabel('Download')
                    .setStyle(ButtonStyle.Primary)
                    .setCustomId(`download_${interaction.id}_0`); // Use interaction.id and index 0
                 actionRow.addComponents(downloadButton);
            }
             // --- End FIX ---

       } else { // Multiple images require custom download buttons (already uses Primary style)
            for (let i = 0; i < actualNumberOfImages; i++) {
                const downloadButton = new ButtonBuilder()
                    .setLabel(`Download #${i + 1}`)
                    .setStyle(ButtonStyle.Primary)
                    .setCustomId(`download_${interaction.id}_${i}`); // Use interaction.id and current index
                 actionRow.addComponents(downloadButton);
            }
             console.log(`[processQueueDiscord] Added ${actualNumberOfImages} Primary buttons for multiple images.`);
       }
       // --- End Buttons ---

       const hasComponents = actionRow.components.length > 0;

       // Cache if any images were generated. This is necessary for download buttons on the *new* message
       // and potentially for editing the result of this edit.
       const needsCaching = generatedImagesWithUrls.length > 0;

       if (needsCaching) {
               // Only cache if we generated *any* images
               // Cache includes the generated attachments and their URLs
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
                          `${missingMessageContent ? `⚠️ Missing **${getPermissionName(PERMISSIONS.MessageContent)}** permission.\n\n` : ''}` +
                          (formattedIntermediateText || ''); // formattedIntermediateText is now accessible

       if (interaction.commandName === 'generate') {
            errorContent += `${errorContent ? '\n\n' : ''}⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data.`;
       } else if (interaction.commandName === 'edit') {
             errorContent += `${errorContent ? '\n\n' : ''}⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data.`;
       }
       errorContent += ` Please try again later.`;

        if (formattedConclusionText) { // formattedConclusionText is now accessible
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
       //formattedIntermediateText and formattedConclusionText are now in scope here
       let errorContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission.\n\n` : ''}` +
                          `${missingMessageContent ? `⚠️ Missing **${getPermissionName(PERMISSIONS.MessageContent)}** permission.\n\n` : ''}` +
                          (formattedIntermediateText || ''); // Use the potentially empty string

        errorContent += `${errorContent ? '\n\n' : ''}⚠️ An unexpected error occurred while processing your request. Please try again later.`;
        if (formattedConclusionText) { // Use the potentially empty string
           errorContent += `${errorContent ? '\n\n' : ''}${formattedConclusionText}`;
        }
       await interaction.editReply({ content: errorContent });
    } catch (editError) {
       console.error("Failed to edit reply with error message:", editError);
    }

  } finally {
    queue.shift();
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
    // Remove extra asterisks/underscores that aren't part of valid markdown pairs
    // simplified regex to be less aggressive but still clean common issues
    sanitized = sanitized.replace(/([^\s\*\_])\*\*/g, '$1').replace(/\*\*([^\s\*\_])/g, '$1'); // ** not paired correctly
    sanitized = sanitized.replace(/([^\s\*\_])\*/g, '$1').replace(/\*([^\s\*\_])/g, '$1');   // * not paired correctly
    sanitized = sanitized.replace(/([^\s\*\_])__/g, '$1').replace(/__([^\s\*\_])/g, '$1'); // __ not paired correctly
    sanitized = sanitized.replace(/([^\s\*\_])_/g, '$1').replace(/_([^\s\*\_])/g, '$1');   // _ not paired correctly
    sanitized = sanitized.replace(/([^\s\*\_])~~/g, '$1').replace(/~~([^\s\*\_])/g, '$1');   // ~~ not paired correctly


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
    model: "evil",
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
    seed: 23, // Keep seed 23 for consistent text generation? Or use a different one?
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
      return 'Summoning the creative spirits...';
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : 'Wooglie Boogliee.. Something is cooking!!';

  } catch (error) {
    console.error('Network or parsing error generating intermediate text:', error);
    return 'The AI generators are whirring...';
  }
}

async function generateConclusionText(promptContent) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil",
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
    seed: 23, // Keep seed 23 for consistent text generation?
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
      return null;
    }

    const textResult = await response.json();
    return textResult.choices && textResult.choices[0] && textResult.choices[0].message && textResult.choices[0].message.content
           ? textResult.choices[0].message.content
           : 'Behold the creation!';
  } catch (error) {
    console.error('Network or parsing error generating conclusion text:', error);
    return null;
  }
}


// Modified to return objects containing { attachment, url }
async function generateImage(interaction) {
  const prompt = interaction.options.getString("prompt");
  const numberOfImages = interaction.options.getInteger("number_of_images") || 1; // Default if not provided, but check your command config
  const aspectRatio = interaction.options.getString("aspect_ratio") || "3:2";
  const theme = interaction.options.getString("theme") || "normal";
  const enhancement = interaction.options.getBoolean("enhancement") || false;
  const model = interaction.options.getString("model") || "flux"; // Default model for generate is flux
  const userProvidedSeed = interaction.options.getInteger("seed");
  const baseSeed = userProvidedSeed !== null ? userProvidedSeed : Math.floor(Math.random() * 10000000) + 1000;

  let width = 1024, height = 683;

  const numImagesToGenerate = Math.max(1, Math.min(4, numberOfImages));

  switch (aspectRatio) {
    case '16:9': width = 1024; height = 576; break;
    case '9:16': width = 576; height = 1024; break;
    case '1:1': width = height = 1024; break;
    case '4:3': width = 1024; height = 768; break;
    case '3:2': width = 1024; height = 683; break;
    default:
      width = 1024; height = 683; break;
  }

  const suffixPrompt = getSuffixPrompt(theme);
  const encodedPrompt = `${prompt.trim()} ${suffixPrompt}`.trim();

  const imagesWithUrls = [];
  const errors = [];

  for (let i = 0; i < numImagesToGenerate; i++) {
    // Use the base seed + index for multiple images if no specific seed was provided
    // If a specific seed was provided, all images use that *same* seed.
    const currentSeed = userProvidedSeed !== null ? baseSeed : baseSeed + i;

    // Construct the URL for standard generation
    // Use URLSearchParams for cleaner parameter handling
    const baseURL = "https://image.pollinations.ai/prompt/";
    const promptParam = encodeURIComponent(encodedPrompt);
    const queryParams = new URLSearchParams({
        width: width.toString(),
        height: height.toString(),
        // CONSIDER: Use currentSeed instead of hardcoded 23 here?
        seed: '23', // Keeping hardcoded 23 as in original generateImage
        model: model, // Use the selected model
        enhance: enhancement.toString(),
        nologo: 'true',
        referrer: 'elixpoart', // Use the bot's referrer
        token: process.env.POLLINATIONS_TOKEN || 'elixpoart', // Use environment variable for token, fallback to elixpoart
        // No 'image' parameter for standard generation
    });

    const imgurl = `${baseURL}${promptParam}?${queryParams.toString()}`;


    try {
      console.log(`[Generate] Fetching image ${i + 1}/${numImagesToGenerate} from: ${imgurl}`);
      const response = await fetch(imgurl, { method: 'GET' });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Generate] Error fetching image ${i + 1}: ${response.status} ${response.statusText}`, errorText);
        errors.push(`Image ${i + 1} failed to generate.`);
        continue;
      }

      const buffer = await response.buffer(); // Use buffer() like in test.js

      if (buffer.length > 100) { // Basic check for minimal data size
         const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_image_${i + 1}.jpg` });
         imagesWithUrls.push({ attachment: attachment, url: imgurl }); // Store both attachment and URL
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


// New function for remixing/editing images, updated based on test.js URL format
async function generateRemixImage(interaction, sourceImageUrl) {
  const prompt = interaction.options.getString("prompt");
  const numberOfImages = interaction.options.getInteger("number_of_images") || 1;
  const numImagesToGenerate = Math.max(1, Math.min(4, numberOfImages));

  const imagesWithUrls = [];
  const errors = [];

  for (let i = 0; i < numImagesToGenerate; i++) {
      // Simplify URL construction to match test.js
      const baseURL = "https://image.pollinations.ai/prompt/";
      const promptParam = encodeURIComponent(prompt.trim());

      // Use the exact same parameters as test.js
      const queryParams = new URLSearchParams({
          model: 'gptimage',
          token: 'mirexa',
          private: 'true',
          nologo: 'true'
      });

      // Add source image URL last, exactly as test.js does
      let imgurl = `${baseURL}${promptParam}?${queryParams.toString()}`;
      if (sourceImageUrl) {
          imgurl += `&image=${encodeURIComponent(sourceImageUrl)}`;
      }

      try {
          console.log(`[Remix] Fetching image ${i + 1}/${numImagesToGenerate} from: ${imgurl}`);
          const response = await fetch(imgurl, { method: 'GET' });

          if (!response.ok) {
              const errorText = await response.text();
              console.error(`[Remix] Error fetching image ${i + 1}: ${response.status} ${response.statusText}`, errorText);
              errors.push(`Remixed Image ${i + 1} failed to generate.`);
              continue;
          }

          const buffer = await response.buffer();

          if (buffer.length > 100) {
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
    default: return "artistic style";
  }
}

if (!process.env.TOKEN) {
    console.error("FATAL ERROR: Discord bot token not found in environment variables (TOKEN).");
    process.exit(1); // Exit if token is missing
}
if (!process.env.POLLINATIONS_TOKEN) {
     console.warn("Pollinations API token not found in environment variables (POLLINATIONS_TOKEN). Using default 'elixpoart'.");
}



client.login(process.env.TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1); // Exit if login fails
});