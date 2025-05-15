import OpenAI from 'openai';
import { PROMPTS } from '../config/prompts';

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY
});

export async function validateMessages(messages: { id: number, text: string }[]) {
    const batchSize = 5;
    const validations: Record<number, boolean> = {};

    for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const prompt = batch.map(m => `Message ${m.id}: ${m.text}`).join('\n\n');
        
        const completion = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: PROMPTS.VALIDATOR.system },
                { role: "user", content: PROMPTS.VALIDATOR.user(prompt) }
            ],
        });

        const response = completion.choices[0].message.content;
        const results = response?.split(',').map(r => r.trim()) || [];
        
        for (const result of results) {
            const [id, value] = result.split(':');
            validations[parseInt(id)] = value.trim().toLowerCase() === 'true';
        }
    }

    return validations;
}

// Keeping for future use
/*
export async function generateNewPost(text: string) {
    const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
            { role: "system", content: PROMPTS.POST_GENERATOR.system },
            { role: "user", content: text }
        ],
    });

    return completion.choices[0].message.content;
}

export async function generateImagePrompt(text: string) {
    const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
            { role: "system", content: PROMPTS.IMAGE_GENERATOR.system },
            { role: "user", content: PROMPTS.IMAGE_GENERATOR.user(text) }
        ],
    });

    return completion.choices[0].message.content;
}
*/ 