import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';
import { config } from 'dotenv';
import moment from 'moment-timezone';
import express from 'express';
import { prisma } from './services/db';
import { validateMessages, generateNewPost, generateImagePrompt } from './services/ai';
import { TIMEZONE, CHANNELS, API_CONFIG } from './config/constants';
import postsRouter from './routes/posts';

// Load environment variables
config({ path: '.env' });

const app = express();
app.use(express.json());
app.use('/api/posts', postsRouter);

interface PostData {
    channel: string;
    message_id: number;
    date: Date;
    text: string;
    validation?: boolean;
    new_post?: string;
    image_prompt?: string;
}

async function startTelegramClient() {
    const stringSession = new StringSession(process.env.TELEGRAM_SESSION || '');
    const client = new TelegramClient(stringSession, API_CONFIG.API_ID, API_CONFIG.API_HASH, {
        connectionRetries: 5,
    });

    try {
        await client.connect();  // Just connect, no need for start()
        console.log('Connected to Telegram');
        return client;
    } catch (error) {
        console.error('Failed to start Telegram client:', error);
        throw error;
    }
}

async function processValidatedMessages(validations: Record<number, boolean>, messages: { id: number, text: string, channel: string, date: Date }[]) {
    const processedPosts: PostData[] = [];

    for (const message of messages) {
        if (validations[message.id]) {
            try {
                console.log(`Generating new post for message ${message.id}: ${message.text.substring(0, 100)}...`);
                
                const newPost = await generateNewPost(message.text);
                console.log(`Generated new post: ${newPost}`);

                const imagePrompt = await generateImagePrompt(newPost!);
                console.log(`Generated image prompt: ${imagePrompt}`);

                const postData: PostData = {
                    channel: message.channel,
                    message_id: message.id,
                    date: message.date,
                    text: message.text,
                    validation: true,
                    new_post: newPost!,
                    image_prompt: imagePrompt!
                };

                // Store in database
                await prisma.post.create({
                    data: {
                        channel: postData.channel,
                        messageId: postData.message_id,
                        date: postData.date,
                        text: postData.text,
                        validation: !!postData.validation,
                        newPost: postData.new_post,
                        imagePrompt: postData.image_prompt
                    }
                });

                processedPosts.push(postData);
            } catch (error) {
                console.error(`Error processing message ${message.id}:`, error);
            }
        }
    }

    return processedPosts;
}

async function checkNewPosts(client: TelegramClient) {
    const gmtPlus3 = moment().tz(TIMEZONE);
    const today = gmtPlus3.clone().startOf('day');
    const yesterday = gmtPlus3.clone().subtract(1, 'days').startOf('day');
    // const allPosts: PostData[] = [];

    console.log({
        today: today.format(),
        yesterday: yesterday.format(),
    }, 'Date boundaries');

    const messagesToValidate: { id: number, text: string, channel: string, date: Date }[] = [];

    for (const channelName of CHANNELS) {
        try {
            console.log(`Fetching posts from: ${channelName}`);
            const channel = await client.getEntity(channelName);
            
            const messages = await client.getMessages(channel, {
                limit: 20,
                // offsetDate: today.toDate().getTime() / 1000,
            });

            console.log(`Fetched ${messages.length} messages from ${channelName}`);
            console.log({ messages }, 'messages');

            for (const message of messages) {
                const messageDate = moment.unix(message.date).tz(TIMEZONE);
                
                console.log({ 
                    messageDate: messageDate.format(),
                    yesterdayDate: yesterday.format(),
                    todayDate: today.format(),
                    isSameOrAfter: messageDate.isSameOrAfter(yesterday, 'day'),
                    unixTimestamp: message.date,
                }, 'message date comparison');
                
                // Check for both today's and yesterday's posts
                if (messageDate.isSameOrAfter(yesterday, 'day')) {
                    const messageContent = message.message || '';
                    
                    // Check if we already processed this message
                    const existingPost = await prisma.post.findFirst({
                        where: {
                            channel: channelName,
                            messageId: message.id
                        }
                    });

                    if (!existingPost) {
                        messagesToValidate.push({
                            id: message.id,
                            text: messageContent,
                            channel: channelName,
                            date: messageDate.toDate()
                        });
                    }
                }
            }
        } catch (err) {
            console.error(`Error fetching posts from ${channelName}:`, err);
        }
    }

    if (messagesToValidate.length > 0) {
        const validations = await validateMessages(messagesToValidate);
        console.log({
            validations,
        }, 'validations');

        const processedPosts = await processValidatedMessages(validations, messagesToValidate);
        const nextCheck = moment().add(API_CONFIG.CHECK_INTERVAL / 1000, 'seconds').format('HH:mm:ss');
        console.log(`Successfully processed ${processedPosts.length} posts. Next check at ${nextCheck}`);
        
        return processedPosts;
    } else {
        const nextCheck = moment().add(API_CONFIG.CHECK_INTERVAL / 1000, 'seconds').format('HH:mm:ss');
        console.log(`No new posts found. Next check at ${nextCheck}`);
        return [];
    }
}

async function main() {
    try {
        const client = await startTelegramClient();
        await checkNewPosts(client);

        setInterval(async () => {
            console.log(`Checking for new posts... (${new Date().toISOString()})`);
            await checkNewPosts(client);
        }, API_CONFIG.CHECK_INTERVAL);

    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

main();

app.listen(API_CONFIG.PORT, () => {
    console.log(`Server running on port ${API_CONFIG.PORT}`);
    console.log(`API endpoints:`);
    console.log(`- GET http://localhost:${API_CONFIG.PORT}/api/posts/latest?timeWindow=60`);
    console.log(`- GET http://localhost:${API_CONFIG.PORT}/api/posts/channels`);
});