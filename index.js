const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public')); // ফ্রন্টএন্ড ফাইল দেখানোর জন্য

app.get('/get-code', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.status(400).json({ error: "নাম্বার দিন!" });
    phone = phone.replace(/[^0-9]/g, ''); // শুধু নাম্বার রাখা

    try {
        // সেশন ফোল্ডার তৈরি (Render-এ এটি সাময়িক হবে)
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
        });

        if (!sock.authState.creds.registered) {
            await delay(2000); // সার্ভার সেটআপ হতে সময় দিন
            const code = await sock.requestPairingCode(phone);
            res.json({ code: code });
        } else {
            res.json({ error: "এই নাম্বারটি ইতিমধ্যে কানেক্টেড আছে।" });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`User ${phone} is now online!`);
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
