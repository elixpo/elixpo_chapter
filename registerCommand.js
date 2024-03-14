require('dotenv/config');
const {REST, Routes, ApplicationCommandOptionType} = require('discord.js');

const commands = [
    {
        name : "artistic",
        description : "Generate four images from a prompt",
        options : [
            {
                name : "prompt",
                description : "The prompt to generate an image from",
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name : "height",
                description : "The prompt to generate an image from",
                type: ApplicationCommandOptionType.Number,
                required: false
            },
            {
                name : "width",
                description : "The prompt to generate an image from",
                type: ApplicationCommandOptionType.Number,
                required: false
            },
        ],
        name : "paint",
        description : "Generate one image from a prompt",
        options : [
            {
                name : "prompt",
                description : "The prompt to generate an image from",
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name : "height",
                description : "The prompt to generate an image from",
                type: ApplicationCommandOptionType.Number,
                required: false
            },
            {
                name : "width",
                description : "The prompt to generate an image from",
                type: ApplicationCommandOptionType.Number,
                required: false
            },
        ],
    },
    {
        name : "ping",
        description : "Check if the bot is online"
    }
]

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);
// Sends the command data to Discord
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();