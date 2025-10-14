import habitRoutes from './routes/habit.routes'
import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'
import challengeRoutes from './routes/challenge.routes';
import completionRoutes from './routes/completion.routes';
import imageRoutes from './routes/image.routes';
import lifeChallengeRoutes from './routes/life-challenge.routes';
import leagueRoutes from './routes/league.routes';
import notificationRoutes from './routes/notification.routes';

import express, { Application, NextFunction, Request, Response } from 'express';

const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/habits', habitRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/challenges', challengeRoutes);
app.use('/completions', completionRoutes);
app.use('/images', imageRoutes);
app.use('/life-challenges', lifeChallengeRoutes);
app.use('/leagues', leagueRoutes);
app.use('/notifications', notificationRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to HabitRush API!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
