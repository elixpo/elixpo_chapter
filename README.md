# Elixpo Discord Bot (Jackey)

A Discord bot for generating, remixing, and managing AI-generated images using slash commands. Built with [discord.js](https://discord.js.org/) and supports advanced image options, queueing, and permission checks.

---

## Features

- **/generate**: Create images from prompts with options for number, aspect ratio, theme, model, and more.
- **/remix**: Remix up to 3 uploaded images with a new prompt and options.
- **/help**: Get information about available commands.
- **Queue system**: Handles multiple requests efficiently.
- **Permission checks**: Ensures the bot has the correct permissions before replying or sending files.
- **Download buttons**: Users can download generated images via interactive buttons.
- **Cache management**: Temporary storage for generated images and cleanup.

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/elixpo-discord-bot.git
cd elixpo-discord-bot
npm install
```

### 2. Environment Variables

Create a `.env` file or set these variables in your environment:

```
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
POLLINATIONS_TOKEN=your_pollinations_api_token (optional)
```

### 3. Register Slash Commands

Run the command registration script to register or update slash commands:

```bash
node register_commands.js
```

### 4. Start the Bot

```bash
node elixpo_discord_bot.js
```

---

## Slash Commands

### `/generate`

Generate images from a prompt.

**Options:**

- `prompt` (string, required): The prompt for image generation.
- `number_of_images` (int, required): Number of images (1-4).
- `seed` (int, optional): Random seed (10-1000000).
- `aspect_ratio` (choice, optional): 16:9, 9:16, 1:1, 4:3, 3:2.
- `theme` (choice, optional): fantasy, normal, halloween, structure, crayon, space, chromatic, cyberpunk, anime, landscape, samurai, wpap, vintage, pixel, synthwave.
- `enhancement` (bool, optional): Enhance image quality.
- `model` (choice, optional): flux, turbo, gptimage.

### `/remix`

Remix up to 3 uploaded images with a new prompt.

**Options:**

- `prompt` (string, required): How to remix the images.
- `image_1` (attachment, required): First image.
- `image_2` (attachment, optional): Second image.
- `image_3` (attachment, optional): Third image.
- `seed`, `aspect_ratio`, `theme`: Same as `/generate`.

### `/help`

Get information about the bot's commands.

---

## Permissions

The bot requires the following permissions in your Discord server:

- View Channels
- Send Messages
- Attach Files

---

## Development Notes

- Commands are defined and registered in `register_commands.js`.
- Main bot logic and event handling is in `elixpo_discord_bot.js`.
- Uses a semaphore to limit concurrent image generation/remix requests.
- Handles permission errors and missing cache gracefully.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Credits

- Built with [discord.js](https://discord.js.org/)
- Image generation via Pollinations API (optional)
