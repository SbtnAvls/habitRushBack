# Revision Fase 1 - Realistic Bot XP Simulation

## 1. Resumen de lo que se hizo
- Se extendio `BotProfileConfig` con campos para simulacion granular: `avgHabitsPerDayMin/Max`, `xpPerHabitMin/Max`, `hourlyActivityChance`
- Se ajustaron los valores de `BOT_PROFILES` con rangos mas realistas
- Se cambio `initialXp` a 0 para que los bots empiecen sin XP (acumulacion incremental futura)
- El build pasa sin errores de TypeScript

## 2. Riesgos detectados

- **CRITICO - Posible inconsistencia SQL**: En el esquema `habitRush_mysql.sql`, la columna es `name` (linea 305), pero en `league-bot.service.ts` se usa `username` (lineas 151 y 199). Si la base de datos usa `name`, las queries INSERT y SELECT fallaran en runtime. **Verificar urgentemente si la BD real tiene `name` o `username`**.

- **Los nuevos campos de perfil no se usan**: Los campos `avgHabitsPerDayMin/Max`, `xpPerHabitMin/Max` y `hourlyActivityChance` estan definidos pero `simulateDailyBotXp()` sigue usando `dailyXpMin/Max` para dar XP de golpe. Esto es esperado (se usaran en Fase 2), pero genera codigo muerto temporalmente.

- **Discrepancia documentacion vs implementacion**:
  - DIARY.md dice casual: `8-20 XP/habito`, pero el codigo tiene `10-25`
  - DIARY.md dice active: `10-25 XP/habito`, pero el codigo tiene `15-35`
  - DIARY.md dice hardcore: `15-35 XP/habito`, pero el codigo tiene `25-50`
  - Esto puede causar confusion futura. Actualizar la documentacion.

- **Variable `config` no usada en `fillLeagueGroupWithBotsTx`**: El DIARY.md menciona que la variable `config` ya no se usa. Verificar que no haya quedado codigo residual que deberia limpiarse.

- **Sin tests**: No hay tests unitarios para verificar que los nuevos perfiles tienen valores coherentes (ej. que dailyXpMin <= dailyXpMax, que avgHabitsPerDay * xpPerHabit este en rango de dailyXp).

## 3. Preguntas dificiles

1. **La columna es `name` o `username`?** Si el esquema SQL dice `name` pero el codigo usa `username`, como es que el sistema funciona actualmente? Hay una migracion que renombro la columna? O el INSERT falla silenciosamente?

2. **Por que `hourlyActivityChance` tiene valores tan bajos?** Con 5% para lazy y 12 horas activas, un bot lazy tendria ~0.6 oportunidades de completar un habito por dia. Pero se define `avgHabitsPerDayMin: 1`. Los valores son inconsistentes matematicamente. Como se reconciliaran en Fase 2?

3. **Que pasa con los bots legacy (sin bot_profile)?** En `simulateDailyBotXp`, si un bot no tiene `bot_profile`, se usa 'casual' como fallback. Pero los nuevos campos granulares no existen en la BD. Como se manejara la migracion de datos para bots existentes?

4. **Por que se mantiene `dailyXpMin/Max` si la Fase 2 usara simulacion granular?** Si el objetivo es simular habito por habito, los campos `dailyXpMin/Max` deberian ser solo limites de seguridad, no la fuente de XP. Hay un plan para deprecarlos?

5. **Como se garantiza que un bot no supere su `dailyXpMax`?** Si en Fase 2 se dan multiples porciones de XP durante el dia, se necesita tracking del XP acumulado en el dia actual. Donde se almacenara ese tracking? En una nueva columna? En cache?

## 4. Sugerencias de cambios

1. **Verificar y corregir `name` vs `username`** (`league-bot.service.ts`, lineas 151 y 199):
   - Confirmar cual es el nombre correcto de la columna en la BD de produccion
   - Unificar nomenclatura en codigo y esquema

2. **Actualizar DIARY.md** con los valores reales implementados para evitar confusion futura

3. **Agregar validaciones en BotProfileConfig** (opcional pero recomendado):
   ```typescript
   // En tiempo de build o startup, validar:
   // - dailyXpMin <= dailyXpMax
   // - avgHabitsPerDayMin <= avgHabitsPerDayMax
   // - xpPerHabitMin <= xpPerHabitMax
   // - avgHabitsPerDayMax * xpPerHabitMax >= dailyXpMin (coherencia)
   ```

4. **Documentar la intencion de `hourlyActivityChance`** en el codigo para que sea claro como se combinara con avgHabitsPerDay en Fase 2

5. **Limpiar codigo residual** si existe alguna variable `config` no usada

## 5. Verificaciones recomendadas

- [ ] **Query manual**: Ejecutar `DESCRIBE LEAGUE_COMPETITORS` en la BD real para confirmar el nombre de la columna (name vs username)
- [ ] **Test de creacion de bots**: Ejecutar `fillAllLeaguesWithBots` en un entorno de prueba y verificar que los INSERTs no fallan
- [ ] **Revisar logs de produccion**: Buscar errores de columna desconocida si el sistema ya estuvo en uso
- [ ] **Verificar coherencia de valores**: Para cada perfil, calcular `avgHabitsPerDayMax * xpPerHabitMax` y confirmar que no excede `dailyXpMax`

---

**Veredicto**: La fase tiene el objetivo cumplido (perfiles refactorizados con nuevos campos), pero hay un riesgo critico de inconsistencia SQL que debe verificarse antes de continuar con Fase 2.
