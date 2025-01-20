import { Router } from 'express';
import { prisma } from '../services/db';

const router = Router();

router.get('/latest', async (req, res) => {
    try {
        const timeWindow = parseInt(req.query.timeWindow as string) || 60;
        const posts = await prisma.post.findMany({
            where: {
                date: {
                    gte: new Date(Date.now() - timeWindow * 60 * 1000)
                }
            },
            orderBy: {
                date: 'desc'
            }
        });
        
        res.json({ count: posts.length, posts });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

router.get('/channels', async (req, res) => {
    try {
        const channels = await prisma.post.findMany({
            select: { channel: true },
            distinct: ['channel']
        });
        
        res.json(channels.map(c => c.channel));
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

export default router; 