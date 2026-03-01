const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fetch = require('node-fetch');
require('dotenv').config();

const TOKEN = process.env.DISCORD;
const HUGGING_KEY = process.env.HUGGING_FACE_API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// MODERAÇÃO
const spamMap = new Map();
const linkRegex = /(https?:\/\/|www\.|discord\.gg|\.com|\.net|\.gg|\.org)/i;

client.once("clientReady", () => {
  console.log(`Cleiton online!`);
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const member = message.member;

  // ---------- MODERAÇÃO: apenas membros sem cargo ----------
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator) && member.roles.cache.size === 0) {
    const content = message.content;
    const userId = message.author.id;

    let motivo = null;
    let tempo = 0;
    let apagarSpam = false;

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
  }

  // ---------- RESPOSTA DO CLEITON (IA Hugging Face) ----------
  if (message.mentions.users.has(client.user.id)) {
    const textoUsuario = message.content.replace(/<@!?(\d+)>/, '').trim();
    if (!textoUsuario) return;

    const prompt = `Você é uma barata juíza chamada Cleiton no Discord. Responda de forma curta, irônica e engraçada à seguinte mensagem: "${textoUsuario}"`;

    try {
      const reply = await gerarRespostaHugging(prompt);
      message.reply(reply);
    } catch (err) {
      console.error("Erro IA Hugging:", err);
      message.reply("🤖 Cleiton está confuso... 🪳");
    }
  }
});

// ---------- FUNÇÃO PARA GERAR RESPOSTA HUGGING FACE ----------
async function gerarRespostaHugging(prompt) {
  const model = "gpt2-large"; // modelo leve, respostas curtas
  const url = `https://api-inference.huggingface.co/models/${model}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HUGGING_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 30, // respostas curtas
        temperature: 0.7,
        repetition_penalty: 1.2
      }
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return Array.isArray(data) ? data[0].generated_text : data.generated_text;
}

// ---------- FUNÇÃO DE PUNIÇÃO ----------
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

// ---------- SERVIDOR WEB PARA 24H ----------
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Cleiton online!'));
app.listen(3000, () => console.log('Servidor rodando na porta 3000'));

client.login(TOKEN);
