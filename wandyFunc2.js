require('dotenv/config');
const { Client, AttachmentBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

let messageQueue  = [];
let messageQueueSingle = [];
const IGNORE_PREFIX = "!";


const client = new Client({
    intents : ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'],
    
});

client.on("ready", () => {
    // console.log("BooleanGPT > Konnichiwa!");
    client.channels.cache.get(process.env.MESSAGE_CHANNEL).send("Jackey > Bonjour!");
    client.user.setActivity('Imaginations 🤔', { type : 3 });
})


async function processNextMessage() {
    if (messageQueue.length > 0) {
        const nextInteraction = messageQueue.shift(); // Get the next message from the queue
        await generateImage(nextInteraction); // Generate the image for the next message
        // Wait for 2 seconds before processing the next message
        await new Promise(resolve => setTimeout(resolve, 2000));
        await processNextMessage(); // Process the next message recursively
        return true;
    }
    else
    {
        return false;
    }
    
}


async function processNextMessageSingle() {
    if (messageQueue.length > 0) {
        const nextInteraction = messageQueueSingle.shift(); // Get the next message from the queue
        await generateImageSingle(nextInteraction); // Generate the image for the next message
        // Wait for 2 seconds before processing the next message
        await new Promise(resolve => setTimeout(resolve, 2000));
        await processNextMessageSingle(); // Process the next message recursively
        return true;
    }
    else
    {
        return false;
    }
    
}


async function generateImage(interaction)
{   
    if (interaction.channelId !== process.env.MESSAGE_CHANNEL) {
        const jackeyChannel = `<#${process.env.MESSAGE_CHANNEL}>`;
        await interaction.reply(`Opsie! I do better Vsisualisation at ${jackeyChannel}.`);
        return;
    }
    await interaction.deferReply();
    await interaction.channel.send({ content: `Hello! <@${interaction.user.id}>, the generation would take upto a minute time!` });
    const prompt = interaction.options.getString("prompt");
    interaction.options.getNumber("width") == NaN ? width = 1920   : width = interaction.options.getNumber("width");
    interaction.options.getNumber("height") == NaN ? height = 1080 : height = interaction.options.getNumber("height");



    try {
        const response1 = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${5}`, { responseType: 'arraybuffer' });
        const response2 = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${25}`, { responseType: 'arraybuffer' });
        const response3 = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${50}`, { responseType: 'arraybuffer' });
        const response4 = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${150}`, { responseType: 'arraybuffer' });


        const attachment1 = new AttachmentBuilder(response1.data, 'image1.png');
        const attachment2 = new AttachmentBuilder(response2.data, 'image2.png');
        const attachment3 = new AttachmentBuilder(response3.data, 'image3.png');
        const attachment4 = new AttachmentBuilder(response4.data, 'image4.png');


    const downloadButton1 = new ButtonBuilder()
    .setLabel('Download Image 1')
    .setStyle(ButtonStyle.Link)
    .setURL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${5}`);

    const downloadButton2 = new ButtonBuilder()
        .setLabel('Download Image 2')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${25}`);

    const downloadButton3 = new ButtonBuilder()
        .setLabel('Download Image 3')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${50}`);

    const downloadButton4 = new ButtonBuilder()
        .setLabel('Download Image 4')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${150}`);

    const embed = new EmbedBuilder()
        .setTitle('Generated Image')
        .setDescription(`Prompt: ${prompt}`)
        .setColor('#0099ff')
        .setFooter({ text: `Prompted by ${interaction.user.tag} | Created by Jackey`, iconURL: interaction.user.avatarURL({ dynamic: true }) });

        // Send the reply with the embed and download button
        await interaction.editReply({
            embeds: [embed],
            files: [attachment1, attachment2, attachment3, attachment4],
            components: [new ActionRowBuilder().addComponents(downloadButton1, downloadButton2, downloadButton3, downloadButton4)]
        });
    } catch (error) {
        console.error('Error fetching image:', error);
        // Handle the error
        await interaction.followUp('Error fetching image. Please try again later.');
    }
}

async function generateImageSingle(interaction)
{   
    if (interaction.channelId !== process.env.MESSAGE_CHANNEL) {
        const jackeyChannel = `<#${process.env.MESSAGE_CHANNEL}>`;
        await interaction.reply(`Opsie! I do better Vsisualisation at ${jackeyChannel}.`);
        return;
    }
    await interaction.deferReply();
    await interaction.channel.send({ content: `Hello! <@${interaction.user.id}>, the generation would take upto half a minute time!` });
    const prompt = interaction.options.getString("prompt");
    interaction.options.getNumber("width") == NaN ? width = 1920   : width = interaction.options.getNumber("width");
    interaction.options.getNumber("height") == NaN ? height = 1080 : height = interaction.options.getNumber("height");



    try {
        const response1 = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${150}`, { responseType: 'arraybuffer' });
        const attachment1 = new AttachmentBuilder(response1.data, 'image1.png');



    const downloadButton1 = new ButtonBuilder()
    .setLabel('Download Image 1')
    .setStyle(ButtonStyle.Link)
    .setURL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${5}`);


    const embed = new EmbedBuilder()
        .setTitle('Generated Image')
        .setDescription(`Prompt: ${prompt}`)
        .setColor('#0099ff')
        .setFooter({ text: `Prompted by ${interaction.user.tag} | Created by Jackey`, iconURL: interaction.user.avatarURL({ dynamic: true }) });

        // Send the reply with the embed and download button
        await interaction.editReply({
            embeds: [embed],
            files: [attachment1],
            components: [new ActionRowBuilder().addComponents(downloadButton1)]
        });
    } catch (error) {
        console.error('Error fetching image:', error);
        // Handle the error
        await interaction.followUp('Error fetching image. Please try again later.');
    }
}

client.on("interactionCreate", async (  interaction) => {
    if (interaction.user.bot) return;
    if (!interaction.isCommand()) return;
    if (!interaction.isChatInputCommand()) return;
    let width = 0;
    let height = 0;
    if(interaction.commandName === "artistic")
    {
        if(await processNextMessage())
        {
            messageQueue.push(interaction); // Add the message to the end of the queue
        }
        else
        {
            generateImage(interaction);
        }
    }
    else if(interaction.commandName === "paint")
    {
        if(await processNextMessageSingle())
        {
            messageQueueSingle.push(interaction); // Add the message to the end of the queue
        }
        else
        {
            generateImageSingle(interaction);
        }
    }
    else if(interaction.commandName === "ping")
    {
        await interaction.reply({ content: `Jackey is up and Painting!` });
    }

    
})

client.login("")