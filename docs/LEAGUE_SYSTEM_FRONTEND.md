# League System - Frontend Implementation Guide

**Last Updated:** October 19, 2025
**Status:** Stable
**Complexity:** Medium

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [API Reference](#api-reference)
4. [Data Models](#data-models)
5. [League Flow](#league-flow)
6. [Implementation Examples](#implementation-examples)
7. [UI/UX Recommendations](#uiux-recommendations)
8. [Error Handling](#error-handling)
9. [Testing Checklist](#testing-checklist)
10. [FAQ](#faq)

---

## 🎯 Overview

El sistema de ligas es un mecanismo de **gamificación competitiva** que divide a los usuarios en grupos de 20 competidores (usuarios reales + bots) organizados por niveles. Los usuarios compiten semanalmente acumulando XP, y al final de cada semana se promocionan, relegan o mantienen según su posición.

### Características Principales

- **5 Niveles de Ligas**: Bronze → Silver → Gold → Diamond → Master
- **Competencia Semanal**: Ciclos de 7 días que reinician automáticamente
- **20 Competidores por Liga**: Mix de usuarios reales y bots
- **Sistema de Promoción/Relegación**: Top 5 suben, Bottom 5 bajan
- **Historial Completo**: Registro de todas las semanas jugadas

### Propósito del Sistema

1. **Motivación**: Competencia amigable para mantener a usuarios activos
2. **Progresión**: Sensación de avance a través de las ligas
3. **Engagement**: Revisión diaria del ranking para ver progreso
4. **Social**: Competir con otros usuarios (aunque sea asíncrono)

---

## 🏗️ System Architecture

### Componentes del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                      LEAGUE SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LEAGUES (5)                 LEAGUE_WEEKS                   │
│  ┌──────────────┐           ┌──────────────┐              │
│  │ 1: Bronze    │           │ Week 1       │              │
│  │ 2: Silver    │           │ Week 2       │              │
│  │ 3: Gold      │           │ Week 3       │              │
│  │ 4: Diamond   │           │ ...          │              │
│  │ 5: Master    │           └──────────────┘              │
│  └──────────────┘                                          │
│         │                          │                        │
│         └──────────┬───────────────┘                        │
│                    ▼                                        │
│         LEAGUE_COMPETITORS (20 per league/week)            │
│         ┌────────────────────────────────┐                 │
│         │ Position 1: User A (1500 XP)  │                 │
│         │ Position 2: Bot X (1450 XP)   │                 │
│         │ Position 3: User B (1400 XP)  │                 │
│         │ ...                            │                 │
│         │ Position 20: User C (200 XP)  │                 │
│         └────────────────────────────────┘                 │
│                    │                                        │
│                    ▼                                        │
│         USER_LEAGUE_HISTORY                                │
│         ┌────────────────────────────────┐                 │
│         │ Week 1: Bronze, Pos 3, +500 XP│                 │
│         │ Week 2: Silver, Pos 15, +300  │                 │
│         │ Week 3: Bronze, Pos 8, +450   │                 │
│         └────────────────────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Relación entre Tablas

1. **LEAGUES**: Define las 5 ligas disponibles (estáticas)
2. **LEAGUE_WEEKS**: Cada semana de competencia (se crea automáticamente)
3. **LEAGUE_COMPETITORS**: Snapshot de competidores por semana/liga
4. **USER_LEAGUE_HISTORY**: Historial individual de cada usuario

---

## 📡 API Reference

### 1. GET `/leagues/current`

**Descripción**: Obtiene la liga actual del usuario autenticado y el ranking completo de competidores.

**Autenticación**: Requerida (Bearer Token)

**Request**: No requiere body ni query params

**Response exitoso (200)**:

```json
{
  "league": {
    "id": 2,
    "name": "Silver",
    "colorHex": "#C0C0C0"
  },
  "competitors": [
    {
      "name": "Alice Johnson",
      "weeklyXp": 1850,
      "position": 1,
      "isReal": true,
      "userId": "550e8400-e29b-41d4-a716-446655440001"
    },
    {
      "name": "Phoenix_Warrior",
      "weeklyXp": 1720,
      "position": 2,
      "isReal": false,
      "userId": null
    },
    {
      "name": "Bob Smith",
      "weeklyXp": 1650,
      "position": 3,
      "isReal": true,
      "userId": "550e8400-e29b-41d4-a716-446655440002"
    },
    // ... 17 more competitors
    {
      "name": "Charlie Brown",
      "weeklyXp": 320,
      "position": 20,
      "isReal": true,
      "userId": "550e8400-e29b-41d4-a716-446655440020"
    }
  ]
}
```

**Response sin liga (200)**:

```json
{
  "message": "User not found in any league for the current week.",
  "competitors": []
}
```

**Error Responses**:

```json
// 404 - No hay semana activa
{
  "message": "No active league week found."
}

// 404 - Liga no encontrada
{
  "message": "League not found."
}

// 401 - No autenticado
{
  "message": "No token provided" // o "Invalid token"
}

// 500 - Error del servidor
{
  "message": "Error fetching current league information."
}
```

**Campos importantes**:

- `isReal`: `true` = usuario real, `false` = bot generado
- `userId`: `null` para bots, UUID para usuarios reales
- `position`: 1-20, ordenado por `weeklyXp` descendente
- `colorHex`: Color para UI (usar para badges, fondos, etc.)

**Cuándo usar**:

- Al cargar la pantalla principal de ligas
- Después de completar un hábito (para ver XP actualizado)
- Al hacer pull-to-refresh
- Cada vez que el usuario vuelve a la app (si han pasado > 5 minutos)

---

### 2. GET `/users/me/league-history`

**Descripción**: Obtiene el historial completo de participación en ligas del usuario autenticado.

**Autenticación**: Requerida (Bearer Token)

**Request**: No requiere body ni query params

**Response exitoso (200)**:

```json
[
  {
    "weeklyXp": 1850,
    "position": 3,
    "changeType": "promoted",
    "leagueName": "Silver",
    "leagueColor": "#C0C0C0",
    "weekStart": "2025-10-14"
  },
  {
    "weeklyXp": 1520,
    "position": 5,
    "changeType": "promoted",
    "leagueName": "Bronze",
    "leagueColor": "#CD7F32",
    "weekStart": "2025-10-07"
  },
  {
    "weeklyXp": 1200,
    "position": 12,
    "changeType": "stayed",
    "leagueName": "Bronze",
    "leagueColor": "#CD7F32",
    "weekStart": "2025-09-30"
  },
  {
    "weeklyXp": 890,
    "position": 18,
    "changeType": "relegated",
    "leagueName": "Silver",
    "leagueColor": "#C0C0C0",
    "weekStart": "2025-09-23"
  }
]
```

**Response vacío (200)**:

```json
[]
```

**Error Responses**:

```json
// 401 - No autenticado
{
  "message": "No token provided"
}

// 500 - Error del servidor
{
  "message": "Error fetching league history."
}
```

**Campos importantes**:

- `changeType`:
  - `"promoted"`: Subió de liga
  - `"relegated"`: Bajó de liga
  - `"stayed"`: Se mantuvo en la misma liga
- `weekStart`: Fecha de inicio de esa semana (formato ISO 8601)
- Ordenado por `weekStart` descendente (más reciente primero)

**Cuándo usar**:

- En la pantalla de historial/perfil de ligas
- Para mostrar estadísticas del usuario
- Para mostrar gráficos de progreso

---

## 📊 Data Models

### League

Representa una liga específica del sistema.

```typescript
interface League {
  id: number;           // 1-5
  name: string;         // "Bronze", "Silver", "Gold", "Diamond", "Master"
  colorHex: string;     // "#CD7F32", "#C0C0C0", "#FFD700", "#B9F2FF", "#E5E4E2"
  level: number;        // 1-5 (dificultad/prestigio)
}
```

**Ligas disponibles** (fijas):

| ID | Name    | Color Hex | Level | Descripción                |
|----|---------|-----------|-------|----------------------------|
| 1  | Bronze  | #CD7F32   | 1     | Liga inicial               |
| 2  | Silver  | #C0C0C0   | 2     | Liga intermedia baja       |
| 3  | Gold    | #FFD700   | 3     | Liga intermedia alta       |
| 4  | Diamond | #B9F2FF   | 4     | Liga avanzada              |
| 5  | Master  | #E5E4E2   | 5     | Liga máxima (élite)        |

---

### LeagueCompetitor

Representa un competidor (usuario real o bot) en una liga específica durante una semana.

```typescript
interface LeagueCompetitor {
  id: string;              // UUID
  league_week_id: number;  // ID de la semana
  league_id: number;       // 1-5 (liga)
  user_id: string | null;  // UUID del usuario (null si es bot)
  name: string;            // Nombre a mostrar
  weekly_xp: number;       // XP acumulado esta semana (0-∞)
  position: number;        // Posición en ranking (1-20)
  is_real: boolean;        // true = usuario real, false = bot
  created_at: string;      // ISO 8601 timestamp
}
```

**Restricciones**:

- Máximo 20 competidores por `league_id` + `league_week_id`
- `position` es único dentro de una liga/semana (1-20)
- Un `user_id` solo puede estar en una liga por semana
- `weekly_xp` siempre >= 0

---

### UserLeagueHistory

Representa la participación histórica de un usuario en las ligas.

```typescript
interface UserLeagueHistory {
  id: string;                                    // UUID
  user_id: string;                               // UUID del usuario
  league_id: number;                             // Liga donde participó (1-5)
  league_week_id: number;                        // ID de la semana
  weekly_xp: number;                             // XP final de esa semana
  position: number | null;                       // Posición final (1-20)
  change_type: 'promoted' | 'relegated' | 'stayed';  // Resultado
  created_at: string;                            // ISO 8601 timestamp
}
```

**Change Type explicado**:

- `"promoted"`: Usuario terminó en top 5 y subió a la liga superior
- `"relegated"`: Usuario terminó en bottom 5 y bajó a la liga inferior
- `"stayed"`: Usuario terminó en posiciones 6-15 y se mantuvo

**Excepciones**:

- En **Bronze** (liga 1): No se puede relegar → siempre `"stayed"` o `"promoted"`
- En **Master** (liga 5): No se puede promocionar → siempre `"stayed"` o `"relegated"`

---

### User (campos relacionados con ligas)

El modelo `User` incluye un campo relacionado con ligas:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  // ... otros campos
  league_week_start: Date;  // Fecha de inicio de la semana actual del usuario
  // ... otros campos
}
```

Este campo sincroniza al usuario con el ciclo semanal de las ligas.

---

## 🔄 League Flow

### Ciclo Completo de una Semana

```
┌─────────────────────────────────────────────────────────────┐
│                    SEMANA DE LIGA                           │
└─────────────────────────────────────────────────────────────┘

Lunes 00:00 - INICIO DE SEMANA
├─ Se crea registro en LEAGUE_WEEKS
├─ Se asignan usuarios a ligas según nivel
├─ Se generan bots hasta completar 20 por liga
└─ weekly_xp = 0 para todos

Lunes 00:01 - Domingo 23:59 - COMPETENCIA ACTIVA
├─ Usuarios completan hábitos → ganan XP
├─ weekly_xp se actualiza en tiempo real
├─ Posiciones se recalculan automáticamente
└─ Frontend consulta /leagues/current para ver ranking

Domingo 23:59:59 - FIN DE SEMANA
├─ Se finalizan posiciones
├─ Se evalúan resultados:
│  ├─ Posiciones 1-5: PROMOCIÓN (si no están en Master)
│  ├─ Posiciones 6-15: SE MANTIENEN
│  └─ Posiciones 16-20: RELEGACIÓN (si no están en Bronze)
├─ Se registra en USER_LEAGUE_HISTORY
└─ Se prepara la siguiente semana

Lunes 00:00 - NUEVA SEMANA
└─ El ciclo se reinicia con las nuevas asignaciones
```

### Estados de un Usuario en el Sistema

```
┌──────────────┐
│ Sin Liga     │ (Usuario nuevo)
└──────┬───────┘
       │ Registro
       ▼
┌──────────────┐
│ Bronze       │ (Liga inicial)
└──────┬───────┘
       │
       ├─ Top 5 → Promociona
       │         ▼
       │    ┌──────────────┐
       │    │ Silver       │
       │    └──────┬───────┘
       │           │
       │           ├─ Top 5 → Promociona
       │           │         ▼
       │           │    ┌──────────────┐
       │           │    │ Gold         │
       │           │    └──────┬───────┘
       │           │           │
       │           │           ├─ Top 5 → Promociona
       │           │           │         ▼
       │           │           │    ┌──────────────┐
       │           │           │    │ Diamond      │
       │           │           │    └──────┬───────┘
       │           │           │           │
       │           │           │           ├─ Top 5 → Promociona
       │           │           │           │         ▼
       │           │           │           │    ┌──────────────┐
       │           │           │           │    │ Master       │
       │           │           │           │    └──────┬───────┘
       │           │           │           │           │
       │           │           │           │           └─ Se mantiene
       │           │           │           │              (no hay liga superior)
       │           │           │           │
       │           │           │           └─ Bottom 5 → Relegación
       │           │           │
       │           │           └─ Bottom 5 → Relegación
       │           │
       │           └─ Bottom 5 → Relegación
       │
       └─ Bottom 5 → Se mantiene en Bronze
                     (no hay liga inferior)
```

### Cálculo de Posiciones

Las posiciones se calculan en base al `weekly_xp` acumulado:

1. **Ordenamiento**: Descendente por `weekly_xp`
2. **Empates**: Se mantiene el orden de inserción (quien llegó primero)
3. **Actualización**: Cada vez que se actualiza el XP de un competidor

**Ejemplo**:

```
User A: 1500 XP → Position 1
Bot X:  1500 XP → Position 2 (mismo XP, pero llegó después)
User B: 1450 XP → Position 3
User C: 1400 XP → Position 4
```

### Generación de XP

El XP semanal (`weekly_xp`) se obtiene de:

- ✅ Completar hábitos diarios
- ✅ Completar retos/challenges
- ✅ Mantener rachas (streaks)
- ✅ Logros especiales

**Nota para Frontend**: El backend se encarga de actualizar automáticamente el `weekly_xp` cuando el usuario completa acciones. El frontend solo necesita consultar el estado actual.

---

## 💻 Implementation Examples

### React Native / TypeScript

#### 1. Tipos TypeScript

```typescript
// types/league.types.ts

export interface League {
  id: number;
  name: string;
  colorHex: string;
}

export interface LeagueCompetitor {
  name: string;
  weeklyXp: number;
  position: number;
  isReal: boolean;
  userId: string | null;
}

export interface CurrentLeagueResponse {
  league: League;
  competitors: LeagueCompetitor[];
}

export interface LeagueHistoryEntry {
  weeklyXp: number;
  position: number;
  changeType: 'promoted' | 'relegated' | 'stayed';
  leagueName: string;
  leagueColor: string;
  weekStart: string; // ISO 8601 date string
}

export type LeagueHistoryResponse = LeagueHistoryEntry[];
```

---

#### 2. API Service

```typescript
// services/league.service.ts
import { api } from './api'; // Tu instancia de axios configurada
import {
  CurrentLeagueResponse,
  LeagueHistoryResponse
} from '../types/league.types';

export const LeagueService = {
  /**
   * Obtiene la liga actual del usuario y el ranking de competidores
   */
  async getCurrentLeague(): Promise<CurrentLeagueResponse> {
    const { data } = await api.get<CurrentLeagueResponse>('/leagues/current');
    return data;
  },

  /**
   * Obtiene el historial completo de ligas del usuario
   */
  async getLeagueHistory(): Promise<LeagueHistoryResponse> {
    const { data } = await api.get<LeagueHistoryResponse>('/users/me/league-history');
    return data;
  },
};
```

---

#### 3. React Hook Personalizado

```typescript
// hooks/useCurrentLeague.ts
import { useState, useEffect, useCallback } from 'react';
import { LeagueService } from '../services/league.service';
import { CurrentLeagueResponse } from '../types/league.types';

interface UseCurrentLeagueReturn {
  data: CurrentLeagueResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useCurrentLeague = (): UseCurrentLeagueReturn => {
  const [data, setData] = useState<CurrentLeagueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLeague = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await LeagueService.getCurrentLeague();
      setData(response);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching current league:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeague();
  }, [fetchLeague]);

  return {
    data,
    loading,
    error,
    refetch: fetchLeague,
  };
};
```

```typescript
// hooks/useLeagueHistory.ts
import { useState, useEffect, useCallback } from 'react';
import { LeagueService } from '../services/league.service';
import { LeagueHistoryResponse } from '../types/league.types';

interface UseLeagueHistoryReturn {
  data: LeagueHistoryResponse;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useLeagueHistory = (): UseLeagueHistoryReturn => {
  const [data, setData] = useState<LeagueHistoryResponse>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await LeagueService.getLeagueHistory();
      setData(response);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching league history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    data,
    loading,
    error,
    refetch: fetchHistory,
  };
};
```

---

#### 4. Pantalla de Liga Actual

```typescript
// screens/LeagueScreen.tsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { LeagueCompetitor } from '../types/league.types';

export const LeagueScreen = () => {
  const { data, loading, error, refetch } = useCurrentLeague();

  if (loading && !data) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          Error loading league: {error.message}
        </Text>
      </View>
    );
  }

  if (!data || data.competitors.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.infoText}>
          You're not in a league yet. Complete some habits to join!
        </Text>
      </View>
    );
  }

  const { league, competitors } = data;

  const renderCompetitor = ({ item }: { item: LeagueCompetitor }) => (
    <View style={styles.competitorRow}>
      <View style={styles.positionBadge}>
        <Text style={styles.positionText}>{item.position}</Text>
      </View>

      <View style={styles.competitorInfo}>
        <Text style={styles.nameText}>
          {item.name}
          {!item.isReal && ' 🤖'}
        </Text>
        <Text style={styles.xpText}>{item.weeklyXp} XP</Text>
      </View>

      {/* Indicador para zona de promoción/relegación */}
      {item.position <= 5 && (
        <View style={[styles.zoneBadge, { backgroundColor: '#4CAF50' }]}>
          <Text style={styles.zoneBadgeText}>↑</Text>
        </View>
      )}
      {item.position >= 16 && (
        <View style={[styles.zoneBadge, { backgroundColor: '#F44336' }]}>
          <Text style={styles.zoneBadgeText}>↓</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header de Liga */}
      <View
        style={[
          styles.leagueHeader,
          { backgroundColor: league.colorHex }
        ]}
      >
        <Text style={styles.leagueName}>{league.name} League</Text>
      </View>

      {/* Lista de Competidores */}
      <FlatList
        data={competitors}
        renderItem={renderCompetitor}
        keyExtractor={(item, index) => `${item.userId || 'bot'}-${index}`}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
          />
        }
        ListHeaderComponent={
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxText}>
              🏆 Top 5 promote | 🔻 Bottom 5 relegate
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  leagueHeader: {
    padding: 20,
    alignItems: 'center',
  },
  leagueName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoBox: {
    backgroundColor: '#fff3cd',
    padding: 12,
    margin: 10,
    borderRadius: 8,
  },
  infoBoxText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#856404',
  },
  competitorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  positionText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  competitorInfo: {
    flex: 1,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  xpText: {
    fontSize: 14,
    color: '#666',
  },
  zoneBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneBadgeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 16,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
  },
});
```

---

#### 5. Pantalla de Historial

```typescript
// screens/LeagueHistoryScreen.tsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLeagueHistory } from '../hooks/useLeagueHistory';
import { LeagueHistoryEntry } from '../types/league.types';

export const LeagueHistoryScreen = () => {
  const { data, loading, error } = useLeagueHistory();

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          Error loading history: {error.message}
        </Text>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.infoText}>
          No league history yet. Start competing!
        </Text>
      </View>
    );
  }

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'promoted':
        return '⬆️';
      case 'relegated':
        return '⬇️';
      case 'stayed':
        return '➡️';
      default:
        return '';
    }
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'promoted':
        return '#4CAF50';
      case 'relegated':
        return '#F44336';
      case 'stayed':
        return '#FF9800';
      default:
        return '#999';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderHistoryEntry = ({ item }: { item: LeagueHistoryEntry }) => (
    <View style={styles.historyCard}>
      <View
        style={[
          styles.leagueBadge,
          { backgroundColor: item.leagueColor }
        ]}
      >
        <Text style={styles.leagueBadgeText}>{item.leagueName}</Text>
      </View>

      <View style={styles.historyDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Week:</Text>
          <Text style={styles.detailValue}>{formatDate(item.weekStart)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Position:</Text>
          <Text style={styles.detailValue}>#{item.position}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>XP:</Text>
          <Text style={styles.detailValue}>{item.weeklyXp}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Result:</Text>
          <View
            style={[
              styles.changeTypeBadge,
              { backgroundColor: getChangeColor(item.changeType) }
            ]}
          >
            <Text style={styles.changeTypeText}>
              {getChangeIcon(item.changeType)} {item.changeType}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        renderItem={renderHistoryEntry}
        keyExtractor={(item, index) => `history-${index}`}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContent: {
    padding: 10,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  leagueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  leagueBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  historyDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  changeTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changeTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 16,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
  },
});
```

---

#### 6. Componente de Badge de Liga

```typescript
// components/LeagueBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { League } from '../types/league.types';

interface LeagueBadgeProps {
  league: League;
  size?: 'small' | 'medium' | 'large';
}

export const LeagueBadge: React.FC<LeagueBadgeProps> = ({
  league,
  size = 'medium'
}) => {
  const sizeStyles = {
    small: { width: 60, height: 60, fontSize: 12 },
    medium: { width: 80, height: 80, fontSize: 14 },
    large: { width: 120, height: 120, fontSize: 18 },
  };

  const currentSize = sizeStyles[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: league.colorHex,
          width: currentSize.width,
          height: currentSize.height,
        },
      ]}
    >
      <Text style={[styles.badgeText, { fontSize: currentSize.fontSize }]}>
        {league.name}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
```

---

## 🎨 UI/UX Recommendations

### Visual Design

#### 1. Colores de Ligas

Usa los colores exactos del backend para consistencia:

```typescript
const LEAGUE_COLORS = {
  Bronze: '#CD7F32',
  Silver: '#C0C0C0',
  Gold: '#FFD700',
  Diamond: '#B9F2FF',
  Master: '#E5E4E2',
};
```

#### 2. Indicadores Visuales

**Zonas de Promoción/Relegación**:

- Posiciones 1-5: Verde / Flecha arriba (↑)
- Posiciones 6-15: Neutro (sin indicador)
- Posiciones 16-20: Rojo / Flecha abajo (↓)

**Usuario Actual**:

- Destacar la fila del usuario con borde/sombra
- Scroll automático a su posición al cargar

**Bots**:

- Mostrar icono de robot (🤖) o badge
- Opcionalmente, opacity reducido (0.8)

#### 3. Animaciones

**Cambio de Posición**:

```typescript
// Animar cuando la posición cambia
import { Animated } from 'react-native';

const animatedValue = new Animated.Value(0);

// Al cambiar posición
Animated.sequence([
  Animated.timing(animatedValue, {
    toValue: 1,
    duration: 300,
    useNativeDriver: true,
  }),
  Animated.timing(animatedValue, {
    toValue: 0,
    duration: 300,
    useNativeDriver: true,
  }),
]).start();
```

**Pull to Refresh**:

- Siempre incluir RefreshControl
- Feedback visual claro

---

### Información Contextual

#### 1. Header de Liga

Mostrar:

- Nombre de la liga actual
- Color distintivo
- Tiempo restante en la semana (opcional)

#### 2. Tooltips / Info

Incluir explicaciones:

- "Top 5 competitors get promoted"
- "Bottom 5 competitors get relegated"
- "Earn XP by completing habits"

#### 3. Empty States

**Sin liga asignada**:

```
🏆 Join the League!

Complete habits to earn XP and
start competing with others.

[Start Competing]
```

**Historial vacío**:

```
📊 No History Yet

Your league performance will
appear here after your first week.
```

---

### Performance

#### 1. Optimizaciones

- Usar `FlatList` con `keyExtractor` único
- Implementar `shouldComponentUpdate` o `React.memo`
- Lazy load de avatares/imágenes

#### 2. Caching

```typescript
// React Query (opcional pero recomendado)
import { useQuery } from '@tanstack/react-query';

export const useCurrentLeague = () => {
  return useQuery({
    queryKey: ['league', 'current'],
    queryFn: LeagueService.getCurrentLeague,
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 10 * 60 * 1000, // 10 minutos
  });
};
```

#### 3. Actualización Inteligente

No consultar en cada render:

- Al entrar a la pantalla
- Después de completar un hábito
- Pull to refresh manual
- Cada 5 minutos (si la app está activa)

```typescript
// Ejemplo con interval
useEffect(() => {
  const interval = setInterval(() => {
    if (isScreenFocused) {
      refetch();
    }
  }, 5 * 60 * 1000); // 5 minutos

  return () => clearInterval(interval);
}, [isScreenFocused, refetch]);
```

---

### Accesibilidad

```typescript
// Añadir accessibilityLabel
<View accessibilityLabel={`Position ${item.position}, ${item.name}, ${item.weeklyXp} XP`}>
  {/* contenido */}
</View>

// Usar accessibilityRole
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Refresh league standings"
>
  {/* botón */}
</TouchableOpacity>
```

---

## ⚠️ Error Handling

### Escenarios Comunes

#### 1. Usuario sin Liga

```typescript
if (!data || data.competitors.length === 0) {
  return (
    <EmptyLeagueState
      title="You're not in a league yet"
      message="Complete habits to earn XP and join the competition!"
      actionText="Start Competing"
      onAction={() => navigation.navigate('Habits')}
    />
  );
}
```

#### 2. Semana no Iniciada

```json
{
  "message": "No active league week found."
}
```

**Manejo**:

```typescript
if (error.response?.status === 404) {
  return (
    <InfoScreen
      icon="⏳"
      title="League Starting Soon"
      message="The new league week will begin shortly. Check back later!"
    />
  );
}
```

#### 3. Error de Red

```typescript
if (!navigator.onLine) {
  return (
    <ErrorScreen
      icon="📡"
      title="No Connection"
      message="Check your internet connection and try again."
      actionText="Retry"
      onAction={refetch}
    />
  );
}
```

#### 4. Timeout del Servidor

```typescript
try {
  const response = await LeagueService.getCurrentLeague();
} catch (error) {
  if (error.code === 'ECONNABORTED') {
    Alert.alert(
      'Request Timeout',
      'The server is taking too long to respond. Please try again.'
    );
  }
}
```

#### 5. Token Expirado

El sistema de autenticación manejará esto automáticamente (ver `AUTHENTICATION_UPDATE_FRONTEND.md`), pero puedes añadir feedback:

```typescript
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Token refresh automático...

      // Mostrar toast opcional
      Toast.show({
        type: 'info',
        text1: 'Session refreshed',
        position: 'bottom',
      });
    }
    return Promise.reject(error);
  }
);
```

---

### Retry Logic

```typescript
const fetchWithRetry = async (
  fn: () => Promise<any>,
  retries = 3,
  delay = 1000
): Promise<any> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;

    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2); // Exponential backoff
  }
};

// Uso
const data = await fetchWithRetry(() => LeagueService.getCurrentLeague());
```

---

### Logging

```typescript
// services/logger.ts
export const logLeagueError = (error: any, context: string) => {
  console.error(`[League Error - ${context}]`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    timestamp: new Date().toISOString(),
  });

  // Opcional: enviar a servicio de monitoreo (Sentry, etc.)
  // Sentry.captureException(error, { tags: { context } });
};

// Uso
try {
  await LeagueService.getCurrentLeague();
} catch (error) {
  logLeagueError(error, 'LeagueScreen.fetchCurrentLeague');
}
```

---

## ✅ Testing Checklist

### Funcionalidad Básica

- [ ] **Carga de liga actual**: Datos correctos mostrados
- [ ] **Orden de competidores**: Ordenados por XP descendente
- [ ] **Posición del usuario**: Destacado visualmente
- [ ] **Identificación de bots**: Marcados claramente
- [ ] **Colores de liga**: Coinciden con el backend
- [ ] **Pull to refresh**: Actualiza datos correctamente
- [ ] **Historial**: Muestra entradas ordenadas por fecha

### Edge Cases

- [ ] **Usuario sin liga**: Empty state apropiado
- [ ] **Historial vacío**: Empty state apropiado
- [ ] **Empate en XP**: Posiciones consistentes
- [ ] **Usuario en posición 1**: Sin errores visuales
- [ ] **Usuario en posición 20**: Sin errores visuales
- [ ] **Liga Bronze**: No muestra "relegated" en historial
- [ ] **Liga Master**: No muestra "promoted" en historial

### Performance

- [ ] **Lista de 20 items**: Scroll suave
- [ ] **Múltiples refetch**: No memory leaks
- [ ] **Cambio rápido de screens**: Sin crashes
- [ ] **Actualización frecuente**: No bloquea UI

### Error Handling

- [ ] **Error 401**: Redirige a login
- [ ] **Error 404**: Mensaje apropiado
- [ ] **Error 500**: Mensaje genérico de error
- [ ] **Sin conexión**: Detectado y manejado
- [ ] **Timeout**: Retry disponible

### Accesibilidad

- [ ] **Screen readers**: Anuncios correctos
- [ ] **Contraste de colores**: WCAG AA cumplido
- [ ] **Tamaño de texto**: Escalable
- [ ] **Touch targets**: ≥ 44x44 pts

### UI/UX

- [ ] **Loading states**: Indicadores claros
- [ ] **Animaciones**: Suaves y apropiadas
- [ ] **Feedback visual**: Acciones confirmadas
- [ ] **Consistencia**: Matches resto de la app

---

## ❓ FAQ

### Preguntas Frecuentes

#### 1. ¿Cuándo se actualiza el ranking?

**R:** El `weekly_xp` se actualiza en tiempo real cada vez que el usuario completa una acción que otorga XP (hábitos, retos, etc.). El frontend debe consultar `/leagues/current` para ver los cambios.

**Recomendación**: Actualizar después de completar hábitos o cada 5 minutos si la pantalla está visible.

---

#### 2. ¿Cómo sé si el usuario subió/bajó de liga?

**R:** La API `/users/me/league-history` incluye el campo `changeType` que indica el resultado de cada semana anterior:

- `"promoted"`: Subió de liga
- `"relegated"`: Bajó de liga
- `"stayed"`: Se mantuvo

**Tip**: Compara la liga de la semana actual (entry 0) con la anterior (entry 1) para mostrar un mensaje celebratorio o motivacional.

---

#### 3. ¿Qué pasa si el usuario no tiene liga?

**R:** Los usuarios nuevos o inactivos pueden no estar asignados a ninguna liga. La API responde con:

```json
{
  "message": "User not found in any league for the current week.",
  "competitors": []
}
```

**Manejo**: Mostrar un empty state invitando a completar hábitos.

---

#### 4. ¿Los bots son persistentes?

**R:** Los bots se generan para cada semana de liga. Pueden tener nombres diferentes entre semanas. No son "usuarios" reales en el sistema.

**Identificación**: `isReal: false` y `userId: null`

---

#### 5. ¿Puedo saber la posición del usuario actual sin recorrer el array?

**R:** Sí, simplemente encuentra el competidor que coincida con tu `userId`:

```typescript
const currentUser = await AuthService.getCurrentUser();
const myPosition = competitors.find(
  c => c.userId === currentUser.id
);

console.log(`My position: ${myPosition?.position}`);
```

---

#### 6. ¿Cuándo empieza y termina una semana?

**R:** Las semanas comienzan los **Lunes a las 00:00** y terminan los **Domingos a las 23:59:59** (según la zona horaria del servidor).

**Nota**: El frontend no necesita manejar esto; el backend se encarga de todo.

---

#### 7. ¿Se puede ver la liga de otros usuarios?

**R:** No. La API actual solo permite ver:

- Tu propia liga actual
- Tu propio historial

Para ver competidores, usa `/leagues/current`, que muestra todos los competidores de tu liga.

---

#### 8. ¿Qué pasa si dos usuarios tienen exactamente el mismo XP?

**R:** El backend mantiene un orden consistente basado en el orden de inserción. El primero en llegar a ese XP tendrá la posición superior.

---

#### 9. ¿Hay límite de solicitudes a estas APIs?

**R:** Las APIs de ligas no tienen rate limiting específico (a diferencia de las de autenticación). Sin embargo, evita hacer polling agresivo.

**Recomendación**: No más de 1 request cada 30 segundos en foreground.

---

#### 10. ¿Puedo cachear los datos de liga?

**R:** Sí, pero con precaución:

- ✅ **Cache de corto plazo** (5 minutos): Bueno para UX
- ❌ **Cache persistente**: No recomendado, los datos cambian frecuentemente

**Mejor práctica**: Usa React Query o SWR con `staleTime` de 5 minutos.

---

## 📚 Additional Resources

### Backend Documentation

- [API Testing Examples](./API_TESTING_EXAMPLES.md) - Ejemplos de requests/responses
- [Authentication Guide](./AUTHENTICATION_UPDATE_FRONTEND.md) - Sistema de auth
- [Quick Start Frontend](./QUICK_START_FRONTEND.md) - Configuración inicial

### External Libraries (Recomendadas)

- [@tanstack/react-query](https://tanstack.com/query/latest) - Data fetching y cache
- [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) - Animaciones performantes
- [axios](https://axios-http.com/) - Cliente HTTP

---

## 🆘 Support

### Troubleshooting

**Problema**: "Competitors array vacío pero debería tener datos"

**Solución**:
1. Verificar que el usuario está autenticado
2. Verificar que hay una semana activa (`LEAGUE_WEEKS`)
3. Verificar que el usuario está asignado (`LEAGUE_COMPETITORS`)

---

**Problema**: "Los colores de liga no se muestran"

**Solución**:
1. Usar `colorHex` (camelCase), no `color_hex`
2. Verificar que el valor no está undefined
3. Usar fallback: `backgroundColor: league?.colorHex || '#999'`

---

**Problema**: "El historial no se ordena correctamente"

**Solución**: El backend ya ordena por `weekStart DESC`. Si necesitas orden diferente:

```typescript
const sortedHistory = [...data].sort((a, b) =>
  new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
);
```

---

### Contact

**Backend Team**: [Your contact here]
**Issues**: Create ticket in your issue tracker
**Questions**: Check this doc first, then ask in #backend channel

---

## 📝 Changelog

### v1.0.0 - October 19, 2025

**Initial Release**:

- ✅ GET `/leagues/current` - Liga actual y ranking
- ✅ GET `/users/me/league-history` - Historial completo
- ✅ 5 niveles de ligas (Bronze → Master)
- ✅ Sistema de promoción/relegación
- ✅ Competidores reales + bots

**Database Schema**:

- ✅ LEAGUES (5 ligas fijas)
- ✅ LEAGUE_WEEKS (semanas auto-creadas)
- ✅ LEAGUE_COMPETITORS (20 por liga/semana)
- ✅ USER_LEAGUE_HISTORY (registro histórico)

---

## 🎉 Summary

**Lo que el frontend necesita hacer:**

1. ✅ Llamar a `/leagues/current` para mostrar ranking actual
2. ✅ Llamar a `/users/me/league-history` para mostrar historial
3. ✅ Usar `colorHex` para estilizar cada liga
4. ✅ Diferenciar usuarios reales (`isReal: true`) de bots
5. ✅ Manejar empty states (sin liga, sin historial)
6. ✅ Implementar pull-to-refresh
7. ✅ Destacar al usuario actual en el ranking
8. ✅ Mostrar indicadores de zonas de promoción/relegación

**Beneficios para los usuarios:**

- 🏆 Competencia motivadora
- 📈 Progresión clara a través de ligas
- 🎯 Objetivos semanales concretos
- 👥 Sensación de comunidad (aunque sea asíncrona)

**Preguntas?** Consulta este documento o contacta al equipo backend!

---

**Happy Coding!** 🚀
