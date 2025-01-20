import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';
import { config } from 'dotenv';

config();

async function getSession() {
    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, parseInt(process.env.API_ID!), process.env.API_HASH!, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: process.env.PHONE_NUMBER!,
        password: async () => await input.text('Please enter your password: '),
        phoneCode: async () => await input.text('Please enter the code you received: '),
        onError: (err) => console.error('Error:', err),
    });

    console.log('Session string:', client.session.save());
}

getSession(); 