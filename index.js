import { Client, GatewayIntentBits, SlashCommandBuilder } from "discord.js";
import { DateTime } from "luxon";

const TRANSLATE_APIURL = Bun.env.TRANSLATE_APIURL;
const DISCORD_TOKEN = Bun.env.DISCORD_TOKEN;

const serverData = new Map();

const errStr =
  "Invalid time format. Please provide the time in the format HH:MM.";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.MessageContent,
  ],
});

const extractAndRemoveUrls = function (text) {
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
};

const getChannelNames = async function (serverId) {
  const chs = client.guilds.cache.get(serverId)?.channels.cache.values();

  if (!chs) {
    console.log("No channels found.");
    return;
  }

  let channels = [];
  let channelIds = [];

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
  serverData.set(serverId, {
    channels: channels,
    channelIds: channelIds
  });
  console.log("Built channel list for guild: " + serverId);
};

const getResStr = function (utcTimestamp) {
  return `<t:${utcTimestamp}:t> ->   \\<t:${utcTimestamp}:t>\n<t:${utcTimestamp}:R> ->   \\<t:${utcTimestamp}:R>`;
};

client.on("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  //client.user.setPresence({ activities: [{ name: 'At your service' }], status: 'online' });

  client.guilds.cache.forEach((guild) => {
    getChannelNames(guild.id);
  });

  const atCommand = new SlashCommandBuilder()
    .setName("at")
    .setDescription(
      "Converts a given time in a specific timezone to a UTC Discord timestamp."
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("The time in the format HH:MM")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("timezone")
        .setDescription("Your local timezone.")
        .setRequired(true)
        .addChoices(
          { name: "PST - Pacific Standard Time (UTC-8)", value: "UTC-8" },
          { name: "MST - Mountain Standard Time (UTC-7)", value: "UTC-7" },
          { name: "CST - Central Standard Time (UTC-6)", value: "UTC-6" },
          { name: "EST - Eastern Standard Time (UTC-5)", value: "UTC-5" },
          { name: "CET - Central European Time (UTC+1)", value: "UTC+1" },
          { name: "EET - Eastern European Time (UTC+2)", value: "UTC+2" },
          { name: "WET - Western European Time (UTC+0)", value: "UTC+0" },
          { name: "IST - India Standard Time (UTC+5:30)", value: "UTC+5:30" }
        )
    );
  client.application.commands.create(atCommand);

  const inCommand = new SlashCommandBuilder()
    .setName("in")
    .setDescription("Converts given hours/minutes to a UTC Discord timestamp.")
    .addStringOption((option) =>
      option.setName("hours").setDescription("How many hours from now.")
    )
    .addStringOption((option) =>
      option.setName("minutes").setDescription("How many minutes from now.")
    );
  client.application.commands.create(inCommand);
});

client.on('guildCreate', (guild) => {
  getChannelNames(guild.id);
});

client.on("channelUpdate", (oldChannel, newChannel) => {
  if (
    oldChannel.parent?.name.toLowerCase().includes("translate") &&
    oldChannel.name !== newChannel.name
  ) {
    getChannelNames(oldChannel.guild.id);
    console.log(
      `Channel name changed from "${oldChannel.name}" to "${newChannel.name}"`
    );
  }
});

client.on("channelCreate", async (channel) => {
  if (channel.parent?.name.toLowerCase().includes("translate")) {
    getChannelNames(channel.guild.id);
  }
  console.log(`Channel created: ${channel.name} (ID: ${channel.id})`);
});

client.on("channelDelete", async (channel) => {
  if (channel.parent?.name.toLowerCase().includes("translate")) {
    getChannelNames(channel.guild.id);
  }
  console.log(`Channel deleted: ${channel.name} (ID: ${channel.id})`);
});

client.on("messageCreate", async (message) => {

  const server = serverData.get(message.guild.id);
  const channels = server.channels;
  const channelIds = server.channelIds;

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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === "at") {
    const timeString = options.get("time").value;
    const timezoneString = options.get("timezone").value;
    try {
      const dateTime = DateTime.fromFormat(timeString, "HH:mm", {
        zone: timezoneString,
      });
      const utcTimestamp = dateTime.setZone("UTC").toUnixInteger();

      await interaction.reply({
        content: getResStr(utcTimestamp),
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({
        content: errStr + error,
        ephemeral: true,
      });
    }
  }

  if (commandName === "in") {
    const hours = options.get("hours")?.value;
    const minutes = options.get("minutes")?.value;
    try {
      const currentDateTime = DateTime.utc();
      const utcTimestamp = currentDateTime
        .plus({ hours: hours, minutes: minutes })
        .toUnixInteger();

      await interaction.reply({
        content: getResStr(utcTimestamp),
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({
        content: errStr + error,
        ephemeral: true,
      });
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error("Login error:", error);
});
