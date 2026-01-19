# Prompt para Crear Dashboard de Moderación de Validaciones

## Contexto del Proyecto

Estoy desarrollando una aplicación de hábitos llamada **HabitRush**. Cuando un usuario falla un hábito, puede elegir completar un "challenge" para no perder una vida. Cuando envía la prueba del challenge, esta va a una cola de moderación donde:

1. Un administrador puede aprobar/rechazar manualmente
2. Si no se revisa en 1 hora, la IA lo valida automáticamente

Necesito un dashboard de administración para moderar estas validaciones.

---

## APIs Disponibles

### Autenticación
Todas las APIs requieren header: `Authorization: Bearer <token>`
El usuario debe tener `is_admin: true` en la base de datos.

### Endpoints

#### 1. Listar todas las validaciones
```
GET /admin/validations?status=pending_review&limit=50&offset=0
```

**Query params:**
- `status` (opcional): `pending_review`, `approved_manual`, `rejected_manual`, `approved_ai`, `rejected_ai`
- `limit`: número de resultados (default 50)
- `offset`: paginación

**Response:**
```json
{
  "success": true,
  "validations": [
    {
      "id": "uuid",
      "pending_redemption_id": "uuid",
      "user_id": "uuid",
      "challenge_id": "uuid",
      "proof_text": "Hoy corrí 5km en el parque...",
      "proof_image_url": "data:image/jpeg;base64,...",
      "proof_type": "both",
      "status": "pending_review",
      "reviewer_notes": null,
      "reviewed_by": null,
      "reviewed_at": null,
      "ai_result": null,
      "challenge_title": "Correr 5km",
      "challenge_description": "Corre al menos 5 kilómetros",
      "challenge_difficulty": "hard",
      "habit_name": "Ejercicio",
      "user_email": "usuario@email.com",
      "created_at": "2026-01-03T10:00:00.000Z",
      "expires_at": "2026-01-03T11:00:00.000Z"
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

#### 2. Listar solo pendientes (vista rápida)
```
GET /admin/validations/pending
```

**Response:**
```json
{
  "success": true,
  "validations": [...],
  "count": 5
}
```

#### 3. Obtener estadísticas
```
GET /admin/validations/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "pending_review": 5,
    "approved_manual": 80,
    "rejected_manual": 10,
    "approved_ai": 50,
    "rejected_ai": 5,
    "avg_review_time_minutes": 12
  }
}
```

#### 4. Ver detalle de una validación
```
GET /admin/validations/:id
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "id": "uuid",
    "proof_text": "...",
    "proof_image_url": "data:image/jpeg;base64,...",
    ...
  }
}
```

#### 5. Aprobar manualmente
```
POST /admin/validations/:id/approve
```

**Body (opcional):**
```json
{
  "notes": "Prueba válida, se ve claramente el ejercicio"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Validación aprobada manualmente",
  "validation_id": "uuid"
}
```

#### 6. Rechazar manualmente
```
POST /admin/validations/:id/reject
```

**Body (requerido):**
```json
{
  "notes": "La imagen no muestra evidencia del challenge"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Validación rechazada. El usuario puede enviar nueva prueba.",
  "validation_id": "uuid",
  "rejection_reason": "La imagen no muestra evidencia del challenge"
}
```

#### 7. Ejecutar validación AI manualmente (para testing)
```
POST /admin/validations/:id/run-ai
```

**Response:**
```json
{
  "success": true,
  "message": "Validación procesada por AI",
  "validation_id": "uuid",
  "ai_result": {
    "is_valid": true,
    "confidence_score": 0.85,
    "reasoning": "La descripción coincide con el challenge..."
  }
}
```

---

## Requisitos del Dashboard

### Funcionalidades principales:

1. **Vista de cola de moderación**
   - Lista de validaciones pendientes ordenadas por fecha (más antiguas primero)
   - Mostrar tiempo restante antes de que la IA valide automáticamente
   - Badge/indicador de urgencia cuando quedan menos de 15 minutos

2. **Tarjeta de validación**
   - Información del challenge (título, descripción, dificultad)
   - Información del usuario (email)
   - Información del hábito fallado
   - **Prueba de texto** (si existe)
   - **Prueba de imagen** (si existe) - mostrar imagen completa con zoom
   - Botones: Aprobar | Rechazar | Ver en IA (testing)

3. **Modal de aprobación**
   - Campo opcional para notas
   - Confirmación antes de aprobar

4. **Modal de rechazo**
   - Campo obligatorio para razón del rechazo
   - Confirmación antes de rechazar

5. **Historial de validaciones**
   - Filtros por estado
   - Ver resultado de IA cuando aplicó
   - Ver notas del revisor cuando fue manual

6. **Dashboard de estadísticas**
   - Gráfico de validaciones por estado
   - Tiempo promedio de revisión
   - Ratio manual vs AI
   - Ratio aprobación vs rechazo

### UI/UX sugerida:

```
┌─────────────────────────────────────────────────────────────────────┐
│  HabitRush Admin - Moderación de Validaciones                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Pendientes  │ │ Aprobadas   │ │ Rechazadas  │ │ Por AI      │   │
│  │     5       │ │    80       │ │     15      │ │    55       │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Cola de Moderación (5 pendientes)                           │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │ ⚠️ Expira en 12 min                                 │   │   │
│  │  │                                                     │   │   │
│  │  │ Challenge: Correr 5km (hard)                        │   │   │
│  │  │ Hábito: Ejercicio                                   │   │   │
│  │  │ Usuario: juan@email.com                             │   │   │
│  │  │                                                     │   │   │
│  │  │ Prueba texto:                                       │   │   │
│  │  │ "Hoy corrí 5.2km en el parque central..."          │   │   │
│  │  │                                                     │   │   │
│  │  │ Prueba imagen:                                      │   │   │
│  │  │ [📷 Ver imagen]                                     │   │   │
│  │  │                                                     │   │   │
│  │  │ [✅ Aprobar] [❌ Rechazar] [🤖 Test AI]            │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │ Expira en 45 min                                    │   │   │
│  │  │ ...                                                 │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tecnologías sugeridas:
- React/Next.js o Vue.js
- Tailwind CSS para estilos
- SWR o React Query para fetching
- Chart.js o Recharts para gráficos

### Consideraciones:
- Polling cada 30 segundos para actualizar la lista de pendientes
- Sonido/notificación cuando llega nueva validación
- Modo oscuro
- Responsive para tablet (usar en móvil ocasionalmente)

---

## Estados de validación

| Estado | Descripción | Color sugerido |
|--------|-------------|----------------|
| `pending_review` | Esperando revisión | Amarillo/Naranja |
| `approved_manual` | Aprobado por admin | Verde |
| `rejected_manual` | Rechazado por admin | Rojo |
| `approved_ai` | Aprobado por IA (timeout) | Verde claro |
| `rejected_ai` | Rechazado por IA (timeout) | Rojo claro |

---

## Flujo del usuario cuando se aprueba/rechaza

**Si se APRUEBA:**
1. El pending_redemption se marca como `redeemed_challenge`
2. El hábito se desbloquea
3. El usuario NO pierde vida
4. Se aumenta el discipline_score del usuario

**Si se RECHAZA:**
1. El pending_redemption sigue en `challenge_assigned`
2. El usuario puede enviar NUEVA prueba
3. Se crea nueva entrada en PENDING_VALIDATIONS
4. Si el pending_redemption expira antes de una nueva prueba → pierde vida

---

## Ejemplo de implementación React

```jsx
// components/ValidationCard.jsx
export function ValidationCard({ validation, onApprove, onReject }) {
  const timeRemaining = new Date(validation.expires_at) - new Date();
  const minutes = Math.floor(timeRemaining / 60000);
  const isUrgent = minutes < 15;

  return (
    <div className={`card ${isUrgent ? 'border-red-500' : ''}`}>
      <div className="header">
        <span className={isUrgent ? 'text-red-500 font-bold' : ''}>
          {isUrgent ? '⚠️' : '⏰'} Expira en {minutes} min
        </span>
      </div>

      <div className="content">
        <h3>{validation.challenge_title}</h3>
        <p className="text-gray-500">{validation.challenge_description}</p>
        <p>Dificultad: {validation.challenge_difficulty}</p>
        <p>Hábito: {validation.habit_name}</p>
        <p>Usuario: {validation.user_email}</p>

        {validation.proof_text && (
          <div className="proof-text">
            <h4>Prueba texto:</h4>
            <p>"{validation.proof_text}"</p>
          </div>
        )}

        {validation.proof_image_url && (
          <div className="proof-image">
            <h4>Prueba imagen:</h4>
            <img src={validation.proof_image_url} alt="Proof" />
          </div>
        )}
      </div>

      <div className="actions">
        <button onClick={() => onApprove(validation.id)} className="btn-approve">
          ✅ Aprobar
        </button>
        <button onClick={() => onReject(validation.id)} className="btn-reject">
          ❌ Rechazar
        </button>
      </div>
    </div>
  );
}
```

---

## Notas adicionales

1. **Seguridad**: Solo usuarios con `is_admin: true` pueden acceder a estas APIs
2. **Auditoría**: Todas las acciones quedan registradas (quién aprobó/rechazó, cuándo)
3. **AI como backup**: Si no revisas en 1 hora, la IA decide automáticamente
4. **Mejora continua**: Usa el historial para ver qué tipo de pruebas envían y mejorar los prompts de la IA
