# 📱 GUÍA DE IMPLEMENTACIÓN FRONTEND - Sistema de Vidas y Retos

## 🎯 RESUMEN EJECUTIVO

El sistema de vidas funciona como un "juego" donde:
- **Tienes vidas limitadas** (por defecto 2)
- **Pierdes 1 vida** por cada hábito no completado
- **Sin vidas = Hábitos bloqueados**
- **Para revivir**: Completa challenges con pruebas o redime Life Challenges

---

## 1️⃣ INFORMACIÓN CRÍTICA DEL USUARIO

### 🔵 Estado de Vidas del Usuario

**Endpoint**: `GET /users/me`
```javascript
// Response
{
  "id": "user-uuid",
  "lives": 2,        // Vidas actuales (0-2)
  "max_lives": 2,    // Máximo de vidas posibles
  "is_active": true,
  // ... otros campos
}
```

**¿Cuándo consultar?**
- Al iniciar la app
- Después de completar/fallar hábitos
- Después de redimir challenges

**UI Recomendada**:
```jsx
// Componente de Vidas
function LivesIndicator({ lives, maxLives }) {
  const isDead = lives === 0;

  return (
    <div className={isDead ? 'danger' : ''}>
      {isDead ? (
        <Alert>⚠️ Sin vidas - Completa un reto para revivir</Alert>
      ) : (
        <Hearts current={lives} max={maxLives} />
      )}
    </div>
  );
}
```

---

## 2️⃣ FLUJO DE HÁBITOS

### 🟢 Ver Hábitos del Usuario

**Endpoint**: `GET /habits`
```javascript
// Response
[
  {
    "id": "habit-uuid",
    "name": "Ejercicio",
    "is_active": true,      // Si false y disabled_reason='no_lives' → Bloqueado
    "active_by_user": true,  // Si false → Desactivado manualmente
    "disabled_at": null,
    "disabled_reason": null, // 'no_lives' | 'manual' | null
    "frequency_type": "daily",
    "progress_type": "yes_no",
    // ...
  }
]
```

**Estados de Hábito en UI**:
```javascript
function getHabitStatus(habit) {
  if (!habit.is_active && habit.disabled_reason === 'no_lives') {
    return 'BLOCKED_NO_LIVES'; // 🔒 Bloqueado por falta de vidas
  }
  if (!habit.active_by_user) {
    return 'MANUALLY_DISABLED'; // ⏸️ Pausado por el usuario
  }
  if (!habit.is_active) {
    return 'INACTIVE'; // ❌ Inactivo
  }
  return 'ACTIVE'; // ✅ Activo
}
```

### 🟡 Registrar Completamiento de Hábito

**Endpoint**: `POST /habits/:habitId/completions`
```javascript
// Request
{
  "date": "2024-01-19",
  "completed": 1,  // 1 = completado, 0 = no completado
  "progress_type": "yes_no",
  "progress_value": null,  // Para tipo 'time' o 'count'
  "target_value": null,
  "notes": "Opcional"
}

// Response (IMPORTANTE: puede incluir Life Challenges obtenidos)
{
  "id": "completion-uuid",
  "completed": 1,
  // SI SE OBTUVIERON NUEVOS LIFE CHALLENGES:
  "new_life_challenges_obtained": [
    {
      "life_challenge_id": "uuid",
      "title": "Madrugador",
      "description": "Completaste un hábito antes de la 1 AM",
      "reward": 1,
      "status": "obtained",
      "can_redeem": true
    }
  ]
}
```

**Flujo en Frontend**:
```javascript
async function markHabitComplete(habitId, date) {
  const response = await api.post(`/habits/${habitId}/completions`, {
    date,
    completed: 1,
    progress_type: 'yes_no'
  });

  // Verificar si se obtuvieron Life Challenges
  if (response.new_life_challenges_obtained?.length > 0) {
    showNotification('🎉 ¡Nuevo Life Challenge disponible!');
    // Actualizar UI para mostrar botón de redimir
    updateLifeChallenges(response.new_life_challenges_obtained);
  }
}
```

### 🔴 Desactivar Hábito Manualmente

**Endpoint**: `POST /habits/:id/deactivate`

⚠️ **ADVERTENCIA**: Esto BORRA todo el progreso (excepto notas)

```javascript
// Response
{
  "message": "Habit deactivated successfully",
  "success": true
}
```

**UI Recomendada**:
```javascript
async function deactivateHabit(habitId) {
  const confirmed = await showConfirmDialog({
    title: '⚠️ ¿Desactivar hábito?',
    message: 'Se borrará TODO el progreso excepto las notas',
    confirmText: 'Sí, desactivar',
    isDangerous: true
  });

  if (confirmed) {
    await api.post(`/habits/${habitId}/deactivate`);
    refreshHabits();
  }
}
```

---

## 3️⃣ SISTEMA DE PÉRDIDA DE VIDAS

### ⏰ Evaluación Diaria Automática

**¿Cuándo ocurre?**: Todos los días a las 00:05 (servidor)

**¿Qué pasa?**:
1. Sistema evalúa hábitos del día anterior
2. Por cada hábito NO completado → -1 vida
3. Si llega a 0 vidas → TODOS los hábitos se bloquean

**Frontend debe**:
```javascript
// Al abrir la app, verificar estado
async function checkUserStatus() {
  const user = await api.get('/users/me');

  if (user.lives === 0) {
    // Mostrar modal o pantalla de "Game Over"
    showGameOverScreen({
      message: 'Te quedaste sin vidas',
      actions: [
        { text: 'Ver retos disponibles', action: goToChallenges },
        { text: 'Redimir Life Challenge', action: goToLifeChallenges }
      ]
    });

    // Deshabilitar UI de hábitos
    disableHabitsUI();
  }
}

// Polling opcional para detectar cambios
setInterval(checkUserStatus, 60000); // Cada minuto
```

---

## 4️⃣ SISTEMA DE RESURRECCIÓN (SIN VIDAS)

Cuando `lives = 0`, el usuario tiene 2 opciones:

### 🅰️ OPCIÓN 1: Completar Challenge Regular con Pruebas

#### Paso 1: Ver Challenges Disponibles para Revivir

**Endpoint**: `GET /challenges/available-for-revival`

⚠️ **Solo funciona si `lives = 0`**

```javascript
// Response
{
  "success": true,
  "challenges": [
    {
      "user_challenge_id": "uc-uuid",  // ID para enviar pruebas
      "challenge_id": "c-uuid",
      "title": "30 minutos de ejercicio",
      "description": "Completa 30 minutos de ejercicio",
      "difficulty": "medium",
      "habit_name": "Ejercicio",
      "assigned_at": "2024-01-15"
    }
  ],
  "message": "Completa uno de estos retos con pruebas para revivir"
}

// Si no hay challenges asignados
{
  "success": true,
  "challenges": [],
  "message": "No tienes retos asignados. Asigna un reto primero"
}
```

#### Paso 2: Enviar Pruebas del Challenge

**Endpoint**: `POST /challenges/:userChallengeId/submit-proof`

```javascript
// Request
{
  "proofText": "Hoy corrí 5km en el parque durante 35 minutos",
  "proofImageUrl": "https://cloudinary.com/image.jpg"  // Opcional
}

// Response - ÉXITO
{
  "success": true,
  "message": "Challenge completado exitosamente. ¡Has sido revivido con todas tus vidas!",
  "validationResult": {
    "is_valid": true,
    "confidence_score": 0.85,
    "reasoning": "Pruebas válidas"
  }
}

// Response - FALLO
{
  "success": false,
  "message": "Las pruebas no fueron suficientes. Intenta nuevamente.",
  "validationResult": {
    "is_valid": false,
    "confidence_score": 0.3,
    "reasoning": "Pruebas insuficientes"
  }
}
```

**UI Completa**:
```javascript
function RevivalChallengeFlow() {
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proofText, setProofText] = useState('');
  const [proofImage, setProofImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Cargar challenges disponibles
  useEffect(() => {
    api.get('/challenges/available-for-revival')
      .then(res => setChallenges(res.challenges));
  }, []);

  // 2. Enviar pruebas
  async function submitProof() {
    setIsSubmitting(true);

    const result = await api.post(
      `/challenges/${selectedChallenge.user_challenge_id}/submit-proof`,
      {
        proofText,
        proofImageUrl: await uploadImage(proofImage)
      }
    );

    if (result.success) {
      showSuccess('¡REVIVIDO! 🎉');
      // Recargar app con hábitos desbloqueados
      window.location.reload();
    } else {
      showError('Pruebas insuficientes. Intenta con más detalles o una foto.');
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <h2>🔥 Completa un Reto para Revivir</h2>

      {/* Lista de challenges */}
      {challenges.map(ch => (
        <ChallengeCard
          key={ch.user_challenge_id}
          {...ch}
          onSelect={() => setSelectedChallenge(ch)}
        />
      ))}

      {/* Formulario de pruebas */}
      {selectedChallenge && (
        <ProofForm>
          <textarea
            placeholder="Describe cómo completaste el reto..."
            value={proofText}
            onChange={e => setProofText(e.target.value)}
            minLength={20}
          />

          <ImageUpload
            onChange={setProofImage}
            hint="Añade una foto para mayor credibilidad"
          />

          <button
            onClick={submitProof}
            disabled={!proofText || isSubmitting}
          >
            {isSubmitting ? 'Validando...' : 'Enviar Pruebas'}
          </button>
        </ProofForm>
      )}
    </div>
  );
}
```

#### Paso 3: Verificar Estado de Validación

**Endpoint**: `GET /challenges/:userChallengeId/proof-status`

```javascript
// Response
{
  "success": true,
  "proof": {
    "proof_type": "both",
    "validation_status": "approved", // 'pending' | 'approved' | 'rejected'
    "validation_result": {
      "is_valid": true,
      "confidence_score": 0.85
    },
    "validated_at": "2024-01-19T10:30:00Z"
  }
}
```

### 🅱️ OPCIÓN 2: Redimir Life Challenges

Life Challenges son retos automáticos que se evalúan constantemente.

#### Ver Life Challenges con Estados

**Endpoint**: `GET /life-challenges?withStatus=true` o `GET /life-challenges/status`

```javascript
// Response
[
  {
    "life_challenge_id": "lc-uuid",
    "title": "Semana Perfecta",
    "description": "Mantén un hábito durante una semana sin perder vidas",
    "reward": 1,  // Vidas que otorga
    "redeemable_type": "once",  // 'once' | 'unlimited'
    "status": "obtained",  // 'pending' | 'obtained' | 'redeemed'
    "can_redeem": true,
    "obtained_at": "2024-01-19T08:00:00Z",
    "redeemed_at": null
  },
  {
    "title": "Madrugador",
    "status": "redeemed",  // Ya fue canjeado
    "can_redeem": false,
    "redeemed_at": "2024-01-18T06:00:00Z"
  },
  {
    "title": "Mes Imparable",
    "status": "pending",  // Aún no cumple requisitos
    "can_redeem": false
  }
]
```

**UI de Life Challenges**:
```javascript
function LifeChallengesPanel() {
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    api.get('/life-challenges/status')
      .then(setChallenges);
  }, []);

  return (
    <div>
      {challenges.map(lc => (
        <LifeChallengeCard key={lc.life_challenge_id}>
          <h3>{lc.title}</h3>
          <p>{lc.description}</p>

          {/* Badge de estado */}
          {lc.status === 'obtained' && (
            <Badge color="green">✓ Obtenido</Badge>
          )}
          {lc.status === 'redeemed' && (
            <Badge color="gray">Redimido</Badge>
          )}
          {lc.status === 'pending' && (
            <Badge color="yellow">Pendiente</Badge>
          )}

          {/* Botón de redimir */}
          {lc.can_redeem && (
            <button onClick={() => redeemLifeChallenge(lc.life_challenge_id)}>
              Redimir +{lc.reward} vida(s)
            </button>
          )}

          {/* Información adicional */}
          {lc.redeemable_type === 'once' && lc.status === 'redeemed' && (
            <small>Solo se puede redimir una vez</small>
          )}
        </LifeChallengeCard>
      ))}
    </div>
  );
}
```

#### Redimir Life Challenge

**Endpoint**: `POST /life-challenges/:id/redeem`

```javascript
// Response - ÉXITO
{
  "success": true,
  "message": "¡Challenge redimido! Has ganado 1 vida(s)",
  "livesGained": 1
}

// Response - ERROR (ya redimido o no cumple requisitos)
{
  "success": false,
  "message": "Este challenge ya fue redimido"
}
```

**Función de Redimir**:
```javascript
async function redeemLifeChallenge(lifeChallengeId) {
  try {
    const result = await api.post(`/life-challenges/${lifeChallengeId}/redeem`);

    if (result.success) {
      showSuccess(`+${result.livesGained} vida(s) ganadas!`);
      // Actualizar contador de vidas
      refreshUserInfo();
      // Actualizar lista de Life Challenges
      refreshLifeChallenges();
    }
  } catch (error) {
    showError(error.message);
  }
}
```

---

## 5️⃣ FLUJOS COMPLETOS DE UI

### 🔴 Flujo: Usuario Sin Vidas

```javascript
function NoLivesFlow() {
  const [userLives, setUserLives] = useState(0);
  const [view, setView] = useState('options'); // 'options' | 'challenges' | 'life-challenges'

  if (userLives > 0) {
    return <Navigate to="/habits" />;
  }

  return (
    <GameOverScreen>
      <h1>😵 Te quedaste sin vidas</h1>
      <p>Tus hábitos están bloqueados hasta que revivas</p>

      {view === 'options' && (
        <div className="revival-options">
          <button onClick={() => setView('challenges')}>
            🎯 Completar Reto con Pruebas
          </button>

          <button onClick={() => setView('life-challenges')}>
            ⭐ Redimir Life Challenge
          </button>
        </div>
      )}

      {view === 'challenges' && (
        <RevivalChallengeFlow
          onRevive={() => window.location.reload()}
        />
      )}

      {view === 'life-challenges' && (
        <LifeChallengesPanel
          onRedeem={refreshUserInfo}
        />
      )}
    </GameOverScreen>
  );
}
```

### 🟢 Flujo: Día Normal con Vidas

```javascript
function DailyHabitsFlow() {
  const [habits, setHabits] = useState([]);
  const [user, setUser] = useState(null);
  const [lifeChallenges, setLifeChallenges] = useState([]);

  // Cargar todo al inicio
  useEffect(() => {
    Promise.all([
      api.get('/users/me'),
      api.get('/habits'),
      api.get('/life-challenges/status')
    ]).then(([userData, habitsData, lcData]) => {
      setUser(userData);
      setHabits(habitsData);
      setLifeChallenges(lcData.filter(lc => lc.can_redeem));
    });
  }, []);

  // Marcar hábito como completado
  async function completeHabit(habitId) {
    const result = await api.post(`/habits/${habitId}/completions`, {
      date: getTodayDate(),
      completed: 1,
      progress_type: 'yes_no'
    });

    // Verificar nuevos Life Challenges
    if (result.new_life_challenges_obtained?.length > 0) {
      showNotification(
        `🎉 Life Challenge obtenido: ${result.new_life_challenges_obtained[0].title}`
      );
      setLifeChallenges([...lifeChallenges, ...result.new_life_challenges_obtained]);
    }

    // Actualizar UI
    updateHabitStatus(habitId, 'completed');
  }

  return (
    <div>
      {/* Indicador de vidas */}
      <LivesBar current={user?.lives} max={user?.max_lives} />

      {/* Life Challenges redimibles */}
      {lifeChallenges.length > 0 && (
        <Alert>
          Tienes {lifeChallenges.length} Life Challenge(s) para redimir
          <button onClick={() => navigate('/life-challenges')}>Ver</button>
        </Alert>
      )}

      {/* Lista de hábitos */}
      {habits.map(habit => (
        <HabitCard
          key={habit.id}
          {...habit}
          isBlocked={!habit.is_active && habit.disabled_reason === 'no_lives'}
          onComplete={() => completeHabit(habit.id)}
        />
      ))}
    </div>
  );
}
```

---

## 6️⃣ MANEJO DE ESTADOS Y ERRORES

### Estados Críticos a Manejar

```javascript
const AppStates = {
  HEALTHY: 'User has lives, habits active',
  LOW_LIVES: 'User has 1 life (warning)',
  DEAD: 'User has 0 lives, habits blocked',
  REVIVING: 'User submitting proof for revival',
  REVIVED: 'User just got lives back'
};
```

### Errores Comunes y Manejo

```javascript
// Interceptor global de Axios
axios.interceptors.response.use(
  response => response,
  error => {
    const { status, data } = error.response;

    // Usuario sin vidas intentando hacer algo
    if (status === 400 && data.message?.includes('no lives')) {
      redirectToRevivalFlow();
      return;
    }

    // Life Challenge ya redimido
    if (status === 409 && data.message?.includes('already redeemed')) {
      showWarning('Este Life Challenge ya fue redimido');
      refreshLifeChallenges();
      return;
    }

    // Challenge proof rechazado
    if (status === 400 && data.message?.includes('pruebas')) {
      showError('Pruebas insuficientes. Intenta con más detalles.');
      return;
    }

    throw error;
  }
);
```

---

## 7️⃣ NOTIFICACIONES Y FEEDBACK

### Momentos Clave para Notificar

```javascript
// 1. Pérdida de vida (polling o websocket)
onLivesLost((livesRemaining) => {
  if (livesRemaining === 1) {
    showWarning('⚠️ Te queda 1 vida. ¡Cuidado!');
  } else if (livesRemaining === 0) {
    showDanger('💀 Sin vidas. Completa un reto para revivir.');
  }
});

// 2. Life Challenge obtenido
onLifeChallengeObtained((challenge) => {
  showSuccess(`🌟 Life Challenge desbloqueado: ${challenge.title}`);
  playSound('achievement.mp3');
});

// 3. Resurrección exitosa
onRevival(() => {
  showSuccess('🎉 ¡REVIVIDO! Tus hábitos están activos nuevamente');
  confetti.start();
});

// 4. Evaluación diaria (00:05)
scheduleNotification({
  time: '00:05',
  message: 'Evaluando hábitos del día anterior...',
  callback: checkForLostLives
});
```

---

## 8️⃣ OPTIMIZACIONES Y MEJORES PRÁCTICAS

### Cache y Estado Global

```javascript
// Store global (Redux/Zustand)
const useGameStore = create((set) => ({
  user: null,
  habits: [],
  lifeChallenges: [],

  refreshUser: async () => {
    const user = await api.get('/users/me');
    set({ user });

    // Si no tiene vidas, actualizar UI
    if (user.lives === 0) {
      set(state => ({
        habits: state.habits.map(h => ({ ...h, blocked: true }))
      }));
    }
  },

  completeHabit: async (habitId, date) => {
    const result = await api.post(`/habits/${habitId}/completions`, {
      date,
      completed: 1,
      progress_type: 'yes_no'
    });

    // Actualizar Life Challenges si hay nuevos
    if (result.new_life_challenges_obtained) {
      set(state => ({
        lifeChallenges: [...state.lifeChallenges, ...result.new_life_challenges_obtained]
      }));
    }
  }
}));
```

### Sincronización con Backend

```javascript
// Sincronizar estado cada vez que la app vuelve al foco
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncWithBackend();
  }
});

async function syncWithBackend() {
  const user = await api.get('/users/me');

  // Detectar cambios importantes
  if (user.lives === 0 && store.user.lives > 0) {
    // Usuario perdió todas sus vidas
    showGameOverScreen();
  } else if (user.lives > 0 && store.user.lives === 0) {
    // Usuario revivió
    showRevivalSuccess();
    reloadHabits();
  }

  store.setUser(user);
}
```

---

## 9️⃣ DIAGRAMA DE FLUJO VISUAL

```
┌─────────────────────┐
│   USUARIO ACTIVO    │
│   Lives: 2/2        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Completa Hábitos   │◄──────┐
│  POST /completions  │       │
└──────────┬──────────┘       │
           │                  │
           ▼                  │
    ¿Life Challenge           │
      Obtenido?               │
           │                  │
     ┌─────┴─────┐           │
     │ SÍ      NO│           │
     ▼           ▼           │
┌──────────┐  Continuar      │
│Notificar │      │          │
│ & Mostrar│      │          │
│  Botón   │      │          │
│ Redimir  │      │          │
└──────────┘      │          │
                  ▼          │
         ┌────────────────┐  │
         │  00:05 DIARIO  │  │
         │  Evaluación    │  │
         └────────┬───────┘  │
                  │          │
                  ▼          │
         ¿Hábitos Fallados?  │
                  │          │
            ┌─────┴─────┐    │
            │ SÍ      NO│────┘
            ▼
    ┌──────────────┐
    │ Pierde Vidas │
    │   -1 c/u     │
    └──────┬───────┘
           │
           ▼
      ¿Lives = 0?
           │
     ┌─────┴─────┐
     │ SÍ      NO│────────┐
     ▼                    │
┌──────────────┐          │
│HÁBITOS       │          │
│BLOQUEADOS    │          │
└──────┬───────┘          │
       │                  │
       ▼                  │
   RESURRECCIÓN           │
       │                  │
   ┌───┴────┐            │
   │        │            │
   ▼        ▼            │
CHALLENGE  LIFE          │
  CON      CHALLENGE     │
PRUEBAS    REDEEM        │
   │         │           │
   ▼         ▼           │
VALIDAR   INSTANT        │
  AI      REVIVAL        │
   │         │           │
   └─────┬───┘           │
         ▼               │
    ┌─────────┐          │
    │REVIVIDO │          │
    │Lives=MAX│◄─────────┘
    └─────────┘
```

---

## 🔟 CHECKLIST DE IMPLEMENTACIÓN

### Fase 1: Base
- [ ] Implementar login y obtener token JWT
- [ ] Guardar y mostrar vidas del usuario
- [ ] Listar hábitos con estados (activo/bloqueado)
- [ ] Marcar hábitos como completados

### Fase 2: Sistema de Vidas
- [ ] Detectar cuando usuario tiene 0 vidas
- [ ] Bloquear UI de hábitos cuando no hay vidas
- [ ] Mostrar pantalla de "Game Over"
- [ ] Implementar navegación a opciones de revival

### Fase 3: Resurrección con Challenges
- [ ] Listar challenges disponibles para revival
- [ ] Formulario de envío de pruebas (texto + imagen)
- [ ] Upload de imágenes a CDN
- [ ] Manejo de respuesta de validación
- [ ] Refrescar app tras revival exitoso

### Fase 4: Life Challenges
- [ ] Mostrar Life Challenges con estados
- [ ] Botón de redimir con feedback
- [ ] Notificaciones de nuevos Life Challenges obtenidos
- [ ] Badge/contador de Life Challenges disponibles

### Fase 5: Polish
- [ ] Animaciones de pérdida/ganancia de vidas
- [ ] Notificaciones push para evaluación diaria
- [ ] Modo offline con sincronización
- [ ] Tutorial para nuevos usuarios

---

## 📞 SOPORTE Y ERRORES COMUNES

### Error: "Cannot gain more lives"
- Usuario ya tiene máximo de vidas
- Mostrar mensaje informativo, no error

### Error: "Life challenge already redeemed"
- Challenge tipo "once" ya fue usado
- Actualizar UI para mostrar como "redeemed"

### Error: "Esta función solo está disponible cuando no tienes vidas"
- Usuario intenta acceder a revival con vidas > 0
- Redirigir a pantalla normal de hábitos

### Error: "Pruebas insuficientes"
- Validación AI rechazó las pruebas
- Pedir más detalles o foto
- Permitir reintentar

---

## 💡 TIPS FINALES

1. **Siempre verificar `lives` antes de operaciones críticas**
2. **Cachear Life Challenges status por máximo 5 minutos**
3. **Implementar retry automático en endpoints de validación**
4. **Guardar borradores de pruebas en localStorage**
5. **Mostrar tiempo hasta próxima evaluación (00:05)**
6. **Implementar modo "práctica" sin perder vidas para nuevos usuarios**

---

**Última actualización**: 19 de Enero 2024
**Versión API**: 1.0.0
**Contacto Backend**: [Tu nombre/email]