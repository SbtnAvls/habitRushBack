import habitRoutes from './routes/habit.routes'
import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'

import express, { Application, Request, Response } from 'express';

const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes

app.use('/habits', habitRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to HabitRush API!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
