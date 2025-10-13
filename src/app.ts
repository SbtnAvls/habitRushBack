import habitRoutes from './routes/habit.routes'
import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'
import challengeRoutes from './routes/challenge.routes';
import userChallengeRoutes from './routes/user-challenge.routes';
import completionRoutes from './routes/completion.routes';
import imageRoutes from './routes/image.routes';
import lifeChallengeRoutes from './routes/life-challenge.routes';
import lifeHistoryRoutes from './routes/life-history.routes';
import leagueRoutes from './routes/league.routes';
import notificationRoutes from './routes/notification.routes';

import express, { Application, Request, Response } from 'express';

const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/habits', habitRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/users/me/challenges', userChallengeRoutes);
app.use('/api/completions', completionRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/life-challenges', lifeChallengeRoutes);
app.use('/api/users/me/life-history', lifeHistoryRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to HabitRush API!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;