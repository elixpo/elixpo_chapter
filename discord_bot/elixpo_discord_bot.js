import {
  Client,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

let queue = [];
let isProcessing = false;

// Cache to store image data for buttons
// Key: original interaction ID
// Value: { data: generatedImagesWithUrls array, timestamp: Date.now() }
const imageCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

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


const client = new Client({
  intents: ['Guilds', 'GuildMessages'], // Added InteractionCreate explicit intent for buttons
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
  // Handle only slash commands here
  if (!interaction.isChatInputCommand()) return;

  if (interaction.user.bot) return; // Ignore bots

  const botMember = interaction.guild.members.me;
  const channel = interaction.channel;

  // Permissions check
  if (channel) {
    const botPermissions = channel.permissionsFor(botMember);

    if (!botPermissions.has('SendMessages')) {
      try {
        await interaction.reply({
          content: `
          ⚠️ I am missing the **Send Messages** permission in this channel. Please ensure that I have the "Send Messages" permission by following these steps:
          1. Go to the server settings.
          2. Under **Roles**, select the role for the bot or manually assign the permission.
          3. Ensure that **Send Messages** is enabled for this channel.`,
          ephemeral: true
        });
      } catch (e) {
        console.error("Error sending permission error message (SendMessages missing):", e);
      }
      return;
    }

    // Defer reply for /generate command after checking permissions
    if (interaction.commandName === 'generate') {
       if (!botPermissions.has('EmbedLinks')) {
          try {
            await interaction.reply({
              content: `
              ⚠️ I am missing the **Embed Links** permission in this channel. I will try to send the images as files, but the rich embed won't display. To allow me to send rich embeds with command details, please follow these steps:
              1. Go to the channel settings.
              2. Under **Permissions**, ensure that the bot has the **Embed Links** permission enabled.`,
               ephemeral: true
            });
            await interaction.deferReply({ ephemeral: false });
          } catch (e) {
             console.error("Error sending embed permission warning:", e);
              try {
                await interaction.deferReply({ ephemeral: false });
              } catch (deferError) {
                 console.error("Fatal: Could not defer interaction after embed warning failed:", deferError);
                 return;
              }
          }
       } else {
          try {
            await interaction.deferReply({ ephemeral: false });
          } catch (e) {
            console.error("Fatal: Could not defer interaction:", e);
            return;
          }
       }
    }
  } else {
      console.warn(`Interaction occurred in a null channel. Interaction ID: ${interaction.id}`);
      try {
          await interaction.reply({ content: "Could not determine the channel for this interaction.", ephemeral: true });
      } catch (e) {
          console.error("Error sending error message for null channel:", e);
      }
      return;
  }

  // Handle commands (only /generate needs queuing and special handling)
  if (interaction.commandName === 'generate') {
    addToQueue(interaction); // Deferral handled above
  } else if (interaction.commandName === 'help') {
    const helpMessage = `
    **Elixpo Discord Bot Commands:**

  - **\`/generate\`** - Generate images based on a prompt.

    **Options:**
    - **Prompt:** The description of the image you want to generate (required).
    - **Theme:** Choose from \`normal\`, \`fantasy\`, \`halloween\`, \`space\`, \`chromatic\`, \`anime\`, \`samurai\`, \`crayon\`, \`cyberpunk\`, \`landscape\`, \`wpap\`, \`vintage\`, \`pixel\`, \`synthwave\`. (Optional, default \`normal\`)
    - **Model:** Choose from \`flux-core\`, \`turbo\`, \`gptimage\`. (Optional, default \`flux-core\`)
    - **Aspect Ratio:** Choose from \`16:9\`, \`9:16\`, \`1:1\`, \`4:3\`, \`3:2\`. (Optional, default \`3:2\`)
    - **Enhancement:** \`true\` or \`false\` to enhance the image. (Optional, default \`false\`)
    - **Number of Images:** Specify how many images to generate (default is 1, max is 4). (Optional, default \`1\`)
    - **Seed:** Specify a seed number for reproducible results. (Optional)

  - **\`/help\`** - Display this help message.
  - **\`/ping\`** - Check if the bot is online.
    `;
    try {
      // No deferral needed for simple replies like help/ping
      await interaction.reply({ content: helpMessage, ephemeral: false });
    } catch (e) {
       console.error("Error sending help message:", e);
    }
  } else if (interaction.commandName === 'ping') {
    try {
      // No deferral needed
      await interaction.reply({ content: "Yooo! I'm ready to paint xD", ephemeral: false });
    } catch (e) {
       console.error("Error sending ping message:", e);
    }
  }
});

// --- Button Interaction Handler ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    // Handle the Edit button click
    if (customId === 'edit_image') {
        try {
            // Reply ephemerally (only visible to the user who clicked)
            await interaction.reply({ content: "The 'Edit' function is not yet implemented. Stay tuned!", ephemeral: true });
        } catch (e) {
            console.error("Error replying to edit button interaction:", e);
        }
        return; // Stop processing this button interaction
    }

    // Handle Download buttons (using custom IDs for multiple images)
    if (customId.startsWith('download_')) {
        // Parse the original interaction ID and image index from the customId
        const parts = customId.split('_'); // Expected format: ['download', 'originalInteractionId', 'imageIndex']
        if (parts.length !== 3 || parts[0] !== 'download') {
            console.error(`Invalid download button customId format: ${customId}`);
            try {
                 await interaction.reply({ content: "Could not process the download request due to an invalid button ID.", ephemeral: true });
            } catch (e) { console.error("Error replying to invalid download button:", e); }
            return;
        }

        const originalInteractionId = parts[1];
        const imageIndex = parseInt(parts[2], 10);

        // Retrieve the image data from the cache using the original interaction ID
        const cacheEntry = imageCache.get(originalInteractionId);

        if (!cacheEntry || !cacheEntry.data || imageIndex < 0 || imageIndex >= cacheEntry.data.length) {
            console.warn(`Image data not found in cache for interaction ${originalInteractionId} index ${imageIndex}`);
            try {
                await interaction.reply({ content: "Sorry, the image data for this download button has expired or was not found. Please try generating the image again.", ephemeral: true });
            } catch (e) { console.error("Error replying when image data not found:", e); }
            return;
        }

        // Get the specific image item (containing the AttachmentBuilder)
        const imageItem = cacheEntry.data[imageIndex];

        try {
            // Reply ephemerally, sending the specific image file directly
            await interaction.reply({
                content: `Here is image #${imageIndex + 1}:`,
                files: [imageItem.attachment], // Send the AttachmentBuilder
                ephemeral: true // Only the user who clicked sees this
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
  const interaction = queue[0]; // Get the oldest interaction from the queue

  let intermediateText = ''; // Store the intermediate text
  let generatedImagesWithUrls = []; // To store objects like { attachment: ..., url: ... }

  try {
    // Step 1: Show initial processing status (Reply was already deferred)
    // Just editing the initial deferred reply
    await interaction.editReply('✨ Wowza I see.. Your request is on the way!');

    // Step 2: Fetch and Sanitize intermediate text
    const rawIntermediateText = await generateIntermediateText(interaction.options.getString("prompt"));
    intermediateText = sanitizeText(rawIntermediateText); // Store the sanitized text

    // Step 3: Update status with intermediate text and generation message
    // Add some simple hardcoded markdown if the AI didn't provide much
    const formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : ''; // Wrap in italics, remove trailing period if any

    const generationStatusMessage = `${formattedIntermediateText ? formattedIntermediateText + '\n\n' : ''}🎨 Generating your image(s)...`;
    await interaction.editReply(generationStatusMessage);

    // Step 4: Generate the images (This now returns [{ attachment, url }, ...])
    generatedImagesWithUrls = await generateImage(interaction);
    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment); // Extract AttachmentBuilders for the files option

    // Step 5: Fetch the conclusion text
    const conclusionText = await generateConclusionText(interaction.options.getString("prompt"));
    // Add some simple hardcoded markdown to conclusion text too
    const formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : ''; // Wrap in italics, remove trailing period if any


    // Step 6: Send the final reply with images, embed, text, and buttons
    if (generatedAttachments && generatedAttachments.length > 0) {
       const prompt = interaction.options.getString("prompt");
       const numberOfImagesRequested = interaction.options.getInteger("number_of_images") || 1; // Use requested count for embed field
       const actualNumberOfImages = generatedAttachments.length; // Use actual count for button logic
       const aspectRatio = interaction.options.getString("aspect_ratio") || "3:2";
       const theme = interaction.options.getString("theme") || "normal";
       const enhancement = interaction.options.getBoolean("enhancement") || false;
       const model = interaction.options.getString("model") || "flux-core";
       const seed = interaction.options.getInteger("seed"); // Get user provided seed

       // Construct the final content string
       let finalContent = formattedIntermediateText || '';
       finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully generated!`; // Add success message
       if (formattedConclusionText) {
           finalContent += `\n\n${formattedConclusionText}`; // Add formatted conclusion
       }


       // Build the enhanced embed (Check if bot has EmbedLinks permission)
       const botPermissions = interaction.channel.permissionsFor(client.user);
       const embedsToSend = [];
       if (botPermissions.has('EmbedLinks')) {
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
                    `• **Model**: \`${model}\`\n` +
                    `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                    `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
                    `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`\n` + // Show actual vs requested if different
                    `${seed !== null ? `• **Seed**: \`${seed}\`` : ''}`, // Only show seed if user provided one
                  inline: false
                }
              )
              .setTimestamp()
              .setFooter({
                text: 'Created by Elixpo AI',
                iconURL: client.user.displayAvatarURL()
              });
           embedsToSend.push(embed);
       } else {
            // If EmbedLinks is missing, add parameters to content instead
            finalContent += `\n\n**🛠️ Generation Parameters:**\n` +
                            `• **Theme**: \`${theme}\`\n` +
                            `• **Model**: \`${model}\`\n` +
                            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
                            `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                            `${seed !== null ? `\n• **Seed**: \`${seed}\`` : ''}`;
       }


       // --- Add Buttons ---
       const actionRow = new ActionRowBuilder(); // Use ActionRowBuilder

       // Add Edit button (always exists)
       const editButton = new ButtonBuilder()
           .setLabel('Edit')
           .setStyle(ButtonStyle.Secondary)
           .setCustomId('edit_image'); // Custom ID needed for interaction handling
       actionRow.addComponents(editButton);

       // Add Download buttons based on the number of images
       if (actualNumberOfImages === 1) {
            const firstImageUrl = generatedImagesWithUrls[0].url; // Get URL of the single image
            const downloadButton = new ButtonBuilder()
                .setLabel('Download')
                .setStyle(ButtonStyle.Link) // Use Link style for single image direct URL
                .setURL(firstImageUrl); // Point to the image URL
            actionRow.addComponents(downloadButton); // Add to the same row
       } else {
            // If multiple images, create custom download buttons for each
            // Discord limits 5 components per row, we have 1 Edit button, leaves 4 spots.
            // Max images is 4, so 4 download buttons fit.
            for (let i = 0; i < actualNumberOfImages; i++) {
                const downloadButton = new ButtonBuilder()
                    .setLabel(`Download #${i + 1}`)
                    .setStyle(ButtonStyle.Primary) // Use Primary or Secondary style
                    .setCustomId(`download_${interaction.id}_${i}`); // Custom ID includes original interaction ID and image index
                 actionRow.addComponents(downloadButton);
            }
       }
       // --- End Buttons ---

       // Store image data in cache if there are custom download buttons (multiple images)
       if (actualNumberOfImages > 1) {
           imageCache.set(interaction.id, {
               data: generatedImagesWithUrls,
               timestamp: Date.now()
           });
           console.log(`Stored ${actualNumberOfImages} images in cache for interaction ${interaction.id}`);
       }


      // Final editReply includes content, embed (if available), files, and components (buttons)
      await interaction.editReply({
        content: finalContent,
        embeds: embedsToSend,
        files: generatedAttachments,
        components: [actionRow], // Add the action row with buttons
      });

    } else {
       // If no attachments were generated, send error message
       let finalContent = formattedIntermediateText || '';
       finalContent += `${finalContent ? '\n\n' : ''}⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data. Please try again later.`;
        if (formattedConclusionText) {
           finalContent += `\n\n${formattedConclusionText}`; // Still add formatted conclusion if available
       }
       await interaction.editReply({
         content: finalContent,
         // No embed, files, or components if generation failed
       });
    }

  } catch (error) {
    console.error('Error processing queue / generating image:', error);
    try {
        // Include intermediate text and a generic error message
        let finalContent = formattedIntermediateText || '';
        finalContent += `${finalContent ? '\n\n' : ''}⚠️ An unexpected error occurred while processing your request. Please try again later.`;
        if (formattedConclusionText) { // Include conclusion if it somehow succeeded before the main error
           finalContent += `\n\n${formattedConclusionText}`;
        }
       await interaction.editReply({ content: finalContent });
    } catch (editError) {
       console.error("Failed to edit reply with error message:", editError);
    }

  } finally {
    // Remove the processed interaction from the queue
    queue.shift();
    // Process the next item in the queue immediately
    setImmediate(processQueueDiscord);
  }
}

function addToQueue(interaction) {
  queue.push(interaction);
  console.log(`Added interaction ${interaction.id} to queue. Queue size: ${queue.length}`);
  if (!isProcessing) {
    console.log("Queue is not processing, starting processQueueDiscord.");
    processQueueDiscord();
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
     // Remove Markdown quotes (>) - useful if AI uses them unexpectedly
    sanitized = sanitized.replace(/^>.*$/gm, '');
     // Remove list markers if AI generates lists unexpectedly
    sanitized = sanitized.replace(/^[\s]*[-+*][\s]+/gm, '');

    // Basic HTML entities (less likely but safe)
    sanitized = sanitized.replace(/</g, '<').replace(/>/g, '>');

    // Trim leading/trailing whitespace
    sanitized = sanitized.trim();

    // Collapse multiple newlines into max two
     sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    // Note: This leaves **bold**, *italics*, __underline__, ~~strikethrough~~ intact.
    return sanitized;
}


async function generateIntermediateText(promptContent) {
  const textURL = "https://text.pollinations.ai/openai";
  const payload = {
    model: "evil",
    messages: [
      {
        role: "system",
        content: "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly sarcastic remark related to the user's prompt, indicating that the image is being generated. Keep it concise and engaging, ideally one or two sentences. Feel free to use **bold** or *italics* for emphasis within the text. Avoid standard bot responses. Be creative and slightly dramatic about the process. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown."
      },
      {
        role: "user",
        content: promptContent
      },
    ],
    seed: Math.floor(Math.random() * 1000000),
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
           ? textResult.choices[0].message.content // Let sanitizeText handle final cleaning
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
        content: "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly dramatic flourish acknowledging that the image based on the user's prompt is complete and ready to be viewed. Keep it concise and fun, ideally one sentence, like a reveal. Feel free to use **bold** or *italics* for emphasis. Do not ask questions or continue the conversation. Just a short, punchy statement about the completion. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown."
      },
      {
        role: "user",
        content: `The image based on "${promptContent}" is now complete.`
      },
    ],
    seed: Math.floor(Math.random() * 1000000) + 1000000,
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
           ? textResult.choices[0].message.content // Let sanitizeText handle final cleaning
           : 'Behold the creation!';
  } catch (error) {
    console.error('Network or parsing error generating conclusion text:', error);
    return null;
  }
}

// Modified to return objects containing { attachment, url }
async function generateImage(interaction) {
  const prompt = interaction.options.getString("prompt");
  const numberOfImages = interaction.options.getInteger("number_of_images") || 1;
  const aspectRatio = interaction.options.getString("aspect_ratio") || "3:2";
  const theme = interaction.options.getString("theme") || "normal";
  const enhancement = interaction.options.getBoolean("enhancement") || false;
  const model = interaction.options.getString("model") || "flux-core";
  const userProvidedSeed = interaction.options.getInteger("seed"); // Get user provided seed
  const baseSeed = userProvidedSeed !== null ? userProvidedSeed : Math.floor(Math.random() * 10000000) + 1000; // Use user seed if provided

  let width = 1024, height = 683;

  // Cap number of images at 4 as per original requirement and component row limit
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

  const imagesWithUrls = []; // Store objects { attachment: ..., url: ... }
  const errors = [];

  for (let i = 0; i < numImagesToGenerate; i++) {
    // Use the base seed + index for multiple images if no specific seed was provided
    // If a specific seed was provided, all images use that *same* seed.
    const currentSeed = userProvidedSeed !== null ? baseSeed : baseSeed + i;

    const imgurl = `https://image.pollinations.ai/prompt/${encodeURIComponent(encodedPrompt)}?width=${width}&height=${height}&seed=${currentSeed}&model=${model}&enhance=${enhancement}&nologo=true&referrer=elixpoart&token=elixpoart`;

    try {
      console.log(`Fetching image ${i + 1}/${numImagesToGenerate} from: ${imgurl}`);
      const response = await fetch(imgurl, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error fetching image ${i + 1}: ${response.status} ${response.statusText}`, errorText);
        errors.push(`Image ${i + 1} failed to generate.`);
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Basic check for minimal data (prevents trying to attach tiny error payloads)
      if (buffer.length > 100) { // Check if the buffer is significantly larger than a small error JSON/text
         const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_image_${i + 1}.jpg` });
         imagesWithUrls.push({ attachment: attachment, url: imgurl }); // Store both attachment and URL
         console.log(`Successfully fetched image ${i + 1}. Buffer size: ${buffer.length}`);
      } else {
         console.error(`Fetched data for image ${i + 1} is too small (${buffer.length} bytes), likely an error response payload.`);
         errors.push(`Image ${i + 1} returned unexpected data.`);
      }

    } catch (error) {
      console.error(`Network or fetching error for image ${i + 1}:`, error);
      errors.push(`Image ${i + 1} failed due to network error.`);
    }
  }

  if (imagesWithUrls.length === 0 && errors.length > 0) {
     console.error("All image generation attempts failed. Errors:", errors);
  } else if (errors.length > 0) {
      console.warn("Some image generation attempts failed. Errors:", errors);
  }

  return imagesWithUrls; // Return the array of objects
}

function getSuffixPrompt(theme) {
  switch (theme) {
    case "fantasy": return "in a magical fantasy setting, with mythical creatures and surreal landscapes";
    case "halloween": return "with spooky Halloween-themed elements, pumpkins, and eerie shadows";
    case "structure": return "in the style of monumental architecture, statues, or structural art";
    case "crayon": return "in the style of colorful crayon art with vibrant, childlike strokes";
    case "space": return "in a vast, cosmic space setting with stars, planets, and nebulae";
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

client.login(process.env.TOKEN);