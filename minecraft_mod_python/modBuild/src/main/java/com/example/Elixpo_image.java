package com.example;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Elixpo_image implements ModInitializer {
	public static final String MOD_ID = "elixpo_image";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		LOGGER.info("Elixpo mod initialized!");

		// Register the /elixpo command
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
			dispatcher.register(CommandManager.literal("elixpo").executes(context -> {
				ServerCommandSource source = context.getSource();
				source.sendMessage(Text.literal("hello budy")); // Sends message to the command issuer
				return 1; // Return success
			}));
		});
	}
}
