# League System - Testing Documentation

**Last Updated:** October 19, 2025
**Test Framework:** Jest + TypeScript
**Coverage:** 100% for league controllers

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Test Files](#test-files)
3. [Running Tests](#running-tests)
4. [Test Coverage](#test-coverage)
5. [Test Cases](#test-cases)
6. [Helper Functions](#helper-functions)
7. [Mocking Strategy](#mocking-strategy)
8. [Adding New Tests](#adding-new-tests)

---

## 🎯 Overview

El sistema de ligas cuenta con **18 pruebas unitarias** que cubren todos los casos de uso, edge cases y escenarios de error. Las pruebas garantizan que:

- ✅ Las APIs devuelven los datos correctos
- ✅ Los errores se manejan apropiadamente
- ✅ Las validaciones funcionan correctamente
- ✅ Los casos límite están cubiertos
- ✅ El código es robusto y mantenible

---

## 📁 Test Files

### 1. `src/__tests__/controllers/league.controller.test.ts`

Archivo principal de pruebas para el controlador de ligas.

**Ubicación**: `src/__tests__/controllers/league.controller.test.ts`

**Líneas de código**: 726 líneas

**Funciones probadas**:
- `getCurrentLeague`
- `getLeagueHistory`

---

### 2. `src/__tests__/helpers/test-helpers.ts`

Funciones auxiliares para crear datos de prueba.

**Funciones agregadas para ligas**:
- `createTestCompetitor()` - Genera un competidor de prueba
- `createTestBot()` - Genera un bot de prueba
- `createTestLeague()` - Genera datos de una liga
- `createTestLeagueHistory()` - Genera entrada de historial
- `createTestLeagueRanking()` - Genera ranking completo (20 competidores)

---

## 🚀 Running Tests

### Ejecutar todas las pruebas

```bash
npm test
```

### Ejecutar solo pruebas de ligas

```bash
npm test -- src/__tests__/controllers/league.controller.test.ts
```

### Ejecutar con coverage

```bash
npm test -- --coverage src/__tests__/controllers/league.controller.test.ts
```

### Ejecutar en modo watch

```bash
npm test -- --watch src/__tests__/controllers/league.controller.test.ts
```

### Ejecutar un test específico

```bash
npm test -- -t "should return current league and competitors successfully"
```

---

## 📊 Test Coverage

### Resultados de Coverage

```
File                    | % Stmts | % Branch | % Funcs | % Lines
------------------------|---------|----------|---------|--------
league.controller.ts    |     100 |      100 |     100 |     100
```

**¡100% de cobertura en todas las métricas!**

- **Statements**: 100% - Todas las líneas ejecutables están cubiertas
- **Branches**: 100% - Todas las ramas condicionales están cubiertas
- **Functions**: 100% - Todas las funciones están probadas
- **Lines**: 100% - Todas las líneas de código están probadas

---

## ✅ Test Cases

### getCurrentLeague (9 tests)

#### ✅ Casos exitosos

1. **should return current league and competitors successfully**
   - Verifica que se devuelva la liga actual con todos los competidores
   - Valida estructura de respuesta correcta
   - Confirma que se hacen 4 queries a la DB

2. **should handle user in Bronze league (league_id = 1)**
   - Prueba liga inicial (Bronze)
   - Verifica color y nombre correctos

3. **should handle user in Master league (league_id = 5)**
   - Prueba liga máxima (Master)
   - Verifica que funciona para liga de élite

4. **should return competitors ordered by position ASC**
   - Confirma ordenamiento correcto (1-20)
   - Valida que posiciones están en orden ascendente

5. **should handle mixture of real users and bots**
   - Verifica que se manejan usuarios reales y bots
   - Confirma identificación correcta (isReal, userId)

#### ⚠️ Casos especiales

6. **should return 200 with empty competitors if user not in any league**
   - Usuario nuevo sin liga asignada
   - Response: `{ message: "...", competitors: [] }`

#### ❌ Casos de error

7. **should return 404 if no active league week found**
   - No hay semana activa en LEAGUE_WEEKS
   - Response: `{ message: "No active league week found." }`

8. **should return 404 if league not found in database**
   - Liga no existe (ID inválido)
   - Response: `{ message: "League not found." }`

9. **should return 500 if database error occurs**
   - Error de conexión a BD
   - Response: `{ message: "Error fetching current league information." }`

---

### getLeagueHistory (9 tests)

#### ✅ Casos exitosos

1. **should return league history successfully**
   - Devuelve historial completo del usuario
   - Verifica todos los campos presentes
   - Confirma query con JOIN correcto

2. **should return history with promoted status**
   - Valida changeType: "promoted"
   - Confirma posiciones top 5

3. **should return history with relegated status**
   - Valida changeType: "relegated"
   - Confirma posiciones bottom 5

4. **should return history with stayed status**
   - Valida changeType: "stayed"
   - Confirma posiciones 6-15

5. **should return history ordered by week_start DESC (most recent first)**
   - Verifica ordenamiento correcto
   - Semana más reciente primero

6. **should return history with multiple leagues progression**
   - Progresión a través de múltiples ligas
   - Bronze → Silver → Gold → Diamond

7. **should include all league information in response**
   - Verifica todos los campos:
     - weeklyXp, position, changeType
     - leagueName, leagueColor, weekStart

#### ⚠️ Casos especiales

8. **should return empty array if user has no league history**
   - Usuario nuevo sin historial
   - Response: `[]`

#### ❌ Casos de error

9. **should return 500 if database error occurs**
   - Error de conexión a BD
   - Response: `{ message: "Error fetching league history." }`

---

## 🛠️ Helper Functions

### Funciones de Test Helpers

#### `createTestCompetitor(overrides?)`

Genera un competidor de prueba con datos por defecto.

```typescript
const competitor = createTestCompetitor({
  position: 1,
  weeklyXp: 2000,
  name: 'Alice Johnson'
});
```

**Campos por defecto**:
```typescript
{
  id: 'competitor-uuid-xxx',
  league_week_id: 1,
  league_id: 1,
  user_id: 'user-xxx',
  name: 'Test Competitor',
  weekly_xp: 1000,
  position: 10,
  is_real: true,
  created_at: '2025-10-19T...'
}
```

---

#### `createTestBot(overrides?)`

Genera un bot (competidor simulado).

```typescript
const bot = createTestBot({
  position: 5,
  weeklyXp: 1500
});
```

**Características**:
- `user_id: null`
- `is_real: false`
- `name: 'Bot_XXX'` (aleatorio)

---

#### `createTestLeague(leagueId)`

Devuelve datos de una liga específica.

```typescript
const silverLeague = createTestLeague(2);
// { id: 2, name: 'Silver', colorHex: '#C0C0C0', level: 2 }
```

**Ligas disponibles**:
- `1`: Bronze (#CD7F32)
- `2`: Silver (#C0C0C0)
- `3`: Gold (#FFD700)
- `4`: Diamond (#B9F2FF)
- `5`: Master (#E5E4E2)

---

#### `createTestLeagueHistory(overrides?)`

Genera una entrada de historial de liga.

```typescript
const history = createTestLeagueHistory({
  position: 3,
  changeType: 'promoted',
  weekly_xp: 1850
});
```

---

#### `createTestLeagueRanking(userPosition, userId)`

Genera un ranking completo de 20 competidores.

```typescript
const ranking = createTestLeagueRanking(10, 'user-123');
// Devuelve array de 20 competidores con el usuario en posición 10
```

**Características**:
- 20 competidores en total
- Usuario en la posición especificada
- Mix aleatorio de bots y usuarios reales
- XP decreciente (2000, 1900, 1800, ...)

---

## 🎭 Mocking Strategy

### Database Mocking

El archivo de pruebas mockea el módulo de base de datos:

```typescript
jest.mock('../../db');
```

### Patrón de Mock para Queries

```typescript
// Mock query response
const weekRows: RowDataPacket[] = [{ id: 1 }] as RowDataPacket[];
const competitorRows: RowDataPacket[] = [
  { league_id: 2 }
] as RowDataPacket[];

// Configure mock
(db.query as jest.Mock)
  .mockResolvedValueOnce([weekRows])      // Primera llamada
  .mockResolvedValueOnce([competitorRows]); // Segunda llamada

// Execute controller
await leagueController.getCurrentLeague(req, res);

// Verify calls
expect(db.query).toHaveBeenCalledTimes(2);
expect(db.query).toHaveBeenNthCalledWith(
  1,
  'SELECT id FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT 1'
);
```

### Request/Response Mocking

```typescript
const req = mockRequest({
  user: { id: 'user-123' },
}) as any;

const res = mockResponse() as unknown as Response;

// After controller execution
expect(res.status).toHaveBeenCalledWith(200);
expect(res.json).toHaveBeenCalledWith(expectedData);
```

---

## ➕ Adding New Tests

### Plantilla para nuevo test

```typescript
it('should [description of behavior]', async () => {
  // 1. Setup
  const userId = 'user-123';
  const req = mockRequest({
    user: { id: userId },
  }) as any;
  const res = mockResponse() as unknown as Response;

  // 2. Mock database responses
  const mockData: RowDataPacket[] = [
    { /* your data */ }
  ] as RowDataPacket[];

  (db.query as jest.Mock).mockResolvedValueOnce([mockData]);

  // 3. Execute
  await leagueController.getCurrentLeague(req, res);

  // 4. Assert
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      // expected fields
    })
  );
});
```

---

### Ejemplo: Test para nuevo endpoint

Si agregas un nuevo endpoint como `getLeagueTop10()`:

```typescript
describe('getLeagueTop10', () => {
  it('should return top 10 competitors from all leagues', async () => {
    const req = mockRequest() as any;
    const res = mockResponse() as unknown as Response;

    const top10: RowDataPacket[] = [
      { name: 'Player 1', weeklyXp: 5000, leagueName: 'Master' },
      { name: 'Player 2', weeklyXp: 4900, leagueName: 'Master' },
      // ... 8 more
    ] as RowDataPacket[];

    (db.query as jest.Mock).mockResolvedValueOnce([top10]);

    await leagueController.getLeagueTop10(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          weeklyXp: expect.any(Number),
        }),
      ])
    );
    expect((res.json as jest.Mock).mock.calls[0][0]).toHaveLength(10);
  });
});
```

---

## 🧪 Best Practices

### 1. Organización de Tests

- **Usar `describe`** para agrupar tests relacionados
- **Nombres descriptivos** que expliquen el comportamiento
- **Formato**: "should [expected behavior] when [condition]"

```typescript
describe('getCurrentLeague', () => {
  describe('success cases', () => {
    it('should return league when user is assigned', async () => {
      // ...
    });
  });

  describe('error cases', () => {
    it('should return 404 when no league week exists', async () => {
      // ...
    });
  });
});
```

---

### 2. Arrange-Act-Assert Pattern

```typescript
it('should do something', async () => {
  // Arrange - Setup test data and mocks
  const userId = 'user-123';
  const mockData = [{ id: 1 }];
  (db.query as jest.Mock).mockResolvedValueOnce([mockData]);

  // Act - Execute the function
  await leagueController.getCurrentLeague(req, res);

  // Assert - Verify results
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalled();
});
```

---

### 3. Test Isolation

```typescript
beforeEach(() => {
  jest.clearAllMocks(); // Limpia mocks antes de cada test
});
```

---

### 4. Meaningful Assertions

```typescript
// ❌ Malo
expect(res.json).toHaveBeenCalled();

// ✅ Bueno
expect(res.json).toHaveBeenCalledWith(
  expect.objectContaining({
    league: expect.objectContaining({
      id: expect.any(Number),
      name: expect.any(String),
    }),
    competitors: expect.any(Array),
  })
);
```

---

### 5. Edge Cases

Siempre prueba:

- ✅ Happy path (caso ideal)
- ✅ Empty data (arrays vacíos, null)
- ✅ Boundary conditions (posición 1, posición 20)
- ✅ Error scenarios (DB errors, invalid data)
- ✅ Special cases (Bronze league, Master league)

---

## 📈 Coverage Goals

### Objetivos de Coverage

- **Statements**: ≥ 80% (Actual: 100% ✅)
- **Branches**: ≥ 80% (Actual: 100% ✅)
- **Functions**: ≥ 80% (Actual: 100% ✅)
- **Lines**: ≥ 80% (Actual: 100% ✅)

### Verificar Coverage

```bash
npm test -- --coverage
```

### Ver reporte HTML

```bash
npm test -- --coverage
# Abre: coverage/lcov-report/index.html
```

---

## 🐛 Debugging Tests

### Modo Verbose

```bash
npm test -- --verbose
```

### Solo un test

```bash
npm test -- -t "should return current league"
```

### Con logs

```typescript
it('should debug something', async () => {
  console.log('Request:', req);
  console.log('Mock calls:', (db.query as jest.Mock).mock.calls);

  await leagueController.getCurrentLeague(req, res);

  console.log('Response:', (res.json as jest.Mock).mock.calls[0][0]);
});
```

---

## 🎯 Test Checklist

Cuando agregues una nueva función, asegúrate de:

- [ ] **Crear test para happy path**
- [ ] **Probar con datos vacíos**
- [ ] **Probar casos límite**
- [ ] **Probar manejo de errores**
- [ ] **Verificar validaciones**
- [ ] **Mockear dependencias**
- [ ] **Usar helpers existentes**
- [ ] **Nombres descriptivos**
- [ ] **Coverage ≥ 80%**
- [ ] **Tests pasan en CI**

---

## 📚 Additional Resources

### Jest Documentation

- [Jest Official Docs](https://jestjs.io/docs/getting-started)
- [Jest Mock Functions](https://jestjs.io/docs/mock-functions)
- [Jest Matchers](https://jestjs.io/docs/expect)

### Testing Best Practices

- [Testing Best Practices (Node.js)](https://github.com/goldbergyoni/nodebestpractices#-5-testing-best-practices)
- [AAA Pattern](https://medium.com/@pjbgf/title-testing-code-ocd-and-the-aaa-pattern-df453975ab80)

### TypeScript Testing

- [TypeScript with Jest](https://jestjs.io/docs/getting-started#via-ts-jest)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)

---

## 🎉 Summary

**Estadísticas de Tests**:

- ✅ **18 tests** escritos
- ✅ **100% coverage** en league.controller.ts
- ✅ **0 errores** en ejecución
- ✅ **5 helper functions** creadas
- ✅ **9 tests** para getCurrentLeague
- ✅ **9 tests** para getLeagueHistory

**Casos cubiertos**:

- ✅ Casos exitosos (happy paths)
- ✅ Casos de error (404, 500)
- ✅ Casos especiales (empty data)
- ✅ Edge cases (Bronze/Master leagues)
- ✅ Validación de datos
- ✅ Ordenamiento y estructura

**Próximos pasos**:

1. ✅ Mantener coverage al 100%
2. ✅ Agregar tests para nuevos endpoints
3. ✅ Actualizar tests si cambia la lógica
4. ✅ Ejecutar tests en CI/CD
5. ✅ Revisar tests en code reviews

---

**Happy Testing!** 🚀
