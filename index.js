const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8900613624:AAGHTnoVyf_Uia52E_fYNTDa-sYk9EJuzic";

const BotClass = TelegramBot.default || TelegramBot;
const bot = new BotClass(TELEGRAM_BOT_TOKEN, { polling: true });
let sock = null;
let isConnecting = false;

let cacheFileData = {};
let cacheHasilScan = {};

function sendMenu(chatId) {
    bot.sendMessage(chatId, "🤖 ─── 𝕎𝕊 ℂℍ𝔼減𝕂𝔼ℝ 𝕧𝟛.𝟠 ─── 🤖\n« 𝘾𝙤𝙧ε 𝙎𝙮𝙨𝙩ε𝙢 𝙊𝙣λ𝙞𝙣ε »\n\n⚙️ Silakan pilih modul kendali di bawah untuk mengelola perangkat:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡ Sambungkan Perangkat (Pairing)", callback_data: "sambungkan" }],
                [{ text: "📊 Monitor Status Sistem", callback_data: "status" }]
            ]
        }
    });
}

async function hubungkanKeWhatsApp(nomorHPTumbal = null, chatId = null, isRetry = false, forceNewSession = false) {
    if (isConnecting && !isRetry && !forceNewSession) return;
    isConnecting = true;

    // KUNCI 1: Hapus auto-delete file saat force login baru agar sesi dari GitHub aman
    const { state, saveCreds } = await useMultiFileAuthState('.');
    
    sock = makeWASocket({ 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false,
        browser: ["Windows", "Chrome", "10.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            // KUNCI 2: Di sini auto-delete kita matikan total agar Railway tidak bisa menghapus creds.json hasil upload lu
            if (statusCode === DisconnectReason.loggedOut) {
                console.log("[🚨 SYSTEM WARNING] Sender VALID Banned/Logout!");
                if (chatId) {
                    bot.sendMessage(chatId, `🚨 Akun terputus atau terblokir. Sesi di server tetap dipertahankan. Silakan periksa perangkat Anda.`);
                }
            } 
            else {
                if (state.creds && state.creds.me && state.creds.me.id) {
                    console.log(`[SYSTEM] Mencoba hubungkan ulang...`);
                    await delay(5000); 
                    hubungkanKeWhatsApp(null, chatId, true, false);
                }
            }
        } 
        else if (connection === 'open') {
            isConnecting = false;
            console.log(`[SYSTEM] WhatsApp Client Connected: +${sock.user.id.split(':')[0]}`);
            if (chatId) {
                bot.sendMessage(chatId, `🛸 **[CONNECTION ESTABLISHED]**\n\n🟢 **MAINFRAME ACTIVE 100%**\n🤖 Node ID: \`+${sock.user.id.split(':')[0]}\`\n🛰️ Status: Siap digunakan!`, { parse_mode: 'Markdown' });
            }
        }
    });

    if (nomorHPTumbal) {
        try {
            let nomorBersih = nomorHPTumbal.replace(/[^0-9]/g, '');
            if (nomorBersih.startsWith('08')) nomorBersih = '628' + nomorBersih.slice(2);
            await delay(2500);
            const code = await sock.requestPairingCode(nomorBersih);
            const teksKode = code?.match(/.{1,4}/g)?.join('-') || code;
            if (chatId) bot.sendMessage(chatId, `🔑 Kode Otorisasi: \`${teksKode}\``);
        } catch (err) {
            isConnecting = false;
            if (chatId) bot.sendMessage(chatId, "❌ Gagal mendapatkan kode pairing.");
        }
    }
}

async function prosesCekNomor(targetRaw) {
    let target = targetRaw.toString().trim().replace(/[^0-9]/g, '');
    if (target.startsWith('08')) target = '628' + target.slice(2);
    if (target.length < 7) return { status: 'TIDAK_TERDAFTAR', nomor: targetRaw };
    
    const jid = target + '@s.whatsapp.net';
    try {
        const [result] = await sock.onWhatsApp(jid);
        if (result && result.exists) {
            let tipeAkun = "REGULAR AKUN 👤";
            let bio = "*(Privacy Restricted/Kosong)*";
            let waktuBio = "Tidak Diketahui";

            if (result.biz === true || (result.jid && result.jid.includes('biz'))) {
                tipeAkun = "BISNIS AKUN 🏢";
            }
            try {
                const statusData = await sock.fetchStatus(result.jid);
                if (statusData && statusData.status) {
                    bio = statusData.status;
                    if (statusData.setAt) {
                        waktuBio = new Date(statusData.setAt).toLocaleDateString('id-ID', {
                            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        }) + " WIB";
                    }
                }
            } catch (e) {}
            return { status: 'TERDAFTAR', nomor: target, tipe: tipeAkun, bio: bio, waktu: waktuBio };
        }
        return { status: 'TIDAK_TERDAFTAR', nomor: target };
    } catch (err) {
        return { status: 'TIDAK_TERDAFTAR', nomor: target };
    }
}

// ... (Sisa fungsi bulk cek file dll dipertahankan agar tidak eror)
async function jalankanBulkCekFile(chatId, messageId, daftarNomor, modePilihan) {
    let totalNomorAwal = daftarNomor.length; if (modePilihan === 'random') daftarNomor = daftarNomor.sort(() => 0.5 - Math.random()).slice(0, 100);
    const totalNomor = daftarNomor.length;
    try {
        let listBisnis = [], listBiasa = [], tidakTerdaftarCount = 0, counter = 0, logDetailTeks = "";
        for (let item of daftarNomor) {
            if (!sock || !sock.user) return; counter++; const res = await prosesCekNomor(item);
            if (res.status === 'TERDAFTAR') {
                logDetailTeks += `[OK] +${res.nomor} - ${res.tipe}\n`;
                if (res.tipe.includes('BISNIS')) listBisnis.push(`+${res.nomor}`); else listBiasa.push(`+${res.nomor}`);
            } else { tidakTerdaftarCount++; }
            await delay(400);
        }
        cacheHasilScan[chatId] = { totalAwal: totalNomorAwal, totalProses: totalNomor, mode: modePilihan, bisnis: listBisnis, biasa: listBiasa, matiCount: tidakTerdaftarCount, logDetail: logDetailTeks };
        await kirimHasilSebagaiFile(chatId, messageId);
    } catch(e) {}
}
async function kirimHasilSebagaiFile(chatId, messageId) {
    const data = cacheHasilScan[chatId]; if (!data) return;
    const namaFileHasil = `Hasil_${Date.now()}.txt`; fs.writeFileSync(namaFileHasil, data.logDetail);
    await bot.sendDocument(chatId, namaFileHasil); fs.unlinkSync(namaFileHasil);
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'sambungkan') {
        bot.sendMessage(chatId, "📟 Masukkan nomor WhatsApp target pairing:", { reply_markup: { force_reply: true } });
    } else if (query.data === 'status') {
        const isReady = (sock && sock.user && sock.user.id);
        bot.sendMessage(chatId, `🖥️ Matrix Stat: ${isReady ? "🟢 LINK ESTABLISHED (Online)" : "🔴 LINK BROKEN (Offline)"}`);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; if (!msg.text) return;
    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes('Masukkan nomor WhatsApp target')) {
        hubungkanKeWhatsApp(msg.text, chatId, false, true); return;
    }
    if (msg.text.match(/^\/cek(\s|$)/)) {
        // KUNCI 3: Jika sock belum siap karena delay boot, kita paksa init ulang alih-alih melempar Access Denied
        if (!sock || !sock.user) {
            await hubungkanKeWhatsApp(null, null, false, false);
            await delay(2000);
            if (!sock || !sock.user) return bot.sendMessage(chatId, "❌ Server sedang memproses session baru. Tunggu 5 detik lalu ketik /cek lagi.");
        }
        const inputMentah = msg.text.replace('/cek', '').trim();
        const res = await prosesCekNomor(inputMentah);
        if (res.status === 'TERDAFTAR') {
            bot.sendMessage(chatId, `🟩 **TERDAFTAR**\n📱 ID: +${res.nomor}\n🏢 Tipe: ${res.tipe}\n📝 Bio: ${res.bio}`);
        } else {
            bot.sendMessage(chatId, `🟥 **TIDAK TERDAFTAR**\n📱 ID: +${inputMentah}`);
        }
    }
});

bot.onText(/\/start/, (msg) => sendMenu(msg.chat.id));
hubungkanKeWhatsApp(null, null, false, false);
