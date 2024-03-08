import { Client, GatewayIntentBits, WebhookClient } from "discord.js";

// Replace with your actual environment variables
const DISCORD_TOKEN = Bun.env.DISCORD_TOKEN;
const SOURCE_CHANNEL_ID = Bun.env.SOURCE_CHANNEL_ID;
const WEBHOOK_ID = Bun.env.WEBHOOK_ID;
const WEBHOOK_TOKEN = Bun.env.WEBHOOK_TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});


client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.channel.id !== SOURCE_CHANNEL_ID) return;

  const webhook = new WebhookClient({ id: WEBHOOK_ID, token: WEBHOOK_TOKEN });

  try {
    const translationResponse = await Bun.fetch("https://translate.sahajjain.com/translate", {
      method: "POST",
      body: JSON.stringify({
        q: message.content,
        source: "en",
        target: "de",
        format: "text"
      }),
      headers: { "Content-Type": "application/json" },
    });

    const translationData = await translationResponse.json();
    console.log(message)
    const translatedText = translationData.translatedText;

    await webhook.send({
      content: translatedText,
      username: message.author.globalName,
      avatarURL: message.author.avatarURL() || message.author.defaultAvatarURL,
    });

    console.log(`Translated "${message.content}" to "${translatedText}" and sent to target channel.`);
  } catch (error) {
    console.error("Error during translation or webhook sending:", error);
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error("Login error:", error);
});