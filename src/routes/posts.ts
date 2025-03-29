// import { Router } from 'express';
// import { prisma } from '../services/db';

// const router = Router();

// router.get('/latest', async (req, res) => {
//     try {
//         const timeWindow = parseInt(req.query.timeWindow as string) || 60;
//         const posts = await prisma.post.findMany({
//             where: {
//                 date: {
//                     gte: new Date(Date.now() - timeWindow * 60 * 1000)
//                 }
//             },
//             orderBy: {
//                 date: 'desc'
//             }
//         });

//         res.json({ count: posts.length, posts });
//     } catch (error) {
//         console.error('Error fetching posts:', error);
//         res.status(500).json({ error: 'Failed to fetch posts' });
//     }
// });

// router.get('/channels', async (_, res) => {
//     try {
//         const channels = await prisma.post.findMany({
//             select: { channel: true },
//             distinct: ['channel']
//         });

//         // @ts-ignore
//         res.json(channels.map(c => c.channel));
//     } catch (error) {
//         console.error('Error fetching channels:', error);
//         res.status(500).json({ error: 'Failed to fetch channels' });
//     }
// });

// router.get('/forward', async (req, res) => {
//     try {
//         const posts = await prisma.forwardPost.findMany({
//             where: {
//                 forwarded: false
//             },
//             orderBy: {
//                 date: 'desc'
//             }
//         });

//         res.json({ count: posts.length, posts });
//     } catch (error) {
//         console.error('Error fetching forward posts:', error);
//         res.status(500).json({ error: 'Failed to fetch forward posts' });
//     }
// });

// router.post('/forward/:id/mark-forwarded', async (req, res) => {
//     try {
//         const id = parseInt(req.params.id);
//         await prisma.forwardPost.update({
//             where: { id },
//             data: { forwarded: true }
//         });

//         res.json({ success: true });
//     } catch (error) {
//         console.error('Error marking post as forwarded:', error);
//         res.status(500).json({ error: 'Failed to mark post as forwarded' });
//     }
// });

// export default router;
