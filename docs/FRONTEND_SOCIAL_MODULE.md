# Módulo Social - Guía de Implementación Frontend

## Resumen

El módulo social permite a los usuarios buscar otros usuarios, seguirlos/dejar de seguir, ver listas de seguidores/seguidos y consultar perfiles públicos con estadísticas.

**Base URL:** `/social`
**Autenticación:** Todos los endpoints requieren token JWT en header `Authorization: Bearer <token>`

---

## Endpoints

### 1. Buscar Usuarios

Busca usuarios por username. Útil para la pantalla de búsqueda/explorar.

```
GET /social/search?q=<query>&page=1&limit=20
```

#### Parámetros Query

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `q` | string | ✅ | - | Texto a buscar (mínimo 2 caracteres) |
| `page` | number | ❌ | 1 | Página actual |
| `limit` | number | ❌ | 20 | Resultados por página (máx 50) |

#### Response 200

```json
{
  "users": [
    {
      "id": "a9cbf304-6542-4824-8c7b-fdc48646bdf2",
      "username": "johndoe",
      "followers_count": 150,
      "following_count": 89,
      "is_profile_public": true,
      "is_following": true
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

#### Campos de Usuario

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | UUID del usuario |
| `username` | string | Nombre de usuario |
| `followers_count` | number | Cantidad de seguidores |
| `following_count` | number | Cantidad de seguidos |
| `is_profile_public` | boolean | Si el perfil es público |
| `is_following` | boolean | Si el usuario actual lo sigue |

#### Errores

| Status | Mensaje | Causa |
|--------|---------|-------|
| 400 | "Search query (q) is required" | Falta el parámetro `q` |
| 400 | "Search query must be at least 2 characters" | Query muy corto |
| 401 | "Not authenticated" | Token inválido/ausente |

#### Notas de Implementación

- Los resultados excluyen al usuario actual
- Ordenados por: matches que empiezan con el query primero, luego por popularidad (followers_count)
- El campo `is_following` permite mostrar botón "Following" o "Follow" directamente

---

### 2. Seguir Usuario

```
POST /social/follow/:userId
```

#### Parámetros Path

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `userId` | string | UUID del usuario a seguir |

#### Response 200

```json
{
  "message": "Successfully followed user"
}
```

#### Errores

| Status | Mensaje | Causa |
|--------|---------|-------|
| 400 | "Cannot follow yourself" | Intentó seguirse a sí mismo |
| 400 | "User not found" | El userId no existe |
| 400 | "Already following this user" | Ya lo sigue |
| 401 | "Not authenticated" | Token inválido/ausente |

---

### 3. Dejar de Seguir Usuario

```
DELETE /social/follow/:userId
```

#### Parámetros Path

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `userId` | string | UUID del usuario a dejar de seguir |

#### Response 200

```json
{
  "message": "Successfully unfollowed user"
}
```

#### Errores

| Status | Mensaje | Causa |
|--------|---------|-------|
| 400 | "Cannot unfollow yourself" | Intentó dejar de seguirse |
| 400 | "Not following this user" | No lo seguía |
| 401 | "Not authenticated" | Token inválido/ausente |

---

### 4. Estado de Follow Mutuo

Obtiene si el usuario actual sigue al target y viceversa. Útil para mostrar badges como "Follows you".

```
GET /social/follow-status/:userId
```

#### Response 200

```json
{
  "isFollowing": true,
  "isFollowedBy": false
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `isFollowing` | boolean | Si el usuario actual sigue al target |
| `isFollowedBy` | boolean | Si el target sigue al usuario actual |

---

### 5. Lista de Seguidores

Obtiene los usuarios que siguen a un usuario específico.

```
GET /social/followers/:userId?page=1&limit=20
```

#### Parámetros

| Parámetro | Tipo | Ubicación | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `userId` | string | path | - | UUID del usuario |
| `page` | number | query | 1 | Página actual |
| `limit` | number | query | 20 | Resultados por página (máx 50) |

#### Response 200

```json
{
  "users": [
    {
      "id": "b1234567-...",
      "username": "follower1",
      "is_profile_public": true,
      "followers_count": 50,
      "following_count": 30,
      "created_at": "2024-06-15T10:30:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

> **Nota:** `created_at` aquí es la fecha en que comenzó a seguir, no la fecha de registro del usuario.

---

### 6. Lista de Seguidos

Obtiene los usuarios que un usuario específico sigue.

```
GET /social/following/:userId?page=1&limit=20
```

#### Response 200

Mismo formato que `/followers/:userId`

---

### 7. Perfil Público

Obtiene el perfil público de un usuario con estadísticas resumidas.

```
GET /social/profile/:userId
```

#### Response 200 - Perfil Público

```json
{
  "id": "a9cbf304-6542-4824-8c7b-fdc48646bdf2",
  "username": "johndoe",
  "is_profile_public": true,
  "is_following": true,
  "follows_you": false,
  "followers_count": 150,
  "following_count": 89,
  "created_at": "2024-01-15T08:00:00.000Z",
  "stats": {
    "total_habits": 5,
    "max_streak": 45,
    "total_completions": 230,
    "member_since_days": 120,
    "league": 3,
    "league_position": 5
  }
}
```

#### Response 200 - Perfil Privado

Cuando el perfil es privado, `stats` es `null`:

```json
{
  "id": "a9cbf304-6542-4824-8c7b-fdc48646bdf2",
  "username": "privatejoe",
  "is_profile_public": false,
  "is_following": false,
  "follows_you": true,
  "followers_count": 50,
  "following_count": 30,
  "created_at": "2024-03-10T12:00:00.000Z",
  "stats": null
}
```

#### Campos de Stats

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `total_habits` | number | Cantidad de hábitos activos |
| `max_streak` | number | Racha más larga alcanzada |
| `total_completions` | number | Total de días con hábitos completados |
| `member_since_days` | number | Días desde que se registró |
| `league` | number | Liga actual (1=Bronze, 2=Silver, 3=Gold, 4=Diamond, 5=Master) |
| `league_position` | number \| null | Posición en su grupo de liga actual |

#### Errores

| Status | Mensaje | Causa |
|--------|---------|-------|
| 404 | "User not found" | El userId no existe |
| 401 | "Not authenticated" | Token inválido/ausente |

---

## Flujos de UI Sugeridos

### Pantalla de Búsqueda

```
1. Usuario escribe en input de búsqueda
2. Debounce de 300ms
3. Si query.length >= 2, llamar GET /social/search?q=...
4. Mostrar lista con:
   - Avatar placeholder (o iniciales del username)
   - Username
   - Followers count
   - Botón Follow/Following según is_following
5. Al tocar usuario → navegar a perfil
6. Al tocar botón Follow → POST /social/follow/:id
7. Al tocar botón Following → DELETE /social/follow/:id
```

### Pantalla de Perfil

```
1. Llamar GET /social/profile/:userId
2. Mostrar header con:
   - Username
   - Followers / Following counts (tappables)
   - Botón Follow/Following/Edit (si es propio)
   - Badge "Follows you" si follows_you === true
3. Si stats !== null, mostrar tarjetas:
   - "🔥 Max Streak: 45 days"
   - "✅ Total Completions: 230"
   - "📅 Member for 120 days"
   - "🏆 League: Gold (#5)"
4. Si stats === null, mostrar:
   - "This profile is private"
```

### Lista de Seguidores/Seguidos

```
1. Llamar GET /social/followers/:userId o /following/:userId
2. Implementar infinite scroll con page++
3. Cada item muestra:
   - Username
   - Followers count
   - Botón Follow/Following
4. Al tocar → navegar a perfil del usuario
```

---

## Consideraciones Importantes

### Optimistic Updates

Para mejor UX, actualizar el estado localmente antes de esperar la respuesta:

```typescript
// Ejemplo React
const handleFollow = async (userId: string) => {
  // Optimistic update
  setIsFollowing(true);
  setFollowersCount(prev => prev + 1);

  try {
    await api.post(`/social/follow/${userId}`);
  } catch (error) {
    // Rollback on error
    setIsFollowing(false);
    setFollowersCount(prev => prev - 1);
    showError(error.message);
  }
};
```

### Cache

- Los contadores de followers/following se cachean en el servidor
- Se actualizan automáticamente al follow/unfollow
- No es necesario refrescar manualmente

### Privacidad

- Un perfil privado oculta las estadísticas pero NO oculta:
  - Username
  - Followers/Following counts
  - Si el usuario actual lo sigue o es seguido por él
- Esto permite que el usuario decida si seguir basándose en la popularidad

### Ligas

| league | Nombre |
|--------|--------|
| 1 | Bronze |
| 2 | Silver |
| 3 | Gold |
| 4 | Diamond |
| 5 | Master |

`league_position` puede ser `null` si:
- No hay semana de liga activa
- El usuario no está participando en la liga actual

---

## Ejemplos de Código

### React Query / TanStack Query

```typescript
// hooks/useSocialApi.ts

export const useSearchUsers = (query: string, page = 1) => {
  return useQuery({
    queryKey: ['users', 'search', query, page],
    queryFn: () => api.get(`/social/search?q=${query}&page=${page}`),
    enabled: query.length >= 2,
  });
};

export const useUserProfile = (userId: string) => {
  return useQuery({
    queryKey: ['users', 'profile', userId],
    queryFn: () => api.get(`/social/profile/${userId}`),
  });
};

export const useFollowUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.post(`/social/follow/${userId}`),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries(['users', 'profile', userId]);
      queryClient.invalidateQueries(['users', 'search']);
    },
  });
};

export const useUnfollowUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.delete(`/social/follow/${userId}`),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries(['users', 'profile', userId]);
      queryClient.invalidateQueries(['users', 'search']);
    },
  });
};
```

### Flutter / Dart

```dart
// services/social_service.dart

class SocialService {
  final ApiClient _api;

  Future<SearchResult> searchUsers(String query, {int page = 1}) async {
    final response = await _api.get('/social/search', queryParams: {
      'q': query,
      'page': page.toString(),
    });
    return SearchResult.fromJson(response.data);
  }

  Future<PublicProfile> getProfile(String userId) async {
    final response = await _api.get('/social/profile/$userId');
    return PublicProfile.fromJson(response.data);
  }

  Future<void> followUser(String userId) async {
    await _api.post('/social/follow/$userId');
  }

  Future<void> unfollowUser(String userId) async {
    await _api.delete('/social/follow/$userId');
  }

  Future<FollowListResult> getFollowers(String userId, {int page = 1}) async {
    final response = await _api.get('/social/followers/$userId', queryParams: {
      'page': page.toString(),
    });
    return FollowListResult.fromJson(response.data);
  }

  Future<FollowListResult> getFollowing(String userId, {int page = 1}) async {
    final response = await _api.get('/social/following/$userId', queryParams: {
      'page': page.toString(),
    });
    return FollowListResult.fromJson(response.data);
  }
}
```

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2025-01-05 | Módulo social implementado con todas las fases |
