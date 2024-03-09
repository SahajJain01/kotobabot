import { Client, GatewayIntentBits, WebhookClient } from "discord.js";

const DISCORD_TOKEN = Bun.env.DISCORD_TOKEN;
const CHANNEL_IDS = Bun.env.CHANNEL_IDS.split(",");
const CHANNEL_LANGS = Bun.env.CHANNEL_LANGS.split(",");
const WEBHOOK_IDS = Bun.env.WEBHOOK_IDS.split(",");
const WEBHOOK_TOKENS = Bun.env.WEBHOOK_TOKENS.split(",");

const channels = CHANNEL_IDS.map((e, i) => {
  return {
    id: e,
    lang: CHANNEL_LANGS[i],
    webhook: new WebhookClient({
      id: WEBHOOK_IDS[i],
      token: WEBHOOK_TOKENS[i],
    }),
  };
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on("messageCreate", async (message) => {
  var idx = CHANNEL_IDS.indexOf(message.channel.id);
  if (!message.guild || idx < 0 || message.author.bot || message.webhookID)
    return;

  try {
    await Promise.all(
      channels.map(async (e, i) => {
        if (i !== idx) {
          const translationResponse = await Bun.fetch(
            "https://translate.sahajjain.com/translate",
            {
              method: "POST",
              body: JSON.stringify({
                q: message.content,
                source: channels[idx].lang,
                target: e.lang,
                format: "text",
              }),
              headers: { "Content-Type": "application/json" },
            }
          );

          const translationData = await translationResponse.json();
          const translatedText = translationData.translatedText;

          await e.webhook.send({
            content: translatedText,
            username: message.author.globalName,
            avatarURL:
              message.author.avatarURL() || message.author.defaultAvatarURL,
          });

          console.log(
            `Translated "${message.content}" to "${translatedText}" and sent to target channel.`
          );

          if(message.attachments.size > 0) {
            const targetChannel = message.guild.channels.cache.get(e.id);
            for (const attachment of message.attachments.values()) {
              const attachmentUrl = attachment.url;
              const fileName = attachment.name;
              try {
                await targetChannel.send({
                  content: `**${message.author.globalName}:**`,
                  files: [{ attachment: attachmentUrl, name: fileName }],
                });
                console.log(`Successfully forwarded attachment: ${fileName}`);
              } catch (error) {
                console.error(`Error forwarding attachment: ${error}`);
              }
            }
          }
        }
      })
    );
  } catch (error) {
    console.error("Error during translation or webhook sending:", error);
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error("Login error:", error);
});
