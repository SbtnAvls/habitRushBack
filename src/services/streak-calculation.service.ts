import { HabitCompletion, HabitCompletionRecord } from '../models/habit-completion.model';
import { findHabitById, updateHabit } from '../models/habit.model';

/**
 * Calcula el streak actual de un hábito basado en sus completions
 * y actualiza la columna current_streak en la tabla HABITS
 */
export async function calculateAndUpdateStreak(habitId: string, userId: string): Promise<number> {
  // Obtener información del hábito
  const habit = await findHabitById(habitId, userId);
  if (!habit) {
    throw new Error('Habit not found');
  }

  // Obtener todas las completions del hábito ordenadas por fecha descendente
  const completions = await HabitCompletion.getForHabit(userId, habitId);

  // Calcular el streak actual
  const currentStreak = calculateStreak(completions, habit.frequency_type, habit.frequency_days_of_week);

  // Actualizar la tabla HABITS con el nuevo streak
  await updateHabit(habitId, userId, {
    current_streak: currentStreak,
    updated_at: new Date(),
  });

  return currentStreak;
}

/**
 * Calcula el streak basado en las completions y la frecuencia del hábito
 */
function calculateStreak(
  completions: HabitCompletionRecord[],
  frequencyType: 'daily' | 'weekly' | 'custom',
  frequencyDaysOfWeek?: string,
): number {
  if (completions.length === 0) {
    return 0;
  }

  // Filtrar solo las completions que están marcadas como completadas
  const completedDates = completions
    .filter(c => c.completed === 1)
    .map(c => c.date)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); // Ordenar desc por fecha

  if (completedDates.length === 0) {
    return 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Obtener los días de la semana en los que el hábito debe completarse
  let targetDays: number[] | null = null;
  if (frequencyType === 'weekly' || frequencyType === 'custom') {
    if (frequencyDaysOfWeek) {
      // Los días vienen como string separado por comas: "0,1,2" (0=domingo, 1=lunes, etc.)
      targetDays = frequencyDaysOfWeek.split(',').map(d => parseInt(d.trim()));
    }
  }

  let streak = 0;
  const currentDate = new Date(today);

  // Convertir las fechas completadas a un Set para búsqueda rápida
  const completedDateSet = new Set(completedDates.map(d => formatDate(new Date(d))));

  // Iterar hacia atrás desde hoy
  while (true) {
    const dateStr = formatDate(currentDate);

    // Si el hábito es diario o si es un día que debe completarse según la frecuencia
    const shouldCheckThisDay = frequencyType === 'daily' || (targetDays && targetDays.includes(currentDate.getDay()));

    if (shouldCheckThisDay) {
      if (completedDateSet.has(dateStr)) {
        streak++;
      } else {
        // Si no se completó este día que debía completarse, el streak se rompe
        break;
      }
    }

    // Retroceder un día
    currentDate.setDate(currentDate.getDate() - 1);

    // Límite de seguridad: no revisar más de 1000 días hacia atrás
    if (streak > 1000) {
      break;
    }
  }

  return streak;
}

/**
 * Formatea una fecha a string en formato YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
