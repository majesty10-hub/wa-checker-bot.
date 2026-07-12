const { default: makeWASocket, useEphemeralState, delay } = require('@whiskeysockets/baileys');
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
    console.error("❌ [ERROR] TELEGRAM_TOKEN belum diatur di GitHub Secrets!");
    process.exit(1);
}

const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
let waSock = null;
let isPairing = false;

// ==========================================
// TAMPILAN MENU UTAMA (AESTHETIC STYLE)
// ==========================================
tgBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const status = waSock ? '🟢 🟢 Connected' : '🔴 🔴 Disconnected';
    
    const menu = `✨ ━━━ 🪐 <b>𝕎𝔸 ℂℍ𝔼ℂ𝕂𝔼ℝ 𝕧𝟝.𝟝</b> 🪐 ━━━ ✨\n\n` +
                 `📊 <b>𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗘𝗦𝗜𝗡 :</b>\n` +
                 `» 🧭 Engine: <code>Baileys Multi-Device</code>\n` +
                 `» ⚡ Status: <b>${status}</b>\n\n` +
                 `━━━━━━━ 🔮 <b>𝗠𝗘𝗡𝗨 𝗕𝗢𝗧</b> 🔮 ━━━━━━━\n` +
                 `📲 <b>/kirimkode</b>\n` +
                 `└─ <i>Hubungkan WhatsApp via kode pairing global</i>\n\n` +
                 `🔍 <b>/cek [nomor]</b>\n` +
                 `└─ <i>Cek status ketersediaan nomor WA</i>\n\n` +
                 `✨ ━━━━━━━━━━━━━━━━━━━━━━━━ ✨`;
                 
    tgBot.sendMessage(chatId, menu, { parse_mode: 'HTML' });
});

// ==========================================
// PROSES REQUEST PAIRING
// ==========================================
tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    
    const petunjuk = `📞 ━━━ 🌍 <b>𝗜𝗡𝗧𝗘𝗥𝗡𝗔𝗧𝗜𝗢𝗡𝗔𝗟 𝗣𝗔𝗜𝗥𝗜𝗡𝗚</b> 🌍 ━━━ 📞\n\n` +
                     `Silakan masukkan nomor WhatsApp tumbal Anda.\n\n` +
                     `⚠️ <b>𝗣𝗘𝗡𝗧𝗜𝗡𝗚 :</b>\n` +
                     `• Wajib gunakan kode negara di depan nomor!\n` +
                     `• Tanda plus (<b>+</b>) atau spasi diperbolehkan.\n\n` +
                     `💡 <b>𝗖𝗼𝗻𝘁𝗼𝗵 𝗙𝗼𝗿𝗺𝗮𝘁 :</b>\n` +
                     `» 🇮🇩 Indonesia : <code>+62882020925445</code>\n` +
                     `» 🇺🇸 Luar Negeri : <code>+13125550123</code>\n\n` +
                     `👉 <i>Silakan ketik dan kirim nomornya sekarang...</i>`;
                     
    tgBot.sendMessage(chatId, petunjuk, { parse_mode: 'HTML' });
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (isPairing && /^\+?\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ <i>Sedang menyiapkan mesin & meminta kode dari server WhatsApp...</i>', { parse_mode: 'HTML' });
        
        try {
            waSock = makeWASocket({
                auth: useEphemeralState(),
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false
            });

            let formattedNum = text.replace(/[^0-9]/g, '');
            await delay(3000);
            
            if (waSock) {
                let code = await waSock.requestPairingCode(formattedNum);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const suksesKode = `🔑 ━━━ ✨ <b>𝗞𝗢𝗗𝗘 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗔𝗡𝗗𝗔</b> ✨ ━━━ 🔑\n\n` +
                                   `👉 📋 <code>${code}</code> 📋 👈\n\n` +
                                   `💡 <b>𝗖𝗮𝘁𝗮𝘁𝗮𝗻 :</b>\n` +
                                   `└─ <i>Segera masukkan kode di atas pada menu WhatsApp Anda: <b>Perangkat Tertaut</b> -> <b>Tautkan dengan nomor telepon</b> sebelum kedaluwarsa!</i>`;
                                   
                tgBot.sendMessage(chatId, suksesKode, { parse_mode: 'HTML' });
            } else {
                tgBot.sendMessage(chatId, '❌ <b>Gagal :</b> Mesin WhatsApp mendadak tidak merespons.', { parse_mode: 'HTML' });
            }
        } catch (err) {
            tgBot.sendMessage(chatId, `❌ <b>𝗘𝗿𝗼𝗿 𝗦𝘆𝘀𝘁𝗲𝗺 :</b> <code>${err.message}</code>`, { parse_mode: 'HTML' });
        }
    } 
    
    // ==========================================
    // PROSES FITUR CEK NOMOR
    // ==========================================
    else if (text.startsWith('/cek')) {
        if (!waSock) {
            return tgBot.sendMessage(chatId, '🔴 <b>Akses Ditolak :</b> Hubungkan WhatsApp dulu via perintah /kirimkode', { parse_mode: 'HTML' });
        }
        
        const args = text.split(' ');
        if (args.length < 2) {
            return tgBot.sendMessage(chatId, '❌ <b>Format Salah!</b>\nContoh: <code>/cek +62882020925445</code>', { parse_mode: 'HTML' });
        }
        
        let targetNum = args[1].replace(/[^0-9]/g, '');
        tgBot.sendMessage(chatId, `🔍 <i>Sedang memindai database WhatsApp untuk nomor +${targetNum}...</i>`, { parse_mode: 'HTML' });
        
        try {
            const [result] = await waSock.onWhatsApp(targetNum);
            if (result && result.exists) {
                const aktif = `✅ ━━━ 🎯 <b>𝗛𝗔𝗦𝗜𝗟 𝗣𝗘𝗠𝗜𝗡𝗗𝗔𝗛𝗔𝗡</b> 🎯 ━━━ ✅\n\n` +
                              `📱 Nomor : <code>+${targetNum}</code>\n` +
                              `⚡ Status : <b>⚡ AKTIF / TERDAFTAR ⚡</b>\n\n` +
                              `🟢 <i>Nomor ini menggunakan WhatsApp dan siap menerima pesan.</i>`;
                tgBot.sendMessage(chatId, aktif, { parse_mode: 'HTML' });
            } else {
                const tidakAktif = `❌ ━━━ 🎯 <b>𝗛𝗔𝗦𝗜𝗟 𝗣𝗘𝗠𝗜𝗡𝗗𝗔𝗛𝗔𝗡</b> 🎯 ━━━ ❌\n\n` +
                                   `📱 Nomor : <code>+${targetNum}</code>\n` +
                                   `Status : <b>🔴 TIDAK TERDAFTAR 🔴</b>\n\n` +
                                   `⚠️ <i>Nomor tidak terdeteksi di server WhatsApp.</i>`;
                tgBot.sendMessage(chatId, tidakAktif, { parse_mode: 'HTML' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ <b>Gagal Memindai :</b> <code>${error.message}</code>`, { parse_mode: 'HTML' });
        }
    }
});
