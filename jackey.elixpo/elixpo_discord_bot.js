import { client, PERMISSIONS, getPermissionName } from './bot.js';
import { DISCORD_TOKEN, POLLINATIONS_TOKEN, TEST_GUILD_ID } from './config.js';
import { remixCommand } from './commands/remix.js';
import { handleGenerate } from './commands/generate.js';
import { handlePing } from './commands/ping.js';
import { handleHelp } from './commands/help.js';
import { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Semaphore } from './semaphore.js';

let queue = [];
let isProcessing = false;


const commandSemaphore = new Semaphore(5);
client.on('interactionCreate', async interaction => {
  // if (interaction.guildId !== TEST_GUILD_ID) {
  //   try {
  //     await interaction.reply({
  //       content: "🚧 The bot is currently under development and only available in the test server.",
  //       ephemeral: true
  //     });
  //   } catch (e) {
  //     console.error("Error sending dev-only message:", e);
  //   }
  //   return;
  // }

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

    if (['generate', 'edit', 'remix'].includes(interaction.commandName)) {
      await interaction.deferReply({ ephemeral: false }); // <-- FIXED
      await commandSemaphore.acquire();
      try {
        if (interaction.commandName === 'generate') {
          await handleGenerate(interaction);
        } 
        else if (interaction.commandName === 'remix') {
          await remixCommand(interaction);
        }
      } finally {
        commandSemaphore.release();
      }
      return;
    }
  
    // Other commands (help, ping, etc.) can run without limit
    if (interaction.commandName === 'help') {
      await handleHelp(interaction);
      return;
    }
    if (interaction.commandName === 'ping') {
      await handlePing(interaction);
      return;
    }
  }

});

async function processQueueDiscord() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  if (isProcessing) {
      return;
  }

  isProcessing = true;
  const interaction = queue[0];

  try {
    if (!interaction.deferred && !interaction.replied) {
         console.warn(`Interaction ${interaction.id} became invalid (not deferred/replied) before processing. Skipping.`);
         queue.shift();
         isProcessing = false;
         processQueueDiscord();
         return;
    }

    if (interaction.commandName === 'generate') {
        // console.log(`Processing generate command for interaction ${interaction.id}`);
        await handleGenerate(interaction);
    } 

    else if(interaction.commandName === "remix")
    {
      await remixCommand(interaction);
    }
    else {
         console.warn(`Unknown command in queue: ${interaction.commandName} for interaction ${interaction.id}. Skipping.`);
         try {
             await interaction.editReply({ content: `An internal error occurred: Unknown command \`${interaction.commandName}\` found in queue.` });
         } catch (e) { console.error("Failed to send unknown command error reply:", e); }
         queue.shift();
         isProcessing = false;
         processQueueDiscord();
         return;
    }

  } catch (error) {
    console.error(`Error processing interaction ${interaction.id} (Type: ${interaction.commandName}):`, error);

    try {
        if (!interaction.deferred && !interaction.replied) {
             console.warn(`Interaction ${interaction.id} became invalid during error handling. Cannot send error reply.`);
        } else {
             await interaction.editReply({
                 content: `⚠️ An unexpected error occurred while processing your request for \`${interaction.commandName}\`. Please try again later. Error details have been logged.`,
             });
        }
    } catch (editError) {
      console.error(`Failed to edit reply for interaction ${interaction.id} during main error handling:`, editError);
    }

    if (queue.length > 0 && queue[0] === interaction) {
        queue.shift();
    } else {
        console.warn(`Queue head mismatch during error handling. Expected interaction ${interaction.id}, found ${queue.length > 0 ? queue[0].id : 'none'}. Clearing queue head defensively.`);
        if (queue.length > 0) {
             queue.shift();
        }
    }

    isProcessing = false;
    if (queue.length > 0) {
         process.nextTick(processQueueDiscord);
    }


  } finally {

    if (queue.length > 0 && queue[0] === interaction) {
         queue.shift();
    }

    isProcessing = false;

    if (queue.length > 0) {
         process.nextTick(processQueueDiscord);
    }
  }
}

function addToQueue(interaction) {
  queue.push(interaction);
  console.log(`Added interaction ${interaction.id} (Type: ${interaction.commandName}) to queue. Queue size: ${queue.length}`);
  if (!isProcessing) {
    // console.log("Queue is not processing, starting processQueueDiscord.");
    process.nextTick(processQueueDiscord);
  } else {
    // console.log("Queue is already processing.");
  }
}

if (!DISCORD_TOKEN) {
    console.error("FATAL ERROR: Discord bot token not found in environment variables (DISCORD_TOKEN).");
    process.exit(1);
}
if (!POLLINATIONS_TOKEN) {
     console.warn("Pollinations API token not found in environment variables (POLLINATIONS_TOKEN).");
}

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

client.login(DISCORD_TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1);
});