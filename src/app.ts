import habitRoutes from './routes/habit.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import challengeRoutes from './routes/challenge.routes';
import completionRoutes from './routes/completion.routes';
import imageRoutes from './routes/image.routes';
import lifeChallengeRoutes from './routes/life-challenge.routes';
import leagueRoutes from './routes/league.routes';
import leagueAdminRoutes from './routes/league-admin.routes';
import habitAdminRoutes from './routes/habit-admin.routes';
import notificationRoutes from './routes/notification.routes';
import pendingRedemptionRoutes from './routes/pending-redemption.routes';
import revivalRoutes from './routes/revival.routes';
import categoryRoutes from './routes/category.routes';
import adminRoutes from './routes/admin.routes';
import socialRoutes from './routes/social.routes';
import { dailyEvaluationService } from './services/daily-evaluation.service';
import { validationProcessorService } from './services/validation-processor.service';
import { leagueSchedulerService } from './services/league-scheduler.service';
import { cronCatchUpService } from './services/cron-catchup.service';
import { TokenBlacklistModel } from './models/token-blacklist.model';
import { RefreshTokenModel } from './models/refresh-token.model';
import { setupSwagger } from './swagger';

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import crypto from 'crypto';

const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// CRITICAL FIX: Validate required environment variables in production
// MEDIUM FIX: Added REFRESH_TOKEN_SECRET to required vars
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['ADMIN_API_KEY', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }
}

// HIGH FIX: Configure CORS with allowed origins
const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : process.env.NODE_ENV === 'production'
      ? false // Reject all in production if not configured
      : true, // Allow all in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
};

// Middlewares

// MEDIUM FIX: Add Helmet security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false, // Disable CSP in dev for Swagger
  crossOriginEmbedderPolicy: false, // Allow embedding for Swagger UI
}));

app.use(cors(corsOptions));

// HIGH FIX: Increased body limit to handle base64-encoded proof images
// (2x5MB images = 10MB, plus ~33% base64 overhead = ~13.3MB, rounded up to 15MB)
// Original 1MB limit was too restrictive for image uploads
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// MEDIUM FIX: Admin authentication middleware for uploads
// Uses constant-time comparison to prevent timing attacks
const uploadsAdminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'] as string;
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    // In development without ADMIN_API_KEY, allow access
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }
    return res.status(500).json({ message: 'Server configuration error' });
  }

  if (!adminKey) {
    return res.status(401).json({ message: 'Admin authentication required' });
  }

  // MEDIUM FIX: Use crypto.timingSafeEqual for proper constant-time comparison
  const providedHash = crypto.createHash('sha256').update(adminKey).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedKey).digest();

  if (!crypto.timingSafeEqual(providedHash, expectedHash)) {
    return res.status(403).json({ message: 'Invalid admin key' });
  }

  next();
};

// Serve uploaded proof images (for admin dashboard) - MEDIUM FIX: Added authentication
app.use('/uploads/proofs', uploadsAdminAuth, express.static(path.join(process.cwd(), 'uploads', 'proofs'), {
  dotfiles: 'deny', // Deny access to dotfiles
  index: false, // Disable directory indexing
}));

// Swagger Documentation
setupSwagger(app);

// Routes (admin routes must come before their base routes)
app.use('/habits/admin', habitAdminRoutes);
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
app.use('/admin', adminRoutes);
app.use('/social', socialRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to HabitRush API!');
});

app.listen(port, '0.0.0.0', () => {
  console.warn(`Server is running on port ${port}`);

  // Iniciar el servicio de evaluación diaria de hábitos
  // Se ejecutará todos los días a las 00:05 para evaluar los hábitos del día anterior
  // Usa el sistema nuevo con pending redemptions (período de gracia de 24h)
  if (process.env.NODE_ENV !== 'test') {
    console.warn('Starting daily evaluation service with pending redemptions...');
    dailyEvaluationService.startWithPendingRedemptions();

    // Start validation processor service (processes expired validations every 5 min)
    console.warn('Starting validation processor service...');
    validationProcessorService.start(5 * 60 * 1000); // Every 5 minutes

    // Start league scheduler service (bot XP, positions, weekly processing)
    console.warn('Starting league scheduler service...');
    leagueSchedulerService.start();

    // Run catch-up for missed cron jobs (with delay to ensure DB is ready)
    setTimeout(() => {
      console.warn('Running cron job catch-up check...');
      cronCatchUpService.runCatchUp().catch(error => {
        console.error('Error in cron catch-up:', error);
      });
    }, 5000); // 5 second delay

    // MEDIUM FIX: Schedule token cleanup every hour to remove expired tokens
    console.warn('Starting token cleanup scheduler...');
    const TOKEN_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
    setInterval(async () => {
      try {
        await TokenBlacklistModel.deleteExpired();
        await RefreshTokenModel.deleteExpired();
        console.warn('[TokenCleanup] Expired tokens cleaned');
      } catch (error) {
        console.error('[TokenCleanup] Error cleaning expired tokens:', error);
      }
    }, TOKEN_CLEANUP_INTERVAL);
    // Run once at startup after a delay
    setTimeout(async () => {
      try {
        await TokenBlacklistModel.deleteExpired();
        await RefreshTokenModel.deleteExpired();
        console.warn('[TokenCleanup] Initial cleanup completed');
      } catch (error) {
        console.error('[TokenCleanup] Error in initial cleanup:', error);
      }
    }, 10000); // 10 second delay

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
