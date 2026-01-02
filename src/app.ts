import habitRoutes from './routes/habit.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import challengeRoutes from './routes/challenge.routes';
import completionRoutes from './routes/completion.routes';
import imageRoutes from './routes/image.routes';
import lifeChallengeRoutes from './routes/life-challenge.routes';
import leagueRoutes from './routes/league.routes';
import leagueAdminRoutes from './routes/league-admin.routes';
import notificationRoutes from './routes/notification.routes';
import pendingRedemptionRoutes from './routes/pending-redemption.routes';
import revivalRoutes from './routes/revival.routes';
import categoryRoutes from './routes/category.routes';
import { dailyEvaluationService } from './services/daily-evaluation.service';
import { setupSwagger } from './swagger';

import express, { Application, Request, Response } from 'express';

const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middlewares
app.use(express.json());

// Swagger Documentation
setupSwagger(app);

// Routes
app.use('/habits', habitRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/challenges', challengeRoutes);
app.use('/completions', completionRoutes);
app.use('/images', imageRoutes);
app.use('/life-challenges', lifeChallengeRoutes);
app.use('/leagues', leagueRoutes);
app.use('/leagues/admin', leagueAdminRoutes);
app.use('/notifications', notificationRoutes);
app.use('/pending-redemptions', pendingRedemptionRoutes);
app.use('/revival', revivalRoutes);
app.use('/categories', categoryRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to HabitRush API!');
});

app.listen(port, () => {
  console.warn(`Server is running on port ${port}`);

  // Iniciar el servicio de evaluación diaria de hábitos
  // Se ejecutará todos los días a las 00:05 para evaluar los hábitos del día anterior
  // Usa el sistema nuevo con pending redemptions (período de gracia de 24h)
  if (process.env.NODE_ENV !== 'test') {
    console.warn('Starting daily evaluation service with pending redemptions...');
    dailyEvaluationService.startWithPendingRedemptions();

    // Opcional: Ejecutar inmediatamente en desarrollo para pruebas
    if (process.env.NODE_ENV === 'development') {
      console.warn('Running immediate evaluation for development testing...');
      dailyEvaluationService.runDailyEvaluationWithPendingRedemptions().catch(error => {
        console.error('Error in immediate daily evaluation:', error);
      });
    }
  }
});

export default app;
