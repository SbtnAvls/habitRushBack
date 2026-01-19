# Life Challenges API - Guia de Implementacion Frontend

## Resumen

Los **Life Challenges** son retos que los usuarios pueden completar para ganar vidas extra. El backend evalua automaticamente si un usuario cumple cada reto y el frontend solo debe consumir los estados y permitir el canje.

---

## Endpoints Disponibles

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/life-challenges` | Lista de retos (opcional: con estado del usuario) |
| GET | `/api/life-challenges/status` | Estado de todos los retos del usuario |
| POST | `/api/life-challenges/:id/redeem` | Canjear un reto para obtener vidas |

**Nota:** Todos los endpoints requieren autenticacion (header `Authorization: Bearer <token>`).

---

## 1. GET `/api/life-challenges`

### Descripcion
Obtiene la lista de todos los Life Challenges activos. Puede incluir opcionalmente el estado del usuario.

### Query Parameters

| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| `withStatus` | string | No | Si es `"true"`, incluye el estado del usuario para cada reto |

### Request

```http
GET /api/life-challenges?withStatus=true
Authorization: Bearer <token>
```

### Response (con `withStatus=true`) - **RECOMENDADO**

```json
[
  {
    "life_challenge_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Semana perfecta",
    "description": "Manten un habito durante una semana completa sin perder vidas",
    "reward": 1,
    "redeemable_type": "unlimited",
    "icon": "calendar-check",
    "status": "obtained",
    "obtained_at": "2024-01-15T10:30:00.000Z",
    "redeemed_at": null,
    "can_redeem": true
  },
  {
    "life_challenge_id": "550e8400-e29b-41d4-a716-446655440001",
    "title": "Meta cumplida",
    "description": "Completa un habito llegando a su fecha objetivo (minimo 4 meses)",
    "reward": 3,
    "redeemable_type": "once",
    "icon": "trophy",
    "status": "pending",
    "obtained_at": null,
    "redeemed_at": null,
    "can_redeem": false
  },
  {
    "life_challenge_id": "550e8400-e29b-41d4-a716-446655440002",
    "title": "Madrugador",
    "description": "Registra progreso de un habito antes de la 1 AM",
    "reward": 1,
    "redeemable_type": "once",
    "icon": "sun",
    "status": "redeemed",
    "obtained_at": null,
    "redeemed_at": "2024-01-10T08:00:00.000Z",
    "can_redeem": false
  }
]
```

### Response (sin `withStatus`) - Lista simple

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Semana perfecta",
    "description": "Manten un habito durante una semana completa sin perder vidas",
    "reward": 1,
    "redeemable_type": "unlimited",
    "icon": "calendar-check",
    "verification_function": "verifyWeekWithoutLosingLives",
    "is_active": true
  }
]
```

---

## 2. GET `/api/life-challenges/status`

### Descripcion
Obtiene el estado actual de TODOS los Life Challenges para el usuario autenticado. Es equivalente a `GET /api/life-challenges?withStatus=true`.

### Request

```http
GET /api/life-challenges/status
Authorization: Bearer <token>
```

### Response

```json
[
  {
    "life_challenge_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Semana perfecta",
    "description": "Manten un habito durante una semana completa sin perder vidas",
    "reward": 1,
    "redeemable_type": "unlimited",
    "icon": "calendar-check",
    "status": "obtained",
    "obtained_at": "2024-01-15T10:30:00.000Z",
    "redeemed_at": null,
    "can_redeem": true
  }
]
```

---

## 3. POST `/api/life-challenges/:id/redeem`

### Descripcion
Canjea un Life Challenge para obtener las vidas de recompensa. Solo funciona si `can_redeem` es `true`.

### URL Parameters

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `id` | UUID | ID del Life Challenge a canjear |

### Request

```http
POST /api/life-challenges/550e8400-e29b-41d4-a716-446655440000/redeem
Authorization: Bearer <token>
```

**Nota:** No requiere body.

### Response - Exito (200)

```json
{
  "message": "Challenge redimido! Has ganado 1 vida(s)",
  "livesGained": 1,
  "success": true
}
```

### Response - Error (400)

```json
{
  "message": "Aun no cumples los requisitos para redimir este challenge",
  "success": false
}
```

```json
{
  "message": "Este challenge ya fue redimido",
  "success": false
}
```

```json
{
  "message": "Ya tienes el maximo de vidas posibles",
  "success": false
}
```

**NUEVO - Error especifico para retos tipo `once` sin espacio suficiente:**

```json
{
  "message": "Necesitas 5 casillas de vida disponibles para redimir este reto. Actualmente tienes 2 casilla(s) disponible(s). Aumenta tu maximo de vidas para no perder recompensa.",
  "success": false,
  "code": "INSUFFICIENT_LIFE_SLOTS"
}
```

---

## Tipos TypeScript para el Frontend

```typescript
// Estado posible de un Life Challenge
type LifeChallengeStatus = 'pending' | 'obtained' | 'redeemed';

// Tipo de canje
type RedeemableType = 'once' | 'unlimited';

// Estructura completa de un Life Challenge con estado
interface UserLifeChallengeStatus {
  life_challenge_id: string;   // UUID del reto
  title: string;               // Titulo del reto
  description: string;         // Descripcion del reto
  reward: number;              // Vidas que se ganan al canjear
  redeemable_type: RedeemableType;  // 'once' = solo una vez, 'unlimited' = cada vez que se cumple
  icon: string;                // Nombre del icono a mostrar
  status: LifeChallengeStatus; // Estado actual del reto para el usuario
  obtained_at?: string | null; // Fecha cuando se obtuvo (si aplica)
  redeemed_at?: string | null; // Ultima fecha de canje (si aplica)
  can_redeem: boolean;         // TRUE si el usuario puede canjear AHORA
}

// Respuesta del endpoint de canje
interface RedeemResponse {
  message: string;
  success: boolean;
  livesGained?: number;  // Solo presente si success=true
  code?: string;         // Codigo de error especifico (ej: 'INSUFFICIENT_LIFE_SLOTS')
}
```

---

## Estados de los Life Challenges

### Diagrama de Estados

```
                    +------------------+
                    |                  |
                    v                  |
+----------+    +-----------+    +----------+
| pending  |--->| obtained  |--->| redeemed |
+----------+    +-----------+    +----------+
     ^               |                |
     |               |                |
     +---------------+                |  (solo para 'once')
     (si deja de cumplir requisitos)  |
                                      |
     +--------------------------------+
     |  (para 'unlimited': vuelve a 'pending' o 'obtained')
     v
```

### Explicacion de Estados

| Estado | Significado | `can_redeem` | Accion en UI |
|--------|-------------|--------------|--------------|
| `pending` | El usuario AUN NO cumple los requisitos | `false` | Mostrar como bloqueado/gris |
| `obtained` | El usuario CUMPLE los requisitos y puede canjear | `true` | Mostrar boton "Canjear" activo, destacar visualmente |
| `redeemed` | Ya fue canjeado (para tipo `once`) | `false` | Mostrar como completado con checkmark |

### Comportamiento segun `redeemable_type`

| Tipo | Comportamiento |
|------|----------------|
| `once` | Solo se puede canjear UNA vez. Una vez canjeado, el estado permanece `redeemed` para siempre. |
| `unlimited` | Se puede canjear CADA VEZ que se cumplan los requisitos. El estado puede alternar entre `pending`, `obtained` segun si cumple los requisitos en ese momento. |

### IMPORTANTE: Logica de Redencion segun Casillas de Vida

El comportamiento varia segun el tipo de reto para proteger al usuario de perder recompensas:

#### Retos tipo `once` (una sola vez)
**El backend BLOQUEA la redencion si no hay espacio suficiente.**

| Usuario tiene | Max vidas | Reto da | Resultado |
|---------------|-----------|---------|-----------|
| 2 vidas | 3 | +5 | **BLOQUEADO** - code: `INSUFFICIENT_LIFE_SLOTS` |
| 0 vidas | 5 | +5 | **PERMITIDO** - gana 5 vidas |
| 3 vidas | 5 | +3 | **BLOQUEADO** - solo tiene 2 slots, necesita 3 |

**Razon:** Si el reto solo se puede canjear una vez, no queremos que el usuario pierda vidas por no tener espacio.

#### Retos tipo `unlimited` (ilimitados)
**El frontend debe preguntar al usuario si quiere canjear parcialmente.**

Flujo recomendado:
1. Verificar si `reward > availableSlots`
2. Si es asi, mostrar modal: "Este reto da X vidas pero solo tienes Y casillas disponibles. Quieres canjearlo de todas formas y recibir Y vidas?"
3. Si acepta → llamar al endpoint (el backend permite redencion parcial)
4. Si rechaza → no llamar al endpoint, sugerir aumentar max_lives

```typescript
const redeemUnlimitedChallenge = async (challenge: UserLifeChallengeStatus, user: User) => {
  const availableSlots = user.max_lives - user.lives;

  if (challenge.reward > availableSlots) {
    const confirmed = await showConfirmModal(
      `Este reto da ${challenge.reward} vidas pero solo tienes ${availableSlots} casilla(s) disponible(s).
       Quieres canjearlo de todas formas y recibir ${availableSlots} vida(s)?`
    );

    if (!confirmed) return;
  }

  // Llamar al endpoint
  const result = await fetch(`/api/life-challenges/${challenge.life_challenge_id}/redeem`, ...);
};
```

---

## Retos Actuales Implementados

| Reto | Descripcion | Tipo | Recompensa |
|------|-------------|------|------------|
| Semana perfecta | Una semana sin perder vidas + tener al menos 1 habito activo | `unlimited` | 1 vida |
| Mes perfecto | Un mes sin perder vidas + habito activo desde hace 30+ dias | `unlimited` | 2 vidas |
| Ultimo momento | Completar un habito despues de las 23:00 | `once` | 1 vida |
| Madrugador | Registrar progreso antes de la 1 AM | `once` | 1 vida |
| Triple amenaza | 3+ habitos completados toda la semana sin fallar | `unlimited` | 2 vidas |
| Meta cumplida | Completar habito hasta su fecha objetivo (min 4 meses) | `once` | 3 vidas |
| Coleccionista | Redimir 5 challenges tipo "once" | `once` | 2 vidas |
| Superviviente | 2 meses seguidos sin quedarse en 0 vidas | `unlimited` | 2 vidas |
| Dedicacion total | Acumular 1000+ horas en un habito | `once` | 5 vidas |
| Reflexivo | Escribir 200+ notas en completamientos | `once` | 2 vidas |

---

## Flujo de Implementacion Recomendado

### 1. Pantalla de Life Challenges

```typescript
// Al cargar la pantalla
const fetchChallenges = async () => {
  const response = await fetch('/api/life-challenges?withStatus=true', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const challenges: UserLifeChallengeStatus[] = await response.json();

  // Separar por estado para mostrar en secciones
  const available = challenges.filter(c => c.status === 'obtained');
  const pending = challenges.filter(c => c.status === 'pending');
  const completed = challenges.filter(c => c.status === 'redeemed');

  return { available, pending, completed };
};
```

### 2. Canjear un Reto

```typescript
const redeemChallenge = async (challengeId: string) => {
  const response = await fetch(`/api/life-challenges/${challengeId}/redeem`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const result: RedeemResponse = await response.json();

  if (result.success) {
    // Mostrar animacion de +N vidas
    showLivesGainedAnimation(result.livesGained);
    // Actualizar estado local del usuario (vidas)
    updateUserLives(result.livesGained);
    // Refrescar lista de challenges
    await fetchChallenges();
  } else {
    // Mostrar mensaje de error
    showError(result.message);
  }
};
```

### 3. Notificacion al Completar Habito

Cuando el usuario completa un habito, la respuesta del endpoint `POST /api/habit-completions/:habitId` puede incluir:

```json
{
  "id": "completion-uuid",
  "habit_id": "habit-uuid",
  "completed": 1,
  "current_streak": 7,
  "xp_gained": 10,
  "new_life_challenges_obtained": [
    {
      "life_challenge_id": "challenge-uuid",
      "title": "Semana perfecta",
      "description": "...",
      "reward": 1,
      "can_redeem": true
    }
  ]
}
```

**Recomendacion:** Si `new_life_challenges_obtained` tiene elementos, mostrar una notificacion/modal al usuario indicando que desbloqueo nuevos retos.

```typescript
const completeHabit = async (habitId: string, data: CompletionData) => {
  const response = await fetch(`/api/habit-completions/${habitId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  // Verificar si hay nuevos retos desbloqueados
  if (result.new_life_challenges_obtained?.length > 0) {
    showNewChallengesNotification(result.new_life_challenges_obtained);
  }

  return result;
};
```

---

## UI/UX Recomendado

### Estados Visuales

```
+----------------------------------+
|  [icon]  Semana perfecta         |
|  Manten un habito durante...     |
|                                  |
|  Recompensa: +1 vida             |
|                                  |
|  [ CANJEAR ]  <-- boton activo   |
+----------------------------------+
        Estado: obtained

+----------------------------------+
|  [icon]  Meta cumplida      [X]  |
|  Completa un habito llegando...  |
|                                  |
|  Recompensa: +3 vidas            |
|                                  |
|  COMPLETADO                      |
+----------------------------------+
        Estado: redeemed

+----------------------------------+
|  [icon]  Dedicacion total   [🔒] |
|  Acumula 1000+ horas...          |
|                                  |
|  Recompensa: +5 vidas            |
|                                  |
|  Progreso: 156/1000 hrs          |
+----------------------------------+
        Estado: pending
```

### Orden de Visualizacion Sugerido

1. **Disponibles para canjear** (`obtained`) - Destacados arriba
2. **En progreso** (`pending`) - Mostrar progreso si es posible
3. **Completados** (`redeemed`) - Al final, en seccion colapsable

---

## Errores Comunes y Soluciones

| Error | Code | Causa | Solucion |
|-------|------|-------|----------|
| `"No puedes redimir retos mientras estas sin vidas..."` | `USER_DEAD` | Usuario tiene 0 vidas (muerto) | Redirigir a retos de resurreccion (validacion manual) |
| `"Aun no cumples los requisitos"` | - | El usuario intento canjear cuando `can_redeem=false` | Verificar el estado antes de habilitar el boton |
| `"Este challenge ya fue redimido"` | - | Intento canjear un reto tipo `once` ya canjeado | Deshabilitar boton para retos `redeemed` |
| `"Ya tienes el maximo de vidas"` | - | Usuario tiene `lives === max_lives` | Informar al usuario que no puede ganar mas vidas |
| `"Necesitas X casillas..."` | `INSUFFICIENT_LIFE_SLOTS` | Reto `once` + no hay espacio suficiente | Mostrar UI para aumentar max_lives |
| `"Life Challenge no encontrado"` | - | ID invalido | Verificar que el ID sea correcto |

---

## Consideraciones Importantes

1. **Evaluacion en tiempo real**: El backend evalua los requisitos CADA vez que se consulta el estado. Un reto puede pasar de `obtained` a `pending` si el usuario deja de cumplir los requisitos (ej: pierde una vida y ya no tiene "semana perfecta").

2. **Retos `unlimited`**: Pueden canjearse multiples veces, pero solo cuando se cumplen los requisitos de nuevo. Por ejemplo, "Semana perfecta" se puede canjear cada semana que el usuario no pierda vidas.

3. **Refrescar despues de canjear**: Siempre refrescar la lista de challenges despues de un canje exitoso, ya que los estados pueden cambiar.

4. **Cache**: No cachear los estados de challenges por mucho tiempo, ya que cambian dinamicamente basados en las acciones del usuario.

---

## Resumen de Endpoints

```
GET  /api/life-challenges              -> Lista basica (sin estado)
GET  /api/life-challenges?withStatus=true -> Lista con estado del usuario (RECOMENDADO)
GET  /api/life-challenges/status       -> Solo estados del usuario
POST /api/life-challenges/:id/redeem   -> Canjear un reto
```
