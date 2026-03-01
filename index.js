const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const OpenAI = require('openai');
require('dotenv').config();

const TOKEN = process.env.DISCORD;
const OPENAI_KEY = process.env.OPENAI;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Configuração OpenAI (CommonJS v4+)
const openai = new OpenAI({
  apiKey: OPENAI_KEY
});

// Moderação
const spamMap = new Map();
const linkRegex = /(https?:\/\/|www\.|discord\.gg|\.com|\.net|\.gg|\.org)/i;

client.once("clientReady", () => {
  console.log(`Bot Cleiton online!`);
});

client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const member = message.member;

  // Somente membros com cargo ou sem cargo podem interagir com Cleiton
  if (member.roles.cache.size === 0 && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return; // Não faz nada se não tiver cargo
  }

  const content = message.content;
  const userId = message.author.id;

  let motivo = null;
  let tempo = 0;
  let apagarSpam = false;

  // Detecta links
  if (linkRegex.test(content)) {
    motivo = "Envio de link";
    tempo = 15;
  } else if (content.length >= 300) {
    motivo = "Mensagem muito longa";
    tempo = 3;
  } else {
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    if (emojiCount > 10) {
      motivo = "Excesso de emojis";
      tempo = 2;
    }
  }

  // Spam de caracteres repetidos
  if (!motivo && /(.)\1{8,}/.test(content)) {
    motivo = "Spam de caracteres";
    tempo = 4;
  }

  // Spam real (3 mensagens em 5 segundos)
  if (!motivo) {
    if (!spamMap.has(userId)) {
      spamMap.set(userId, { count: 1, lastMessage: Date.now() });
    } else {
      const data = spamMap.get(userId);
      const now = Date.now();

      if (now - data.lastMessage < 5000) {
        data.count++;
        if (data.count >= 3) {
          motivo = "Spam detectado";
          tempo = 5;
          apagarSpam = true;
          data.count = 0;
        }
      } else {
        data.count = 1;
      }

      data.lastMessage = now;
      spamMap.set(userId, data);
    }
  }

  if (motivo) {
    await punir(member, message, motivo, tempo, apagarSpam);
  }

  // Responder menções com IA (barata juíza)
  if (message.mentions.has(client.user)) {
    // Apenas se o membro tem cargo ou não tem cargo
    if (member.roles.cache.size === 0 || member.roles.cache.size > 0) {
      const promptUser = message.content.replace(/<@!?(\d+)>/, '').trim();
      if (!promptUser) return;

      const prompt = `
Você é uma barata que atua como juiz no Discord, mas seu nome de bot é Cleiton.
Você é rigorosa, justa, irônica e engraçada.
Você lê a mensagem do usuário e decide se infringe regras (spam, links, emojis demais, mensagens longas).
Se for infração, diga o motivo e como Cleiton aplicaria a punição.
Se não for infração, apenas converse normalmente, mantendo a personalidade de barata juíza.
Mensagem do usuário: "${promptUser}"
`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7
        });

        const reply = response.choices[0].message.content;
        message.reply(reply);
      } catch (err) {
        console.error("Erro OpenAI:", err);
      }
    }
  }
});

async function punir(member, message, motivo, minutos, apagarSpam = false) {
  if (member.communicationDisabledUntilTimestamp > Date.now()) return;

  const tempoMs = minutos * 60 * 1000;

  try {
    if (apagarSpam) {
      const messages = await message.channel.messages.fetch({ limit: 10 });
      const userMessages = messages.filter(msg => msg.author.id === member.id);
      await message.channel.bulkDelete(userMessages, true);
    } else {
      await message.delete();
    }
  } catch (err) {
    console.log("Erro ao deletar:", err.message);
  }

  try {
    await member.timeout(tempoMs, motivo);
  } catch (err) {
    console.log("Erro ao mutar:", err.message);
  }

  const aviso = await message.channel.send(
    `🔇 ${member.user.username} silenciado por ${minutos} minuto(s).\nMotivo: ${motivo}`
  );

  setTimeout(() => {
    aviso.delete().catch(() => {});
  }, 5000);
}

// Servidor web mínimo (Railway/Render)
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot Cleiton online!'));
app.listen(3000, () => console.log('Servidor rodando na porta 3000'));

client.login(TOKEN);
