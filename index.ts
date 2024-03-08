import { Bot, WebhookClient, Intents } from "discordeno";
import { TextChannel } from "https://deno.land/x/discordeno@v1.7.0/cache.ts";

// Replace with your actual environment variables
const DISCORD_TOKEN = Bun.env("DISCORD_TOKEN");
const TRANSLATION_API_KEY = Bun.env("TRANSLATION_API_KEY");
const SOURCE_CHANNEL_ID = Bun.env("SOURCE_CHANNEL_ID");
const TARGET_CHANNEL_WEBHOOK_URL = Bun.env("TARGET_CHANNEL_WEBHOOK_URL");

const intents = new Intents(Intents.DEFAULT_GUILDS | Intents.FLAGS.GUILD_MESSAGES);
const client = new Bot({ intents });

client.event.ready = async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
};

client.event.messageCreate = async (message) => {
  if (!message.guild || message.channel.id !== SOURCE_CHANNEL_ID) return;

  const targetChannel = message.guild.channels.cache.get(TARGET_CHANNEL_WEBHOOK_URL.split("/").pop()) as TextChannel; // Extract channel ID from webhook URL
  if (!targetChannel) {
    console.error("Target channel not found!");
    return;
  }

  const webhook = new WebhookClient(TARGET_CHANNEL_WEBHOOK_URL);

  try {
    const translationResponse = await fetch("https://translate.sahajjain.com/translate", {
      method: "POST",
      body: JSON.stringify({
        q: message.content,
        source: "auto",
        target: "en", // You can replace 'en' with your desired target language
        format: "text",
        api_key: TRANSLATION_API_KEY,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const translationData = await translationResponse.json();
    const translatedText = translationData.translatedText;

    await webhook.send({
      content: translatedText,
      username: message.author.username,
      avatarURL: message.author.avatarURL() || message.author.defaultAvatarURL, // Include avatar
    });

    console.log(`Translated "${message.content}" to "${translatedText}" and sent to target channel.`);
  } catch (error) {
    console.error("Error during translation or webhook sending:", error);
  }
};

client.run(DISCORD_TOKEN).catch((error) => {
  console.error("Login error:", error);
});