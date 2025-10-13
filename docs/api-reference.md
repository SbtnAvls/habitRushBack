# HabitRush API Reference

Esta guía agrupa los endpoints backend por “feature”, siguiendo la estructura del plan funcional y detalla lo que cada API espera recibir, sus respuestas exitosas y los errores controlados más comunes. Todos los endpoints responden en JSON.

> **Autenticación**: siempre que un endpoint indique “Auth: Bearer” debe incluirse el header `Authorization: Bearer <token JWT>`.

---

## Autenticación y Usuarios (`/api/auth`, `/api/users`)

### POST `/api/auth/register`
- **Descripción**: Registrar un nuevo usuario.
- **Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "mypassword"
  }
  ```
  `password` debe tener al menos 6 caracteres.
- **Respuesta 201**:
  ```json
  { "token": "<jwt>" }
  ```
- **Errores controlados**:
  - 400 `name, email and password are required`
  - 400 `Password must be at least 6 characters long`
  - 400 `User already exists`
  - 500 `Server error`

### POST `/api/auth/login`
- **Descripción**: Iniciar sesión.
- **Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "mypassword"
  }
  ```
- **Respuesta 200**:
  ```json
  { "token": "<jwt>" }
  ```
- **Errores**:
  - 400 `email and password are required`
  - 400 `Invalid credentials`
  - 500 `Server error`

### GET `/api/auth/me` *(Auth: Bearer)*
- **Descripción**: Obtener los datos del usuario autenticado.
- **Respuesta 200**: objeto `User` sin `password_hash`.
- **Errores**:
  - 401 `Not authenticated`
  - 404 `User not found`
  - 500 `Server error`

### POST `/api/auth/logout` *(Auth: Bearer)*
- **Descripción**: Invalidar la sesión actual (solo respuesta informativa).
- **Respuesta 200**:
  ```json
  { "message": "Successfully logged out" }
  ```

### GET `/api/users/me` *(Auth: Bearer)*
- **Descripción**: Obtener perfil del usuario autenticado.
- **Respuesta**: objeto `User` sin `password_hash`.
- **Errores**: 401 `Not authenticated`, 404 `User not found`.

### PUT `/api/users/me` *(Auth: Bearer)*
- **Descripción**: Actualizar nombre, tema o tamaño de fuente.
- **Body** (al menos un campo):
  ```json
  {
    "name": "Jane D.",
    "theme": "dark",
    "font_size": "large"
  }
  ```
  `theme`: `light` | `dark`; `font_size`: `small` | `medium` | `large`.
- **Respuesta 200**: usuario actualizado (sin `password_hash`).
- **Errores**:
  - 400 `At least one field (name, theme, font_size) is required`
  - 400 `Invalid theme provided`
  - 400 `Invalid font_size provided`
  - 404 `User not found`

### DELETE `/api/users/me` *(Auth: Bearer)*
- **Descripción**: Eliminar definitivamente al usuario.
- **Respuesta 204** (sin contenido).
- **Errores**: 401 `Not authenticated`, 404 `User not found`.

---

## Hábitos (`/api/habits`)

### GET `/api/habits` *(Auth: Bearer)*
- **Descripción**: Lista todos los hábitos activos del usuario autenticado.
- **Respuesta 200**: arreglo de objetos `Habit`.

### GET `/api/habits/:id` *(Auth: Bearer)*
- **Descripción**: Obtiene un hábito específico del usuario.
- **Errores**: 404 `Habit not found`.

### POST `/api/habits` *(Auth: Bearer)*
- **Descripción**: Crea un hábito.
- **Body** obligatorio:
  ```json
  {
    "name": "Read 10 pages",
    "description": "Daily reading",
    "frequency_type": "daily",
    "progress_type": "count",
    "target_date": "2025-12-31",
    "frequency_days_of_week": [1, 3, 5]
  }
  ```
  `frequency_type`: `daily` | `weekly` | `custom`.  
  `progress_type`: `yes_no` | `time` | `count`.  
  `frequency_days_of_week` se almacena como CSV, se acepta array.
- **Respuesta 201**: objeto `Habit` creado.
- **Errores**:
  - 400 `name, frequency_type and progress_type are required`
  - 400 `Invalid frequency_type provided`
  - 400 `Invalid progress_type provided`

### PUT `/api/habits/:id` *(Auth: Bearer)*
- **Descripción**: Actualiza campos del hábito.
- **Body**: cualquier campo editable (`name`, `description`, `frequency_type`, `progress_type`, etc.).
- **Respuesta 200**: `{ "message": "Habit updated successfully" }`
- **Errores**:
  - 404 `Habit not found`
  - 400 `Invalid frequency_type provided`
  - 400 `Invalid progress_type provided`

### DELETE `/api/habits/:id` *(Auth: Bearer)*
- **Descripción**: Eliminación lógica (`deleted_at`).
- **Respuesta 204**
- **Errores**: 404 `Habit not found`

---

## Cumplimiento de Hábitos (`/api/habits/:habitId/completions`, `/api/completions`, `/api/images`)

### GET `/api/habits/:habitId/completions` *(Auth: Bearer)*
- **Descripción**: Obtiene las ejecuciones registradas del hábito.
- **Respuesta 200**: arreglo de `HabitCompletionRecord`.
- **Errores**: 500 `Error getting habit completions`

### POST `/api/habits/:habitId/completions` *(Auth: Bearer)*
- **Descripción**: Crea o actualiza el cumplimiento de una fecha específica.
- **Body**:
  ```json
  {
    "date": "2025-10-12",
    "completed": true,
    "progress_type": "count",
    "progress_value": 8,
    "target_value": 10,
    "notes": "Two sets remaining"
  }
  ```
- **Respuesta 201**: registro creado/actualizado.
- **Errores**:
  - 400 `date, completed and progress_type are required fields.`
  - 500 `Invalid progress_type provided` (desde la capa de modelo)

### PUT `/api/completions/:id` *(Auth: Bearer)*
- **Descripción**: Actualiza solo las notas del cumplimiento.
- **Body**:
  ```json
  { "notes": "Adjusted goal" }
  ```
- **Respuesta 200**: registro actualizado.
- **Errores**:
  - 400 `notes field is required to update a habit completion.`
  - 404 `Habit completion not found`

### DELETE `/api/completions/:id` *(Auth: Bearer)*
- **Descripción**: Elimina definitivamente un cumplimiento.
- **Respuesta 204**
- **Errores**: 404 `Habit completion not found`

### POST `/api/completions/:id/images` *(Auth: Bearer)*
- **Descripción**: Añade una imagen a un cumplimiento.
- **Body**:
  ```json
  {
    "imageUrl": "https://cdn.example.com/proof.png",
    "thumbnailUrl": "https://cdn.example.com/thumb.png"
  }
  ```
- **Respuesta 201**: objeto `CompletionImageRecord`.
- **Errores**:
  - 400 `imageUrl is required.`
  - 500 `Completion not found or user does not have permission.` (throw del modelo)
  - 500 `Maximum number of images (5) for this completion reached.`

### DELETE `/api/images/:id` *(Auth: Bearer)*
- **Descripción**: Elimina una imagen propia.
- **Respuesta 204**
- **Errores**: 404 `Image not found`

---

## Desafíos (`/api/challenges`, `/api/users/me/challenges`)

### GET `/api/challenges` *(Auth: Bearer)*
- Lista los desafíos activos disponibles.

### GET `/api/users/me/challenges` *(Auth: Bearer)*
- Desafíos asignados al usuario (incluye metadatos del desafío).

### POST `/api/challenges/:id/assign` *(Auth: Bearer)*
- **Body**:
  ```json
  { "habitId": "{{habitId}}" }
  ```
- **Respuesta 201**: objeto `UserChallenge`.
- **Errores**:
  - 400 `habitId is required`
  - 404 `Challenge not found or inactive.`
  - 404 `Habit not found.`
  - 409 `Challenge already assigned to this habit.`

### PUT `/api/users/me/challenges/:id` *(Auth: Bearer)*
- **Body**:
  ```json
  { "status": "completed" }
  ```
  `status`: `completed` | `discarded`.
- **Respuesta 200**: desafío actualizado.
- **Errores**:
  - 400 `Invalid status provided. Must be 'completed' or 'discarded'.`
  - 404 `User challenge not found or permission denied.`

---

## Vidas y Desafíos de Vida (`/api/life-challenges`, `/api/users/me/life-history`)

### GET `/api/life-challenges`
- **Descripción**: Lista pública de desafíos de vida activos (no requiere token).

### POST `/api/life-challenges/:id/redeem` *(Auth: Bearer)*
- **Descripción**: Redimir un desafío de vida para recuperar vidas.
- **Respuesta 200**:
  ```json
  {
    "message": "Life challenge redeemed successfully",
    "livesGained": 1,
    "currentLives": 3
  }
  ```
- **Errores**:
  - 404 `Life challenge not found or not active`
  - 409 `Life challenge already redeemed`
  - 404 `User not found`
  - 400 `Cannot gain more lives`

### GET `/api/users/me/life-history` *(Auth: Bearer)*
- **Descripción**: Historial cronológico de cambios de vidas del usuario.

---

## Ligas (`/api/leagues`, `/api/users/me/league-history`)

### GET `/api/leagues/current` *(Auth: Bearer)*
- **Descripción**: Devuelve la liga actual del usuario y el ranking semanal.
- **Respuestas**:
  - 200 con `league` y `competitors`.
  - 200 `{ "message": "User not found in any league for the current week.", "competitors": [] }`
  - 404 `No active league week found.`
  - 404 `League not found.`

### GET `/api/users/me/league-history` *(Auth: Bearer)*
- **Descripción**: Historial de semanas en ligas.

---

## Notificaciones (`/api/users/me/notifications`, `/api/notifications`)

### GET `/api/users/me/notifications` *(Auth: Bearer)*
- **Descripción**: Lista las notificaciones del usuario ordenadas por fecha.

### PUT `/api/notifications/:id/read` *(Auth: Bearer)*
- **Descripción**: Marca una notificación propia como leída.
- **Respuesta 204**
- **Errores**:
  - 404 `Notification not found`
  - 403 `Forbidden: You can only update your own notifications`

### DELETE `/api/notifications/:id` *(Auth: Bearer)*
- **Descripción**: Elimina una notificación del usuario.
- **Respuesta 204**
- **Errores**:
  - 404 `Notification not found`
  - 403 `Forbidden: You can only delete your own notifications`

---

## Variables de Entorno Clave
El backend lee sus credenciales desde `.env`:
```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
```
Recuerda alinear los valores con tu entorno antes de probar los endpoints.

---

Con esta referencia, el equipo de frontend puede implementar cada flujo sabiendo qué payloads enviar, qué respuestas esperar y cómo manejar los errores previstos.
