import { Client, GatewayIntentBits, WebhookClient } from "discord.js";

const TRANSLATE_APIURL = Bun.env.TRANSLATE_APIURL;
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
  if (!message.guild || idx < 0 || message.author.bot || message.webhookID || message.content.substring(0,2) == "$s")
    return;

  try {
    await Promise.all(
      channels.map(async (e, i) => {
        if (i !== idx) {
          var content = "";
          if (message.content && message.content.substring(0,2) !== "$n") {
            const translationResponse = await Bun.fetch(
              TRANSLATE_APIURL,
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
            content += translationData.translatedText;
          } else {
            content += message.content;
          }

          if (message.attachments.size > 0) {
            content += "\n";
            for (const attachment of message.attachments.values()) {
              const attachmentUrl = attachment.url;
              content += `${attachmentUrl} `;
            }
          }

          await e.webhook.send({
            content: content,
            username: message.member.nickname,
            avatarURL:
              message.author.avatarURL() || message.author.defaultAvatarURL,
          });

          console.log(
            `Translated "${message.content}" to "${content}" and sent to target channel.`
          );
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
