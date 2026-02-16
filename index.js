const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/get-code', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.status(400).json({ error: "নাম্বার দিন!" });

    // শুধুমাত্র সংখ্যাগুলো রাখা (যেমন: 88017...)
    phone = phone.replace(/[^0-9]/g, '');

    // যদি নাম্বারটি ৮৮ ছাড়া হয় (বাংলাদেশের জন্য), তবে ৮৮ যোগ করে দিন
    if (phone.startsWith('01')) {
        phone = '88' + phone;
    }

    try {
        // পুরনো সেশন থাকলে মুছে ফেলা (যাতে নতুন ফ্রেশ কোড আসে)
        const sessionPath = `./sessions/${phone}`;
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"], // এটি গুরুত্বপূর্ণ
        });

        if (!sock.authState.creds.registered) {
            // একটু সময় দেওয়া যাতে সকেট রেডি হয়
            await delay(3000);
            const code = await sock.requestPairingCode(phone);
            
            if (code) {
                res.json({ code: code });
            } else {
                res.status(500).json({ error: "কোড পাওয়া যায়নি। আবার চেষ্টা করুন।" });
            }
        } else {
            res.json({ error: "এই নাম্বার ইতিমধ্যে কানেক্টেড।" });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`নাম্বার কানেক্ট হয়েছে: ${phone}`);
                // এখানে আপনি মেসেজ পাঠাতে পারেন নিশ্চিত করার জন্য
                await sock.sendMessage(phone + "@s.whatsapp.net", { text: "আপনার একাউন্টটি সফলভাবে আমাদের সাইটে কানেক্ট হয়েছে। পয়েন্ট যোগ হওয়া শুরু হয়েছে!" });
            }
            if (connection === 'close') {
                console.log("কানেকশন বিচ্ছিন্ন হয়েছে।");
            }
        });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "সার্ভার এরর! কিছুক্ষণ পর আবার চেষ্টা করুন।" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
