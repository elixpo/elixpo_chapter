import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv
import aiohttp
import io
import asyncio
import time
import re
import random
from urllib.parse import urlencode, quote_plus 

load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
POLLINATIONS_TOKEN = os.getenv('POLLINATIONS_TOKEN') 
POLLINATIONS_REFERRER = os.getenv('POLLINATIONS_REFERRER')
if not DISCORD_TOKEN:
    print("FATAL ERROR: Discord bot token not found in environment variables (DISCORD_TOKEN).")
    exit(1)


intents = discord.Intents.default()
intents.message_content = True 
bot = commands.Bot(command_prefix="/", intents=intents)
# bot.tree = app_commands.CommandTree(bot) 
queue = []
queue_lock = asyncio.Lock()
is_processing = False

# Cache structure: dict<interaction_id, { 'data': [ { 'attachment': discord.File, 'url': str }, ... ], 'timestamp': float }>
image_cache = {}
CACHE_DURATION = 30 * 60

REQUIRED_PERMISSIONS_FATAL = [
    discord.Permissions.view_channel,
    discord.Permissions.send_messages,
    discord.Permissions.attach_files,
]
REQUIRED_PERMISSIONS_EDIT_FATAL = REQUIRED_PERMISSIONS_FATAL + [
    discord.Permissions.read_message_history,
]
OPTIONAL_PERMISSIONS = {
    'Embed Links': discord.Permissions.embed_links,
    'Read Message Content': discord.Permissions.read_messages,
}


def get_missing_permissions(channel_perms, required_flags):
    """Checks which required permissions are missing for the bot in a channel."""
    missing = [flag.name for flag in required_flags if not channel_perms.has_permissions(**{flag.name: True})]
    return missing

async def cleanup_cache():
    """Cleanup function for the cache, runs periodically."""
    await bot.wait_until_ready() 
    while not bot.is_closed():
        await asyncio.sleep(10 * 60) 
        now = time.time()
        keys_to_delete = []
        for key, value in image_cache.items():
            if now - value['timestamp'] > CACHE_DURATION:
                print(f"Cleaning up cache for interaction {key}")
                keys_to_delete.append(key)

        for key in keys_to_delete:
            del image_cache[key]
        print("Cache cleanup finished.")

def sanitize_text(text):
    """Sanitizes text to prevent unwanted Discord markdown/elements."""
    if not text:
        return ''
    sanitized = str(text) # Ensure it's a string

    sanitized = re.sub(r'(https?://[^\s]+)', '', sanitized) 
    sanitized = re.sub(r'```.*?```', '', sanitized, flags=re.DOTALL) 
    sanitized = re.sub(r'`.*?`', '', sanitized) 
    sanitized = re.sub(r'^>.*$', '', sanitized, flags=re.MULTILINE) 
    sanitized = re.sub(r'^[\s]*[-+*][\s]+', '', sanitized, flags=re.MULTILINE) 
    sanitized = re.sub(r'([^\s\*\_])\*\*([^\s\*\_])', r'\1\2', sanitized) 
    sanitized = re.sub(r'\*\*([^\s\*\_])', r'\1', sanitized)
    sanitized = re.sub(r'([^\s\*\_])\*\*', r'\1', sanitized)
    sanitized = re.sub(r'([^\s\*\_])\*([^\s\*\_])', r'\1\2', sanitized) 
    sanitized = re.sub(r'\*([^\s\*\_])', r'\1', sanitized)
    sanitized = re.sub(r'([^\s\*\_])\*', r'\1', sanitized)

    sanitized = sanitized.replace('<', '<').replace('>', '>') 
    sanitized = sanitized.strip()
    sanitized = re.sub(r'\n{3,}', '\n\n', sanitized)
    return sanitized

def get_suffix_prompt(theme):
  """Maps theme names to descriptive prompt suffixes."""
  suffixes = {
      "fantasy": "in a magical fantasy setting, with mythical creatures and surreal landscapes",
      "halloween": "with spooky Halloween-themed elements, pumpkins, and eerie shadows",
      "structure": "in the style of monumental architecture, statues, or structural art",
      "crayon": "in the style of colorful crayon art with vibrant, childlike strokes",
      "space": "in a vast, cosmic space setting with stars, planets and nebulae",
      "chromatic": "in a chromatic style with vibrant, shifting colors and gradients",
      "cyberpunk": "in a futuristic cyberpunk setting with neon lights and dystopian vibes",
      "anime": "in the style of anime, with detailed character designs and dynamic poses",
      "landscape": "depicting a breathtaking landscape with natural scenery and serene views",
      "samurai": "featuring a traditional samurai theme with warriors and ancient Japan",
      "wpap": "in the WPAP style with geometric shapes and vibrant pop-art colors",
      "vintage": "in a vintage, old-fashioned style with sepia tones and retro aesthetics",
      "pixel": "in a pixel art style with blocky, 8-bit visuals and retro game aesthetics",
      "normal": "realistic and natural style",
      "synthwave": "in a retro-futuristic synthwave style with neon colors and 80s vibes",
  }
  return suffixes.get(theme, "artistic style")


async def generate_text(prompt_content, system_content, model="evil", seed=23, referrer="elixpoart"):
    """Helper to call the Pollinations text API."""
    text_url = "https://text.pollinations.ai/openai"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt_content},
        ],
        "seed": seed,
        "referrer": referrer,
    }

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(text_url, json=payload) as response:
                if response.status != 200:
                    error_body = await response.text()
                    print(f"Error generating text (status {response.status}): {response.reason}", error_body)
                    return None # Indicate failure
                text_result = await response.json()
                content = text_result.get('choices', [{}])[0].get('message', {}).get('content')
                return content
        except aiohttp.ClientError as e:
            print(f"Network or API error during text generation: {e}")
            return None # Indicate failure

async def generate_intermediate_text(prompt_content):
    """Generates intermediate text using the text API."""
    system_content = "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly sarcastic remark related to the user's prompt, indicating that the image is being generated/processed. Keep it concise and engaging, ideally one or two sentences. Feel free to use **bold** or *italics* for emphasis within the text. Avoid standard bot responses. Be creative and slightly dramatic about the process. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
    text = await generate_text(prompt_content, system_content, referrer=POLLINATIONS_REFERRER)
    return sanitize_text(text) if text else 'Summoning the creative spirits...'

async def generate_conclusion_text(prompt_content):
    """Generates conclusion text using the text API."""
    system_content = "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly dramatic flourish acknowledging that the image based on the user's prompt is complete and ready to be viewed. Keep it concise and fun, ideally one sentence, like a reveal. Feel free to use **bold** or *italics* for emphasis. Do not ask questions or continue the conversation. Just a short, punchy statement about the completion. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
    text = await generate_text(f'The image based on "{prompt_content}" is now complete.', system_content, referrer=POLLINATIONS_REFERRER)
    return sanitize_text(text) if text else 'Behold the creation!'

async def fetch_image_bytes(image_url):
    """Fetches image data as bytes from a URL."""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(image_url) as response:
                if response.status != 200:
                    print(f"Error fetching image (status {response.status}): {response.reason}")
                    return None
                # Basic check for content type
                content_type = response.headers.get('Content-Type', '')
                if not content_type.startswith('image/'):
                    print(f"Fetched data is not an image. Content-Type: {content_type}")
                    return None
                # Read bytes
                image_bytes = await response.read()
                if len(image_bytes) < 100: # Basic size check
                     print(f"Fetched image data is too small ({len(image_bytes)} bytes), likely an error response.")
                     return None
                return image_bytes
        except aiohttp.ClientError as e:
            print(f"Network error fetching image: {e}")
            return None

async def generate_image(interaction: discord.Interaction):
    """Calls the Pollinations image API for standard generation."""
    prompt = interaction.options.get("prompt", None)
    if not prompt: return [] # Should not happen due to command setup

    prompt = prompt.value # Get value from AppCommandOption
    num_images = interaction.options.get("number_of_images", None)
    num_images = num_images.value if num_images else 1
    num_images_to_generate = max(1, min(4, num_images))

    aspect_ratio = interaction.options.get("aspect_ratio", None)
    aspect_ratio = aspect_ratio.value if aspect_ratio else "3:2"
    theme = interaction.options.get("theme", None)
    theme = theme.value if theme else "normal"
    enhancement = interaction.options.get("enhancement", None)
    enhancement = enhancement.value if enhancement else False
    model = interaction.options.get("model", None)
    model = model.value if model else "flux" # Default model for generate
    user_provided_seed = interaction.options.get("seed", None)
    seed_value = user_provided_seed.value if user_provided_seed else None

    base_seed = seed_value if seed_value is not None else int(time.time() * 1000) % 100000000 

    width, height = 1024, 683
    if aspect_ratio == '16:9': width, height = 1024, 576
    elif aspect_ratio == '9:16': width, height = 576, 1024
    elif aspect_ratio == '1:1': width, height = 1024, 1024
    elif aspect_ratio == '4:3': width, height = 1024, 768
    elif aspect_ratio == '3:2': width, height = 1024, 683

    suffix_prompt = get_suffix_prompt(theme)
    encoded_prompt = f"{prompt.strip()} {suffix_prompt}".strip()

    images_with_urls = []
    # errors = [] # Could collect errors here if needed for detailed reporting

    for i in range(num_images_to_generate):
        current_seed = seed_value if seed_value is not None else base_seed + i 
        base_url = "https://image.pollinations.ai/prompt/"
        prompt_path = quote_plus(encoded_prompt)

        query_params = {
            'width': width,
            'height': height,
            'seed': 23, 
            'model': model,
            'enhance': 'true' if enhancement else 'false',
            'nologo': 'true',
            'referrer': POLLINATIONS_TOKEN,
            'token': POLLINATIONS_TOKEN,
            # No 'image' parameter for standard generation
        }
        query_string = urlencode(query_params)
        img_url = f"{base_url}{prompt_path}?{query_string}"
        print(f"[Generate] Attempting to fetch image {i + 1}/{num_images_to_generate} from: {img_url}")
        image_bytes = await fetch_image_bytes(img_url)

        if image_bytes:
            image_file = io.BytesIO(image_bytes)
            attachment = discord.File(image_file, filename=f"elixpo_ai_image_{i + 1}.jpg")
            images_with_urls.append({'attachment': attachment, 'url': img_url})
            print(f"[Generate] Successfully fetched image {i + 1}. Bytes: {len(image_bytes)}")
        # else:
            # errors.append(f"Image {i + 1} failed to generate.")

    # if not images_with_urls and errors:
    #      print("[Generate] All image generation attempts failed.")
    # elif errors:
    #      print("[Generate] Some image generation attempts failed. Errors:", errors)

    return images_with_urls

async def generate_remix_image(interaction: discord.Interaction, source_image_url: str):
    """Calls the Pollinations image API for remixing/editing."""
    prompt = interaction.options.get("prompt", None)
    if not prompt: return [] 
    prompt = prompt.value

    num_images = interaction.options.get("number_of_images", None)
    num_images = num_images.value if num_images else 1
    num_images_to_generate = max(1, min(4, num_images))

    images_with_urls = []
    # errors = []

    for i in range(num_images_to_generate):
        # Construct the URL using urllib.parse, matching test.js structure
        base_url = "https://image.pollinations.ai/prompt/"
        prompt_path = quote_plus(prompt.strip()) # Encode the prompt

        query_params = {
            'model': 'gptimage', 
            'token': 'fEWo70t94146ZYgk', 
            'private': 'true', 
            'nologo': 'true',
        }
        query_string = urlencode(query_params)

        img_url = f"{base_url}{prompt_path}?{query_string}"
        if source_image_url:
            img_url += f"&image={quote_plus(source_image_url)}"
        print(f"[Remix] Attempting to fetch image {i + 1}/{num_images_to_generate} from: {img_url}")
        image_bytes = await fetch_image_bytes(img_url)
        if image_bytes:
            image_file = io.BytesIO(image_bytes)
            attachment = discord.File(image_file, filename=f"elixpo_ai_remix_{i + 1}.jpg")
            images_with_urls.append({'attachment': attachment, 'url': img_url})
            print(f"[Remix] Successfully fetched image {i + 1}. Bytes: {len(image_bytes)}")
        # else:
            # errors.append(f"Remixed Image {i + 1} failed to generate.")

    # if not images_with_urls and errors:
    #      print("[Remix] All remix attempts failed.")

    return images_with_urls

# --- Queue Processing ---

async def process_queue_discord():
    """Processes interactions from the queue asynchronously."""
    global is_processing
    async with queue_lock: # Acquire lock to safely check and update state
        if not queue:
            is_processing = False
            return
        is_processing = True
        interaction = queue.pop(0) # Get the first interaction

    print(f"Processing interaction {interaction.id} (Type: {interaction.command.name if interaction.command else 'Button'}) from queue. Queue size: {len(queue)}")

    # Retrieve non-fatal permission info stored earlier (or re-check, re-checking is simpler)
    bot_member = interaction.guild.me if interaction.guild else None
    channel_perms = interaction.channel.permissions_for(bot_member) if interaction.channel and bot_member else None

    missing_embeds = False
    missing_message_content = False
    if channel_perms:
        missing_embeds = not channel_perms.has_permissions(embed_links=True)
        missing_message_content = interaction.command.name == 'edit' and not channel_perms.has_permissions(read_message_content=True) # Note: MessageContent check might be redundant with ReadMessageHistory for this flow, but keeping parity

    intermediate_text = ''
    conclusion_text = ''
    formatted_intermediate_text = ''
    formatted_conclusion_text = ''

    generated_images_with_urls = []
    final_content = ''
    embeds_to_send = []
    components_to_send = [] # List of discord.ui.View

    try:
        # Use interaction.original_response() for subsequent edits after defer
        # initial_response = await interaction.original_response() # Not needed, can edit directly

        initial_status_content = ''
        if missing_embeds:
             initial_status_content += f"⚠️ I am missing the **{OPTIONAL_PERMISSIONS['Embed Links'].name.replace('_', ' ').title()}** permission, so the rich embed won't display full details.\n\n"
        if missing_message_content:
             initial_status_content += f"⚠️ I am missing the **{OPTIONAL_PERMISSIONS['Read Message Content'].name.replace('_', ' ').title()}** permission, which might limit understanding of the original message's content.\n\n"
        initial_status_content += '✨ Wowza I see.. Your request is on the way!' if interaction.command.name == 'generate' else '🪄 Getting ready to remix your creation!'

        # Edit the deferred reply
        await interaction.edit_original_response(content=initial_status_content)

        prompt_option = interaction.options.get("prompt", None)
        prompt_string = prompt_option.value if prompt_option else None

        if not prompt_string:
            final_content = f"{initial_status_content}\n\n❌ Critical Error: Prompt option is missing. Please ensure the command is used correctly."
            await interaction.edit_original_response(content=final_content)
            print(f"[processQueueDiscord] Prompt option missing for interaction {interaction.id}")
            return # Exit processing for this interaction

        # --- Generate text and format ---
        # Await these calls
        intermediate_text = sanitize_text(await generate_intermediate_text(prompt_string))
        conclusion_text = sanitize_text(await generate_conclusion_text(prompt_string))

        formatted_intermediate_text = f"*{intermediate_text.rstrip('.') .strip()}*" if intermediate_text else ''
        formatted_conclusion_text = f"*{conclusion_text.rstrip('.') .strip()}*" if conclusion_text else ''
        # --- End text generation/formatting ---

        generation_status_content = initial_status_content
        if formatted_intermediate_text:
            generation_status_content += f"\n\n{formatted_intermediate_text}"
        generation_status_content += f"\n\n{'🎨 Generating your image(s)...' if interaction.command.name == 'generate' else '🔄 Remixing your image(s)...'}"

        await interaction.edit_original_response(content=generation_status_content)


        if interaction.command.name == 'generate':
            generated_images_with_urls = await generate_image(interaction)
        elif interaction.command.name == 'edit':
           target_message_id_option = interaction.options.get("message_id", None)
           requested_index_option = interaction.options.get("index", None)
           num_images_option = interaction.options.get("number_of_images", None)
           target_message_id = target_message_id_option.value if target_message_id_option else None
           requested_index = requested_index_option.value if requested_index_option else None
           number_of_images = num_images_option.value if num_images_option else 1 

           # Check if required options are present
           if not target_message_id or requested_index is None or prompt_string is None or number_of_images is None:
               print(f"[processQueueDiscord][/edit] Required options missing for interaction {interaction.id}: message_id={target_message_id}, index={requested_index}, prompt={prompt_string}, numberOfImages={number_of_images}")
               final_content = f"{initial_status_content}\n\n❌ Critical Error: Required options (`message_id`, `index`, `prompt`, `number_of_images`) were not provided or were invalid. Please ensure the command is used correctly."
               await interaction.edit_original_response(content=final_content)
               return

           referenced_message = None
           try:
               # ReadMessageHistory permission was checked as fatal before queueing
               print(f"[processQueueDiscord][/edit] Attempting to fetch message with ID: {target_message_id} for user {interaction.user.id}")
               referenced_message = await interaction.channel.fetch_message(int(target_message_id))
               print(f"[processQueueDiscord][/edit] Successfully fetched message ID: {target_message_id}")
           except (discord.NotFound, discord.Forbidden, discord.HTTPException) as fetch_error:
               print(f"Failed to fetch message ID {target_message_id} for user {interaction.user.id}:", fetch_error)
               missing_perm_name = discord.Permissions.read_message_history.name.replace('_', ' ').title()
               final_content = f"{initial_status_content}\n\n❌ Could not find the message with ID `{target_message_id}`. It might have been deleted, is too old, or I lack permissions (**{missing_perm_name}**)."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               return

           # Basic validation of the fetched message
           if referenced_message.author.id != bot.user.id or not referenced_message.embeds:
               final_content = f"{initial_status_content}\n\n❌ The message with ID `{target_message_id}` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               print(f"/edit provided message ID {target_message_id} which is not a bot/image message by user {interaction.user.id}")
               return

           # Try to get the original interaction ID from the footer
           original_embed = referenced_message.embeds[0]
           footer_text = original_embed.footer.text if original_embed.footer else None
           # Assuming footer format is "Created by Elixpo AI | ID: <interaction_id>"
           original_interaction_id = None
           if footer_text:
                id_match = re.search(r'ID: (\d+)', footer_text)
                if id_match:
                    original_interaction_id = int(id_match.group(1)) # Convert to int

           if not original_interaction_id:
               final_content = f"{initial_status_content}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID `{target_message_id}`. The message format might be outdated or corrupted."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               print(f"Could not parse original interaction ID from footer '{footer_text}' for user {interaction.user.id} (message ID: {target_message_id})")
               return

           # Retrieve the original image data from the cache
           original_cache_entry = image_cache.get(original_interaction_id)

           if not original_cache_entry or not original_cache_entry.get('data'):
               final_content = f"{initial_status_content}\n\n❌ The data for the original image from message ID `{target_message_id}` has expired from the cache. Please try generating the original image again and then use the `/edit` command with the new message ID."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               print(f"Original cache data not found for interaction {original_interaction_id} (via message ID {target_message_id}). User {interaction.user.id} requested edit.")
               return

           # Validate the index against the available images in the cache (requested_index is 1-based)
           if requested_index < 1 or requested_index > len(original_cache_entry['data']):
                final_content = f"{initial_status_content}\n\n❌ Invalid image index `{requested_index}` for message ID `{target_message_id}`. Please provide an index between 1 and {len(original_cache_entry['data'])} for that message."
                if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
                await interaction.edit_original_response(content=final_content)
                print(f"Invalid image index {requested_index} provided by user {interaction.user.id} for message ID {target_message_id}. Max index was {len(original_cache_entry['data'])}")
                return

           # Get the source image URL from the cache using the 0-indexed value
           source_image_item = original_cache_entry['data'][requested_index - 1]
           source_image_url = source_image_item.get('url')

           if not source_image_url:
                final_content = f"{initial_status_content}\n\n❌ Could not retrieve the URL for the selected image from the cache for message ID `{target_message_id}`."
                if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
                await interaction.edit_original_response(content=final_content)
                print(f"Could not get URL for image {requested_index} from cache for interaction {original_interaction_id} (via message ID {target_message_id}).")
                return

           print(f"User {interaction.user.name} is editing image {requested_index} from message ID {target_message_id} (original interaction {original_interaction_id}) using source URL: {source_image_url}")

           # Generate the new image(s) using the remix function
           generated_images_with_urls = await generate_remix_image(interaction, source_image_url)
           # --- End /edit logic ---

        # Prepare attachments from generated images
        generated_attachments = [item['attachment'] for item in generated_images_with_urls if item.get('attachment')]


        # --- Send the final reply ---
        if generated_attachments:
           # Retrieve options for embed/content
           prompt = interaction.options.get("prompt").value
           num_images_requested = interaction.options.get("number_of_images", app_commands.Option(name="number_of_images", value=1)).value
           actual_num_images = len(generated_attachments)
           aspect_ratio_opt = interaction.options.get("aspect_ratio", None)
           aspect_ratio = aspect_ratio_opt.value if aspect_ratio_opt else "3:2"
           theme_opt = interaction.options.get("theme", None)
           theme = theme_opt.value if theme_opt else "normal"
           enhancement_opt = interaction.options.get("enhancement", None)
           enhancement = enhancement_opt.value if enhancement_opt else False
           seed_opt = interaction.options.get("seed", None)
           seed_value = seed_opt.value if seed_opt else None
           # Model for remix is always gptimage regardless of user input 'model' option
           model_used = "gptimage" if interaction.command.name == 'edit' else (interaction.options.get("model", app_commands.Option(name="model", value="flux")).value)


           # Construct final content string
           final_content = ''
           if missing_embeds: final_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Embed Links'].name.replace('_', ' ').title()}** permission, so the rich embed won't display full details.\n\n"
           if missing_message_content: final_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Read Message Content'].name.replace('_', ' ').title()}** permission.\n\n"
           if formatted_intermediate_text: final_content += formatted_intermediate_text

           if interaction.command.name == 'generate':
                final_content += f"{final_content if final_content else ''}\n\n✨ Your images have been successfully generated!"
           elif interaction.command.name == 'edit':
                final_content += f"{final_content if final_content else ''}\n\n✨ Your image(s) have been successfully remixed!"

           if formatted_conclusion_text:
               final_content += f"{final_content if final_content else ''}\n\n{formatted_conclusion_text}"


           # Build Embed (only if permission allows)
           if not missing_embeds:
               embed = discord.Embed(
                  title='🖼️ Image Generated Successfully' if interaction.command.name == 'generate' else '🔄 Image Remixed Successfully',
                  description=f"**🎨 Prompt:**\n> {prompt}",
                  color=discord.Color.blue() if interaction.command.name == 'generate' else discord.Color.red() # Using discord.Color enum
               )
               embed.set_author(
                 name=interaction.user.display_name, # Use display_name for server nickname if available
                 icon_url=interaction.user.display_avatar.url # Use display_avatar
               )
               embed.add_field(
                 name='🛠️ Generation Parameters',
                 value=f"• **Theme**: `{theme}`\n"
                       f"• **Model**: `{model_used}`\n"
                       f"• **Aspect Ratio**: `{aspect_ratio}`\n"
                       f"• **Enhanced**: `{'Yes' if enhancement else 'No'}`\n"
                       f"• **Images**: `{actual_num_images}{f' (Requested {num_images_requested})' if num_images_requested != actual_num_images else ''}`"
                       f"{f'\n• **Seed**: `{seed_value}`' if seed_value is not None else ''}",
                 inline=False
               )
               embed.set_timestamp()
               # Store the *current* interaction ID in the footer for future edits
               embed.set_footer(
                 text=f"Created by Elixpo AI | ID: {interaction.id}",
                 icon_url=bot.user.display_avatar.url
               )

               # For /edit, add source field
               if interaction.command.name == 'edit':
                    target_message_id = interaction.options.get("message_id").value
                    requested_index = interaction.options.get("index").value
                    # Construct message link (guild/channel/message)
                    target_message_link = f"https://discord.com/channels/{interaction.guild.id}/{interaction.channel.id}/{target_message_id}" if interaction.guild else f"https://discord.com/channels/@me/{interaction.channel.id}/{target_message_id}"
                    embed.add_field(
                        name='Source',
                        value=f"Remixed from image **#{requested_index}** in [this message]({target_message_link}) (ID: `{target_message_id}`).",
                        inline=False
                    )

               embeds_to_send.append(embed)
           else:
               # Add parameters to content if embeds are missing
               final_content += f"{final_content if final_content else ''}\n\n**🛠️ Generation Parameters:**\n" + \
                                f"• **Theme**: `{theme}`\n" + \
                                f"• **Model**: `{model_used}`\n" + \
                                f"• **Aspect Ratio**: `{aspect_ratio}`\n" + \
                                f"• **Enhanced**: `{'Yes' if enhancement else 'No'}`\n" + \
                                f"• **Images**: `{actual_num_images}{f' (Requested {num_images_requested})' if num_images_requested != actual_num_images else ''}`" + \
                                (f"\n• **Seed**: `{seed_value}`" if seed_value is not None else "")

               if interaction.command.name == 'edit':
                    target_message_id = interaction.options.get("message_id").value
                    requested_index = interaction.options.get("index").value
                    final_content += f"\n• **Source**: Remixed from image #{requested_index} in message ID `{target_message_id}`."


           # --- Add Buttons ---
           # Create a View to hold buttons
           view = discord.ui.View(timeout=None) # Buttons should persist

           # Add Edit button
           edit_button = discord.ui.Button(
               label='Edit / Remix',
               style=discord.ButtonStyle.secondary,
               custom_id='edit_image' # Custom ID to identify the button click later
           )
           view.add_item(edit_button)

           # Add Download buttons
           if actual_num_images == 1:
                first_image_url = generated_images_with_urls[0].get('url') if generated_images_with_urls else None
                # Discord Link Button URL length limit
                DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512
                if first_image_url and len(first_image_url) <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH:
                   # Use Link style button if single image and URL is short enough
                   download_button = discord.ui.Button(
                       label='Download',
                       style=discord.ButtonStyle.link, # Link style opens URL directly
                       url=first_image_url
                   )
                   view.add_item(download_button)
                   print(f"[processQueueDiscord] Added Link button for single image (URL length: {len(first_image_url)}).")
                else:
                    # Fallback to custom ID button if URL too long or unavailable
                    print(f"[processQueueDiscord] URL too long ({len(first_image_url) if first_image_url else 'N/A'} > {DISCORD_LINK_BUTTON_MAX_URL_LENGTH}) or unavailable for single image. Using Primary button with Custom ID.")
                    download_button = discord.ui.Button(
                       label='Download',
                       style=discord.ButtonStyle.primary,
                       custom_id=f'download_{interaction.id}_0' # Custom ID for handler
                    )
                    view.add_item(download_button)
           else: # Multiple images
               for i in range(actual_num_images):
                   download_button = discord.ui.Button(
                       label=f'Download #{i + 1}',
                       style=discord.ButtonStyle.primary,
                       custom_id=f'download_{interaction.id}_{i}' # Custom ID for handler
                   )
                   view.add_item(download_button)
               print(f"[processQueueDiscord] Added {actual_num_images} Primary buttons for multiple images.")

           if view.children: # Check if any buttons were added
               components_to_send.append(view)
           # --- End Buttons ---

           # Cache if any images were generated. Key by the *current* interaction ID.
           if generated_images_with_urls:
               image_cache[interaction.id] = {
                   'data': generated_images_with_urls,
                   'timestamp': time.time() # Use time.time() for float timestamp
               }
               print(f"Stored {len(generated_images_with_urls)} images in cache for interaction {interaction.id} (Type: {interaction.command.name}).")
           else:
               print(f"No images generated for interaction {interaction.id}. Nothing to cache.")


           # Final editReply includes content, embed (if available), files, and components (buttons)
           final_edit_options = {
             'content': final_content,
             'files': generated_attachments,
             'view': view if view.children else None, # Pass the View object if it has children
           }
           if embeds_to_send:
               final_edit_options['embeds'] = embeds_to_send

           await interaction.edit_original_response(**final_edit_options)

        else:
           # If no attachments were generated, send error message
           error_content = ''
           if missing_embeds: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Embed Links'].name.replace('_', ' ').title()}** permission.\n\n"
           if missing_message_content: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Read Message Content'].name.replace('_', ' ').title()}** permission.\n\n"
           if formatted_intermediate_text: error_content += formatted_intermediate_text

           if interaction.command.name == 'generate':
                error_content += f"{error_content if error_content else ''}\n\n⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data."
           elif interaction.command.name == 'edit':
                 error_content += f"{error_content if error_content else ''}\n\n⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data."
           error_content += " Please try again later."

           if formatted_conclusion_text:
               error_content += f"{error_content if error_content else ''}\n\n{formatted_conclusion_text}"

           await interaction.edit_original_response(content=error_content)
           print(f"Image generation/remix failed for interaction {interaction.id} (Type: {interaction.command.name}). No attachments generated.")

    except Exception as e:
        print('Error processing queue / generating/remixing image:', e)
        try:
            # formatted_intermediate_text and formatted_conclusion_text are in scope
            error_content = ''
            if missing_embeds: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Embed Links'].name.replace('_', ' ').title()}** permission.\n\n"
            if missing_message_content: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Read Message Content'].name.replace('_', ' ').title()}** permission.\n\n"
            if formatted_intermediate_text: error_content += formatted_intermediate_text

            error_content += f"{error_content if error_content else ''}\n\n⚠️ An unexpected error occurred while processing your request. Please try again later."
            if formatted_conclusion_text:
               error_content += f"{error_content if error_content else ''}\n\n{formatted_conclusion_text}"

            # Use edit_original_response as interaction was deferred
            await interaction.edit_original_response(content=error_content)
        except Exception as edit_error:
            print("Failed to edit reply with error message:", edit_error)

    finally:
        # Schedule the next item processing
        async with queue_lock: # Re-acquire lock to safely check queue and reschedule
            if queue:
                 asyncio.create_task(process_queue_discord()) # Schedule next processing
            else:
                 is_processing = False # Queue is empty, stop processing

def add_to_queue(interaction: discord.Interaction):
    """Adds an interaction to the queue and starts processing if not already running."""
    global is_processing
    # No need for lock here, list.append is atomic enough for this use case
    queue.append(interaction)
    print(f"Added interaction {interaction.id} (Type: {interaction.command.name}) to queue. Queue size: {len(queue)}")
    # Safely start processing using the flag and task creation
    if not is_processing:
        print("Queue is not processing, starting process_queue_discord.")
        is_processing = True # Mark as processing *before* creating task
        asyncio.create_task(process_queue_discord()) # Schedule the processing task
    else:
        print("Queue is already processing.")


# --- Discord Events ---

@bot.event
async def on_ready():
    print(f'{bot.user} is online and ready!')
    await bot.tree.sync() 
    print("Slash commands synced.")
    bot.loop.create_task(cleanup_cache()) 
    bot.loop.create_task(activity_loop()) 


async def activity_loop():
    """Rotates bot activity status."""
    await bot.wait_until_ready()
    while not bot.is_closed():
        activities = [
            discord.Activity(type=discord.ActivityType.watching, name="Generating Images for You"),
            discord.Activity(type=discord.ActivityType.playing, name="AI Art Creation"),
            discord.Activity(type=discord.ActivityType.listening, name="Your Commands"),
        ]
        random_activity = discord.utils.get(activities, name=random.choice(activities).name)
        await bot.change_presence(activity=random_activity)
        await asyncio.sleep(10 * 60) # Change activity every 10 minutes


@bot.event
async def on_interaction(interaction: discord.Interaction):
    """Handles all interactions (slash commands and components)."""

    # Ignore bots
    if interaction.user.bot:
        return

    # --- Permission Checks (Crucial before any action) ---
    channel = interaction.channel
    bot_member = interaction.guild.me if interaction.guild else None

    if not channel or not bot_member:
        print(f"Interaction occurred in a null channel or botMember is null. ID: {interaction.id}")
        # Cannot reply if channel/member is null, just log and return
        return

    # Use channel.permissions_for() which returns a Permissions object
    bot_permissions = channel.permissions_for(bot_member)

    if not bot_permissions:
        print(f"Could not get permissions for bot in channel. ID: {interaction.id}")
        try:
            await interaction.response.send_message(
                "Could not determine bot permissions for this channel.",
                ephemeral=True
            )
        except Exception as e: print("Error sending permissions check error:", e)
        return

    # --- Handle Chat Input Commands ---
    if interaction.type == discord.InteractionType.application_command and interaction.command:

       # Handle simple commands first (/help, /ping) - these don't need the queue
       if interaction.command.name in ['help', 'ping']:
           # Essential permissions for *any* reply
           essential_permissions_simple = [
                discord.Permissions.view_channel,
                discord.Permissions.send_messages,
           ]
           missing_perms = get_missing_permissions(bot_permissions, essential_permissions_simple)

           if missing_perms:
               try:
                   # Join missing permission names for the message
                   missing_names = [p.replace('_', ' ').title() for p in missing_perms]
                   await interaction.response.send_message(
                       f"⚠️ I am missing the following required permissions to respond in this channel: **{', '.join(missing_names)}**\nPlease ensure I have these permissions.",
                       ephemeral=True
                   )
               except Exception as e: print("Error sending missing permissions message for simple command:", e)
               return # Stop processing this command

           if interaction.command.name == 'help':
               help_message = """
**Elixpo Discord Bot Commands:**

- **`/generate`** - Generate images based on a prompt.
  **Options:** `prompt` (required), `theme`, `model`, `aspect_ratio`, `enhancement`, `number_of_images` (1-4), `seed`.

- **`/edit`** - Remix or edit an existing image. **Use the `message_id` and `index` options to specify the image.**
  **Options:** `message_id` (required), `prompt` (required), `index` (1-4, required), `number_of_images` (1-4, required), `seed`, `aspect_ratio`, `theme`, `enhancement`, `model`. Note: `model` is fixed to `gptimage` for remixing.

- **`/help`** - Display this help message.
- **`/ping`** - Check if the bot is online.
"""
               try: await interaction.response.send_message(help_message, ephemeral=False)
               except Exception as e: print("Error sending help message:", e)

           elif interaction.command.name == 'ping':
               try: await interaction.response.send_message("Yooo! I'm ready to paint xD", ephemeral=False)
               except Exception as e: print("Error sending ping message:", e)

           return # Command handled, exit interaction handler

       # Handle commands that need queueing (/generate, /edit)
       if interaction.command.name in ['generate', 'edit']:
            # --- Fatal Permissions Check (MUST happen before deferring) ---
            required_flags = REQUIRED_PERMISSIONS_EDIT_FATAL if interaction.command.name == 'edit' else REQUIRED_PERMISSIONS_FATAL
            missing_fatal = get_missing_permissions(bot_permissions, required_flags)

            if missing_fatal:
                 try:
                     missing_names = [p.replace('_', ' ').title() for p in missing_fatal]
                     await interaction.response.send_message(
                         f"⚠️ I am missing the following **required** permissions in this channel: **{', '.join(missing_names)}**.\n\nPlease ensure I have them before using the `/{interaction.command.name}` command.",
                         ephemeral=True
                     )
                 except Exception as e:
                     print(f"Error sending FATAL missing permissions message for {interaction.command.name}:", e)
                 return # Stop processing this command

            # --- Non-Fatal Permissions Check (for warnings after deferral) ---
            # Embed Links is needed for the rich embed
            # Read Message Content is needed for /edit if you were to read the original prompt *from* the message content
            # (though current /edit uses embed footer ID, warning is still okay)
            # These are just flags to check, the warnings are added in process_queue_discord
            # The actual checks against bot_permissions happen inside process_queue_discord

            try:
                # Defer the reply before adding to queue
                await interaction.response.defer(ephemeral=False)
            except Exception as e:
                print("Fatal: Could not defer interaction after permission check:", e)
                return # Cannot proceed if defer fails

            # Add the interaction to the queue for processing
            add_to_queue(interaction)
            return # Interaction added to queue, exit handler


    # --- Handle Component Interactions (Buttons) ---
    elif interaction.type == discord.InteractionType.component:
        custom_id = interaction.data.get('custom_id')

        # Handle the Edit button click
        if custom_id == 'edit_image':
            try:
                # Check SendMessages permission before replying
                channel_perms = interaction.channel.permissions_for(interaction.guild.me)
                if channel_perms and channel_perms.has_permissions(send_messages=True):
                    await interaction.response.send_message(
                        "To edit an image, use the `/edit` command and provide the Message ID and Image Index as options.",
                        ephemeral=True
                    )
                else:
                    print(f"Cannot reply to edit button interaction due to missing SendMessages permission in channel {channel.id if channel else 'unknown'}")
            except Exception as e:
                print("Error replying to edit button interaction:", e)
            return # Button handled

        # Handle Download buttons
        if custom_id and custom_id.startswith('download_'):
            # Check essential permissions for sending files
            required_download_perms = [
                 discord.Permissions.send_messages,
                 discord.Permissions.attach_files,
            ]
            missing_download_perms = get_missing_permissions(bot_permissions, required_download_perms)

            if missing_download_perms:
                try:
                    missing_names = [p.replace('_', ' ').title() for p in missing_download_perms]
                    await interaction.response.send_message(
                        f"I do not have the necessary permissions (**{', '.join(missing_names)}**) to provide the image file for download in this channel.",
                        ephemeral=True
                    )
                except Exception as e: print("Error sending fallback permission error for download button:", e)
                return

            parts = custom_id.split('_')
            # Updated check: parts length should be 3 for download_interactionid_index
            if len(parts) != 3 or parts[0] != 'download':
                 print(f"Invalid download button customId format: {custom_id}")
                 try:
                     await interaction.response.send_message(
                         "Could not process the download request due to an invalid button ID format.",
                         ephemeral=True
                     )
                 except Exception as e: print("Error replying to invalid download button:", e)
                 return

            try:
                original_interaction_id = int(parts[1])
                image_index = int(parts[2]) # 0-indexed
            except ValueError:
                 print(f"Invalid interaction ID or index in customId: {custom_id}")
                 try:
                     await interaction.response.send_message(
                         "Could not process the download request due to invalid ID/index in the button.",
                         ephemeral=True
                     )
                 except Exception as e: print("Error replying to invalid download button ID:", e)
                 return


            cache_entry = image_cache.get(original_interaction_id)

            if not cache_entry or 'data' not in cache_entry or image_index < 0 or image_index >= len(cache_entry['data']):
                print(f"Image data not found in cache for interaction {original_interaction_id} index {image_index}. Cache keys: {list(image_cache.keys())}")
                try:
                    await interaction.response.send_message(
                        "Sorry, the image data for this download button has expired or was not found in the cache. Please try generating the image again.",
                        ephemeral=True
                    )
                except Exception as e: print("Error replying when image data not found:", e)
                return

            image_item = cache_entry['data'][image_index] # Get the specific image data object

            # Fetch the image bytes again to create a new discord.File for the ephemeral reply
            image_bytes = await fetch_image_bytes(image_item['url'])

            if not image_bytes:
                 print(f"Failed to refetch image bytes for download button for interaction {original_interaction_id} index {image_index}")
                 try:
                      await interaction.response.send_message(
                          f"Failed to fetch image #{image_index + 1} for download. An error occurred.",
                          ephemeral=True
                      )
                 except Exception as e: print("Error sending fallback fetch error for download button:", e)
                 return

            try:
                image_file = io.BytesIO(image_bytes)
                attachment = discord.File(image_file, filename=f"elixpo_ai_image_{image_index + 1}.jpg")

                await interaction.response.send_message(
                    content=f"Here is image #{image_index + 1}:",
                    files=[attachment],
                    ephemeral=True # Send files ephemeral is usually better
                )
                print(f"Successfully sent image #{image_index + 1} for interaction {original_interaction_id} via button click.")
            except Exception as e:
                print(f"Error replying with image #{image_index + 1} for interaction {original_interaction_id}:", e)
                try:
                    await interaction.response.send_message(
                       content=f"Failed to send image #{image_index + 1}. An error occurred.",
                       ephemeral=True
                    )
                except Exception as e2: print("Error sending fallback error for download button:", e2)

            return # Button handled

        # If it's a button we don't recognise
        print(f"Received unhandled button interaction with custom_id: {custom_id}")
        # Optional: reply to unhandled button clicks ephemeral
        # try:
        #     await interaction.response.send_message("This button is not currently active.", ephemeral=True)
        # except Exception as e: print("Error replying to unhandled button:", e)


# --- Slash Command Definitions ---
# Use @bot.tree.command decorator
# The arguments to the command function correspond to the command options

@bot.tree.command(name="generate", description="Generate images based on a prompt.")
@app_commands.describe(
    prompt="The description of the image you want to generate (required)",
    theme="Apply a specific artistic theme (optional)",
    model="Choose a specific generation model (optional, defaults to flux)",
    aspect_ratio="Set the image aspect ratio (optional, defaults to 3:2)",
    enhancement="Apply automatic image enhancements (optional)",
    number_of_images="Number of images to generate (1-4, optional, defaults to 1)",
    seed="Specify a seed for reproducible results (optional)",
)
@app_commands.choices(
    theme=[
        app_commands.Choice(name="Normal", value="normal"),
        app_commands.Choice(name="Fantasy", value="fantasy"),
        app_commands.Choice(name="Halloween", value="halloween"),
        app_commands.Choice(name="Structure", value="structure"),
        app_commands.Choice(name="Crayon", value="crayon"),
        app_commands.Choice(name="Space", value="space"),
        app_commands.Choice(name="Chromatic", value="chromatic"),
        app_commands.Choice(name="Cyberpunk", value="cyberpunk"),
        app_commands.Choice(name="Anime", value="anime"),
        app_commands.Choice(name="Landscape", value="landscape"),
        app_commands.Choice(name="Samurai", value="samurai"),
        app_commands.Choice(name="WPAP", value="wpap"),
        app_commands.Choice(name="Vintage", value="vintage"),
        app_commands.Choice(name="Pixel", value="pixel"),
        app_commands.Choice(name="Synthwave", value="synthwave"),
    ],
     model=[
        app_commands.Choice(name="Flux", value="flux"),
        app_commands.Choice(name="OpenJourney", value="openjourney"),
        app_commands.Choice(name="GPTImage", value="gptimage"), # User can select, but Remix overrides this
     ],
     aspect_ratio=[
        app_commands.Choice(name="16:9", value="16:9"),
        app_commands.Choice(name="9:16", value="9:16"),
        app_commands.Choice(name="1:1", value="1:1"),
        app_commands.Choice(name="4:3", value="4:3"),
        app_commands.Choice(name="3:2", value="3:2"),
     ]
)
async def generate_command(
    interaction: discord.Interaction,
    prompt: str,
    theme: app_commands.Choice[str] = None,
    model: app_commands.Choice[str] = None,
    aspect_ratio: app_commands.Choice[str] = None,
    enhancement: bool = False,
    number_of_images: app_commands.Range[int, 1, 4] = 1,
    seed: int = None,
):
    # This function is just triggered by the command.
    # The actual processing happens in on_interaction after permission checks and defer.
    # The options are automatically added to interaction.options by discord.py
    pass # Interaction handling continues in on_interaction


@bot.tree.command(name="edit", description="Remix or edit an existing image from a message.")
@app_commands.describe(
    message_id="The ID of the message containing the image embed",
    index="The index of the image within the message (1-4)",
    prompt="The new prompt for remixing (required)",
    number_of_images="Number of new images to generate (1-4, optional, defaults to 1)",
    seed="Specify a seed for reproducible results (optional)",
    aspect_ratio="Set the new image aspect ratio (optional, defaults to original or 3:2)", # Note: Remix model might ignore this
    theme="Apply a new artistic theme (optional)", # Note: Remix model might ignore this
    enhancement="Apply automatic image enhancements (optional)", # Note: Remix model might ignore this
    # model is not an option here as it's fixed to gptimage for remix
)
@app_commands.choices(
    theme=[
        app_commands.Choice(name="Normal", value="normal"),
        app_commands.Choice(name="Fantasy", value="fantasy"),
        app_commands.Choice(name="Halloween", value="halloween"),
        app_commands.Choice(name="Structure", value="structure"),
        app_commands.Choice(name="Crayon", value="crayon"),
        app_commands.Choice(name="Space", value="space"),
        app_commands.Choice(name="Chromatic", value="chromatic"),
        app_commands.Choice(name="Cyberpunk", value="cyberpunk"),
        app_commands.Choice(name="Anime", value="anime"),
        app_commands.Choice(name="Landscape", value="landscape"),
        app_commands.Choice(name="Samurai", value="samurai"),
        app_commands.Choice(name="WPAP", value="wpap"),
        app_commands.Choice(name="Vintage", value="vintage"),
        app_commands.Choice(name="Pixel", value="pixel"),
        app_commands.Choice(name="Synthwave", value="synthwave"),
    ],
     aspect_ratio=[ # Still allow selection even if remix API might ignore
        app_commands.Choice(name="16:9", value="16:9"),
        app_commands.Choice(name="9:16", value="9:16"),
        app_commands.Choice(name="1:1", value="1:1"),
        app_commands.Choice(name="4:3", value="4:3"),
        app_commands.Choice(name="3:2", value="3:2"),
     ]
)
async def edit_command(
    interaction: discord.Interaction,
    message_id: str, # Discord IDs are strings/snowflakes
    index: app_commands.Range[int, 1, 4], # Index 1-4
    prompt: str,
    number_of_images: app_commands.Range[int, 1, 4] = 1,
    seed: int = None,
    aspect_ratio: app_commands.Choice[str] = None,
    theme: app_commands.Choice[str] = None,
    enhancement: bool = False,
):
    # This function is just triggered by the command.
    # The actual processing happens in on_interaction after permission checks and defer.
    # The options are automatically added to interaction.options by discord.py
    pass # Interaction handling continues in on_interaction


@bot.tree.command(name="help", description="Show help information for the bot.")
async def help_command(interaction: discord.Interaction):
    # Handled directly in on_interaction
    pass

@bot.tree.command(name="ping", description="Check if the bot is online.")
async def ping_command(interaction: discord.Interaction):
    # Handled directly in on_interaction
    pass

bot.run(DISCORD_TOKEN)