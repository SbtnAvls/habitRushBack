# Sistema de Vidas y Retos - HabitRush Backend

## Resumen de Implementación

Este documento describe el flujo completo del sistema de vidas y retos implementado en HabitRush.

## 1. FLUJO DE PÉRDIDA DE VIDAS

### Evaluación Diaria Automática
- **Cuándo**: Todos los días a las 00:05
- **Qué hace**: Evalúa los hábitos del día anterior para todos los usuarios
- **Proceso**:
  1. Identifica hábitos programados para el día anterior
  2. Verifica cuáles NO fueron completados
  3. Resta 1 vida por cada hábito fallado
  4. Si el usuario llega a 0 vidas, deshabilita TODOS sus hábitos
  5. Registra todo en `LIFE_HISTORY` con razón `'habit_missed'`

### Implementación
- **Servicio**: `src/services/habit-evaluation.service.ts`
- **Función principal**: `evaluateMissedHabits(userId, date)`
- **Evaluación masiva**: `evaluateAllUsersDailyHabits()`
- **Programación**: `src/services/daily-evaluation.service.ts`

## 2. FLUJO DE DESHABILITACIÓN DE HÁBITOS

### Deshabilitación Automática (Sin Vidas)
- **Trigger**: Cuando `lives = 0`
- **Acción**:
  - Todos los hábitos activos se marcan como `is_active = 0`
  - Se registra `disabled_at = NOW()`
  - Se marca `disabled_reason = 'no_lives'`
- **El progreso NO se borra**

### Deshabilitación Manual
- **Endpoint**: `POST /habits/:id/deactivate`
- **Acción**:
  - Marca `active_by_user = 0`
  - **BORRA todo el progreso** excepto las notas
  - Marca challenges asignados como `'expired'`
  - Registra `disabled_reason = 'manual'`

## 3. FLUJO DE RESURRECCIÓN (Usuario Sin Vidas)

### Opción 1: Completar Challenge Regular con Pruebas

#### Proceso:
1. **Ver challenges disponibles**:
   ```
   GET /challenges/available-for-revival
   ```
   Solo disponible si `lives = 0`

2. **Enviar pruebas**:
   ```
   POST /challenges/:userChallengeId/submit-proof
   {
     "proofText": "Descripción de cómo completé el reto",
     "proofImageUrl": "https://..."
   }
   ```

3. **Validación con AI**:
   - El sistema valida las pruebas (actualmente simulado)
   - Si aprobado: Usuario revive con TODAS sus vidas máximas
   - Si rechazado: Puede intentar nuevamente

4. **Verificar estado**:
   ```
   GET /challenges/:userChallengeId/proof-status
   ```

#### Archivos:
- **Servicio**: `src/services/challenge-validation.service.ts`
- **Controlador**: `src/controllers/challenge-proof.controller.ts`
- **Tabla**: `CHALLENGE_PROOFS`

### Opción 2: Life Challenges (Sistema Separado)

Life Challenges son retos especiales que otorgan vidas y funcionan independientemente del estado del usuario.

## 4. LIFE CHALLENGES - SISTEMA AUTOMÁTICO

### Evaluación Automática
- **Cuándo**: Después de cada completamiento de hábito
- **Endpoint afectado**: `POST /habits/:habitId/completions`
- **Proceso**: Evalúa si el usuario cumple requisitos de Life Challenges

### Tipos de Life Challenges Implementados:
1. **Semana Perfecta** - Sin perder vidas en una semana
2. **Mes Imparable** - Sin perder vidas en un mes
3. **Salvación de Último Momento** - Completar hábito después de las 23:00
4. **Madrugador** - Completar hábito antes de la 1:00 AM
5. **Triple Corona** - 3 hábitos durante una semana sin fallar
6. **Objetivo Alcanzado** - Completar hábito en fecha objetivo (mín. 4 meses)
7. **Coleccionista de Logros** - Redimir 5 challenges tipo "once"
8. **Superviviente** - No quedarse sin vidas durante 2 meses
9. **Maestro del Tiempo** - Acumular 1000 horas en un hábito
10. **Escritor Prolífico** - Escribir 200 notas

### Estados de Life Challenges:
- **pending**: No cumple requisitos
- **obtained**: Cumple requisitos, puede redimir
- **redeemed**: Ya redimido (para tipo "once")

### Endpoints:
```bash
# Obtener Life Challenges con estados
GET /life-challenges?withStatus=true

# Obtener solo estados
GET /life-challenges/status

# Redimir un Life Challenge
POST /life-challenges/:id/redeem
```

### Archivos:
- **Servicio**: `src/services/life-challenge-evaluation.service.ts`
- **Funciones verificación**: `verificationFunctions` object
- **Evaluación**: `evaluateLifeChallenges(userId)`

## 5. NUEVOS ENDPOINTS IMPLEMENTADOS

### Hábitos
```bash
# Desactivar hábito manualmente (borra progreso)
POST /habits/:id/deactivate
```

### Challenges con Pruebas
```bash
# Ver challenges disponibles para revivir (solo si lives=0)
GET /challenges/available-for-revival

# Enviar pruebas para validación
POST /challenges/:userChallengeId/submit-proof

# Ver estado de validación de pruebas
GET /challenges/:userChallengeId/proof-status
```

### Life Challenges
```bash
# Obtener con estados (pendiente/obtenido/redimido)
GET /life-challenges?withStatus=true

# Obtener solo estados
GET /life-challenges/status

# Redimir (con validación automática)
POST /life-challenges/:id/redeem
```

## 6. TABLAS DE BASE DE DATOS MODIFICADAS

### HABITS
- Añadido: `disabled_at DATETIME`
- Añadido: `disabled_reason ENUM('no_lives', 'manual')`

### LIFE_HISTORY
- Añadido reason: `'user_revived'`

### Nueva Tabla: CHALLENGE_PROOFS
```sql
CREATE TABLE CHALLENGE_PROOFS (
  id CHAR(36) PRIMARY KEY,
  user_challenge_id CHAR(36),
  proof_text TEXT,
  proof_image_url TEXT,
  proof_type ENUM('text', 'image', 'both'),
  validation_status ENUM('pending', 'approved', 'rejected'),
  validation_result TEXT,
  validated_at DATETIME,
  created_at DATETIME
)
```

## 7. SERVICIOS PRINCIPALES

### habit-evaluation.service.ts
- `evaluateMissedHabits()` - Evalúa hábitos fallados
- `reviveUser()` - Revive usuario con todas sus vidas
- `deactivateHabitManually()` - Desactiva y borra progreso

### challenge-validation.service.ts
- `submitChallengeProof()` - Envía y valida pruebas
- `validateWithAI()` - Simula validación con AI
- `getAvailableChallengesForRevival()` - Lista challenges para revivir

### life-challenge-evaluation.service.ts
- `evaluateLifeChallenges()` - Evalúa todos los Life Challenges
- `verificationFunctions` - Funciones de verificación específicas
- `redeemLifeChallengeWithValidation()` - Redime con validación

### daily-evaluation.service.ts
- `runDailyEvaluation()` - Ejecuta evaluación diaria
- `startDailyAt0005()` - Programa ejecución a las 00:05

## 8. FLUJO COMPLETO DE UN USUARIO

### Día 1: Usuario activo
1. Tiene 2 vidas
2. Completa sus hábitos
3. Sistema evalúa Life Challenges automáticamente

### Día 2: Falla hábitos
1. No completa 2 hábitos programados
2. A las 00:05 el sistema evalúa
3. Pierde 2 vidas → Queda en 0
4. TODOS sus hábitos se deshabilitan

### Día 3: Resurrección
1. Ve challenges disponibles: `GET /challenges/available-for-revival`
2. Envía pruebas de un challenge completado
3. Sistema valida con AI
4. Si aprobado:
   - Recupera sus 2 vidas máximas
   - Hábitos se reactivan
   - Puede continuar

### Alternativa: Life Challenges
- En cualquier momento puede redimir Life Challenges obtenidos
- Gana vidas adicionales (hasta su máximo)

## 9. NOTAS IMPORTANTES

### Validación con AI
- **Estado actual**: SIMULADO
- **TODO**: Integrar con servicio real (OpenAI, Anthropic, etc.)
- **Ubicación**: `validateWithAI()` en `challenge-validation.service.ts`

### Evaluación Diaria
- Se ejecuta automáticamente al iniciar el servidor
- En desarrollo, ejecuta inmediatamente para testing
- En producción, espera hasta las 00:05

### Límites
- Vidas máximas por defecto: 2
- Life Challenges tipo "once": Solo se pueden redimir una vez
- Life Challenges tipo "unlimited": Se pueden redimir múltiples veces

## 10. TESTING

Para probar el flujo completo:

1. **Simular pérdida de vidas**:
   ```javascript
   // Llamar directamente al servicio
   await evaluateMissedHabits(userId, new Date());
   ```

2. **Forzar evaluación diaria**:
   ```javascript
   await dailyEvaluationService.runDailyEvaluation();
   ```

3. **Simular resurrección**:
   ```javascript
   await submitChallengeProof(userId, userChallengeId, "Prueba", null);
   ```

## CONFIGURACIÓN DE ENTORNO

Agregar al archivo `.env`:
```env
NODE_ENV=development  # Para ejecutar evaluación inmediata
```

## PRÓXIMOS PASOS RECOMENDADOS

1. **Integrar AI real** para validación de pruebas
2. **Agregar notificaciones** cuando el usuario pierda vidas
3. **Crear dashboard administrativo** para revisar pruebas manualmente
4. **Implementar sistema de appeals** para pruebas rechazadas
5. **Añadir más tipos de Life Challenges**
6. **Crear sistema de achievements** basado en Life Challenges completados