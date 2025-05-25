import {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    ContextMenuCommandBuilder, // ✅ ADD THIS
    ApplicationCommandType,
    EmbedBuilder
} from 'discord.js';


const TOKEN = 'MTM3NjIzODEzOTU1ODk4NTg0OQ.GhORcc.i_jDaOXtSNc-58mLy7RwXmNu--y4sINqquMFmE'; // Replace this with your new token
const CLIENT_ID = '1376238139558985849'; // Found in Developer Portal
const GUILD_ID = '1211167740698566717';   // Use for testing in your server

const client = new Client({
    intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// Register slash command: /refer
const commands = [
    new SlashCommandBuilder()
    .setName('refer')
    .setDescription('Refer a message with a note')
    .addStringOption(option =>
        option
        .setName('message_id')
        .setDescription('ID of the message to refer to')
        .setRequired(true),
    )
    .addStringOption(option =>
        option
        .setName('note')
        .setDescription('Your message to add')
        .setRequired(true),
    ),
].map(cmd => cmd.toJSON());

// Deploy commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
    console.log('Registering slash command...');
    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands },
    );
    console.log('Slash command registered!');
    } catch (err) {
    console.error('Failed to register commands:', err);
    }
})();

// Handle interaction
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'refer') {
    const messageId = interaction.options.getString('message_id');
    const note = interaction.options.getString('note');

    try {
        const message = await interaction.channel.messages.fetch(messageId);

        if (!message.embeds.length) {
        await interaction.reply({
            content: '❌ The message has no embed/image.',
            ephemeral: true,
        });
        return;
        }

        const embed = EmbedBuilder.from(message.embeds[0]);

        await interaction.reply({
        content: `📝 **Note:** ${note}`,
        embeds: [embed],
        });
    } catch (err) {
        console.error('Error fetching message:', err);
        await interaction.reply({
        content: '❌ Could not find message with that ID in this channel.',
        ephemeral: true,
        });
    }
    }
});

// Bot ready
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Start bot
client.login(TOKEN);

