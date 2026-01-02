# Sistema de Challenges y Skills - Vista General

## Objetivo

Rediseñar el sistema de consecuencias cuando un usuario falla hábitos, añadiendo:
1. **Período de gracia de 24h** para decidir cómo redimir un fallo
2. **Challenges específicos por categoría** de hábito
3. **Sistema de Stats/Skills** que miden la disciplina del usuario
4. **Dos opciones al morir**: reset total vs penitencia

---

## Conceptos Clave

### Stats del Usuario (USER_STATS)
Métricas que representan el progreso y disciplina del usuario:
- `discipline_score`: Puntuación de disciplina (0-1000, inicial: 100)
- `max_streak`: Racha máxima histórica
- `total_completions`: Total de hábitos completados
- `perfect_weeks`: Semanas sin fallar
- `revival_count`: Veces que ha revivido
- `reset_count`: Veces que empezó de cero

### Categorías de Hábitos (HABIT_CATEGORIES)
Cada hábito pertenece a una categoría:
- health (Salud)
- exercise (Ejercicio)
- learning (Aprendizaje)
- productivity (Productividad)
- mindfulness (Mindfulness)
- creativity (Creatividad)
- social (Social)
- finance (Finanzas)

### Pending Redemptions
Cuando un usuario falla un hábito pero tiene vidas, NO pierde la vida inmediatamente. Se crea un registro de "redención pendiente" que tiene 24h para resolverse.

---

## Flujos Principales

### Flujo A: Fallo de Hábito (tiene vidas)
```
Evaluación diaria detecta hábito fallado
           ↓
Crear PENDING_REDEMPTION (expira en 24h)
           ↓
Usuario tiene 3 opciones:
  1. No hacer nada → expira → pierde vida automático
  2. Aceptar perder vida manualmente
  3. Completar challenge de la categoría → NO pierde vida
```

### Flujo B: Muerte (0 vidas)
```
Usuario llega a 0 vidas
           ↓
Todos los hábitos se pausan
           ↓
Usuario tiene 2 opciones:
  1. RESET: Borrar progreso, -50% stats, 1 vida
  2. PENITENCIA: Challenge general + pruebas, -20% stats, 1 vida
```

---

## Impacto en Stats

| Evento | discipline_score |
|--------|------------------|
| Hábito completado | +1 |
| Semana perfecta | +10 |
| Challenge completado | +5 |
| Life Challenge redimido | +5 |
| Fallo redimido con vida | -10 |
| Pending expirado | -15 |
| Muerte + Penitencia | -20 |
| Muerte + Reset | -50 |

---

## Archivos de Fases

1. `01-fase-database.md` - Cambios SQL
2. `02-fase-models.md` - Modelos TypeScript
3. `03-fase-pending-redemptions.md` - Flujo de pending
4. `04-fase-revival.md` - Flujo de muerte/revival
5. `05-fase-category-challenges.md` - Challenges por categoría
6. `context.md` - Contexto para retomar desarrollo
