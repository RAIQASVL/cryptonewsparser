import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';
import { config } from 'dotenv';
import moment from 'moment-timezone';
import express from 'express';
import { prisma } from './services/db';
import { Prisma } from '@prisma/client';
import { 
    validateMessages, 
    // generateNewPost, 
    // generateImagePrompt 
} from './services/ai';
import { TIMEZONE, API_CONFIG, NEWS_CHANNELS, FORWARD_CHANNELS } from './config/constants';
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

interface ForwardPostData {
    channel: string;
    message_id: number;
    date: Date;
    text: string;
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
                console.log(`Processing message ${message.id}: ${message.text.substring(0, 100)}...`);

                const postData: PostData = {
                    channel: message.channel,
                    message_id: message.id,
                    date: message.date,
                    text: message.text,
                    validation: true,
                    // new_post and image_prompt will be null
                };

                // Store in database
                await prisma.post.create({
                    data: {
                        channel: postData.channel,
                        messageId: postData.message_id,
                        date: postData.date,
                        text: postData.text,
                        validation: !!postData.validation,
                        // newPost and imagePrompt will be null by default
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

    for (const channelName of NEWS_CHANNELS) {
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

async function checkForwardChannels(client: TelegramClient) {
    const gmtPlus3 = moment().tz(TIMEZONE);
    const timeWindowStart = gmtPlus3.clone().subtract(90, 'minutes');

    console.log({
        now: gmtPlus3.format(),
        windowStart: timeWindowStart.format(),
    }, 'Forward channels time window');

    for (const channelName of FORWARD_CHANNELS) {
        try {
            console.log(`Checking forward channel: ${channelName}`);
            const channel = await client.getEntity(channelName);
            
            const messages = await client.getMessages(channel, {
                limit: 50,
            });

            console.log(`Fetched ${messages.length} messages from ${channelName}`);

            for (const message of messages) {
                const messageDate = moment.unix(message.date).tz(TIMEZONE);
                
                if (messageDate.isAfter(timeWindowStart)) {
                    const messageContent = message.message || '';
                    let mediaInfo = null;

                    // Handle media (images, etc)
                    if (message.media) {
                        try {
                            mediaInfo = JSON.parse(JSON.stringify({
                                type: message.media.className,
                                // For photos
                                ...('photo' in message.media && 
                                   message.media.photo && 
                                   'id' in message.media.photo &&
                                   'sizes' in message.media.photo && {
                                    photo: {
                                        id: message.media.photo.id.toString(),
                                        sizes: message.media.photo.sizes,
                                    }
                                }),
                                // For documents (like GIFs)
                                ...('document' in message.media && 
                                   message.media.document &&
                                   'id' in message.media.document &&
                                   'mimeType' in message.media.document &&
                                   'size' in message.media.document && {
                                    document: {
                                        id: message.media.document.id.toString(),
                                        mimeType: message.media.document.mimeType,
                                        size: message.media.document.size,
                                    }
                                })
                            }));
                        } catch (error) {
                            console.error('Error processing media:', error);
                        }
                    }
                    
                    // Check if we already processed this message
                    const existingPost = await prisma.forwardPost.findFirst({
                        where: {
                            channel: channelName,
                            messageId: message.id
                        }
                    });

                    if (!existingPost) {
                        const createData: Prisma.ForwardPostCreateInput = {
                            channel: channelName,
                            channelId: channel.id.toString(),
                            messageId: message.id,
                            date: messageDate.toDate(),
                            text: messageContent,
                            media: mediaInfo,
                            forwarded: false
                        };
                        
                        await prisma.forwardPost.create({
                            data: createData
                        });
                        console.log(`Saved new forward post from ${channelName} (ID: ${channel.id}), message ID: ${message.id}, has media: ${!!mediaInfo}`);
                    }
                }
            }
        } catch (err) {
            console.error(`Error checking forward channel ${channelName}:`, err);
        }
    }
}

async function main() {
    try {
        const client = await startTelegramClient();
        
        // Initial checks
        await checkNewPosts(client);
        await checkForwardChannels(client);

        // Set up intervals for both checks
        setInterval(async () => {
            console.log(`Checking for new posts... (${new Date().toISOString()})`);
            await checkNewPosts(client);
        }, API_CONFIG.CHECK_INTERVAL);

        setInterval(async () => {
            console.log(`Checking forward channels... (${new Date().toISOString()})`);
            await checkForwardChannels(client);
        }, API_CONFIG.FORWARD_CHECK_INTERVAL);

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