import { Client, GatewayIntentBits } from "discord.js";

const TRANSLATE_APIURL = Bun.env.TRANSLATE_APIURL;
const DISCORD_TOKEN = Bun.env.DISCORD_TOKEN;

let channels;
let channelIds;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  getChannelNames();
});

client.on("channelUpdate", (oldChannel, newChannel) => {
  if (
    oldChannel.parent.name.toLowerCase().includes("translate") &&
    oldChannel.name !== newChannel.name
  ) {
    console.log(
      `Channel name changed from "${oldChannel.name}" to "${newChannel.name}"`
    );
    getChannelNames();
  }
});

client.on("channelCreate", async (channel) => {
  console.log(`Channel created: ${channel.name} (ID: ${channel.id})`);
  if (channel.parent.name.toLowerCase().includes("translate")) {
    getChannelNames();
  }
});

client.on("channelDelete", async (channel) => {
  console.log(`Channel deleted: ${channel.name} (ID: ${channel.id})`);
  if (channel.parent.name.toLowerCase().includes("translate")) {
    getChannelNames();
  }
});

client.on("messageCreate", async (message) => {
  var idx = channelIds.indexOf(message.channel.id);
  if (
    !message.guild ||
    idx < 0 ||
    message.author.bot ||
    message.webhookID ||
    message.content.substring(0, 2) == "$s"
  )
    return;

  try {
    await Promise.all(
      channels.map(async (e, i) => {
        if (i !== idx) {
          var content = "";
          if (message.content && message.content.substring(0, 2) !== "$n") {
            const result = extractAndRemoveUrls(message.content);
            if (result.text) {
              const translationResponse = await Bun.fetch(TRANSLATE_APIURL, {
                method: "POST",
                body: JSON.stringify({
                  q: result.text,
                  source: channels[idx].lang,
                  target: e.lang,
                  format: "text",
                }),
                headers: { "Content-Type": "application/json" },
              });
              const translationData = await translationResponse.json();
              content += translationData.translatedText;
            }
            if (result.extractedUrls.length) {
              console.log("Extracted URLs:", result.extractedUrls);
              content += `\n${result.extractedUrls.join(" ")}`;
            }
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
            username: message.member.nickname
              ? message.member.nickname
              : message.author.displayName,
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

function extractAndRemoveUrls(text) {
  const urlRegex = /https?:\/\/[^\s]+/g; // Match URLs starting with http or https
  const matches = text.matchAll(urlRegex);
  const extractedUrls = [];

  let newText = text;
  for (const match of matches) {
    extractedUrls.push(match[0]);
    newText = newText.replace(match[0], "");
  }

  return {
    extractedUrls,
    text: newText,
  };
}

async function getChannelNames() {
  const chs = client.guilds.cache.first()?.channels.cache.values();

  if (!chs) {
    console.log("No channels found.");
    return;
  }

  channels = [];
  channelIds = [];

  for (const channel of chs) {
    const category = channel.parent;
    if (category && category.name.toLowerCase().includes("translate")) {
      const webhooks = await channel.fetchWebhooks();
      let webhook;
      if (webhooks.size) {
        webhook = webhooks.first();
      } else {
        webhook = await channel.createWebhook({
          name: "Webhook",
        });
        console.log("Webhook created for " + channel.name);
      }
      channels.push({
        lang: channel.name.slice(-2),
        webhook: webhook,
      });
      channelIds.push(channel.id);
    }
  }
  console.log("Built channel list");
}
