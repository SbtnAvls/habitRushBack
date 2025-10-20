# Unit Tests - HabitRush Backend

Complete unit test suite for the authentication system and related components.

---

## 📁 Test Structure

```
src/__tests__/
├── setup.ts                           # Global test configuration
├── helpers/
│   └── test-helpers.ts               # Utility functions for tests
├── mocks/
│   └── db.mock.ts                    # Database mock
├── controllers/
│   └── auth.controller.test.ts       # Auth controller tests (25 tests)
├── middleware/
│   └── auth.middleware.test.ts       # Auth middleware tests (10 tests)
└── models/
    ├── refresh-token.model.test.ts   # Refresh token model tests (15 tests)
    └── token-blacklist.model.test.ts # Blacklist model tests (18 tests)
```

**Total: 68 unit tests**

---

## 🚀 Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (auto-rerun on file changes)
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

### Run tests with verbose output
```bash
npm run test:verbose
```

### Run specific test file
```bash
npm test auth.controller.test
```

### Run tests matching pattern
```bash
npm test -- --testNamePattern="login"
```

---

## 📊 Coverage Goals

Current coverage targets:
- **Statements:** > 80%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 80%

View coverage report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## 🧪 Test Categories

### 1. Controller Tests (`controllers/auth.controller.test.ts`)

Tests for authentication endpoints:
- ✅ User registration (7 tests)
- ✅ User login (6 tests)
- ✅ Token refresh (6 tests)
- ✅ Get current user (3 tests)
- ✅ Logout (4 tests)

**Key scenarios covered:**
- Valid requests with correct data
- Missing required fields
- Invalid credentials
- Token expiration
- Blacklisted tokens
- Database errors

---

### 2. Middleware Tests (`middleware/auth.middleware.test.ts`)

Tests for authentication middleware:
- ✅ Valid token authentication
- ✅ Missing token handling
- ✅ Invalid token formats
- ✅ Expired tokens
- ✅ Blacklisted tokens
- ✅ Wrong JWT secret
- ✅ Database error handling

**Key scenarios covered:**
- Token extraction from headers
- JWT verification
- Blacklist checking
- User data attachment to request

---

### 3. Model Tests

#### Refresh Token Model (`models/refresh-token.model.test.ts`)
- ✅ Create refresh token
- ✅ Find token by token string
- ✅ Find tokens by user ID
- ✅ Delete token by token string
- ✅ Delete all tokens for user
- ✅ Delete expired tokens

#### Token Blacklist Model (`models/token-blacklist.model.test.ts`)
- ✅ Create blacklist entry
- ✅ Check if token is blacklisted
- ✅ Delete expired blacklist entries
- ✅ Delete blacklist entries by user
- ✅ Integration scenarios

---

## 🛠️ Test Utilities

### Test Helpers (`helpers/test-helpers.ts`)

Utility functions available for all tests:

```typescript
// Create test user
const user = createTestUser({ email: 'custom@example.com' });

// Generate tokens
const accessToken = generateAccessToken(userId);
const refreshToken = generateRefreshToken(userId);
const expiredToken = generateExpiredAccessToken(userId);

// Mock Express objects
const req = mockRequest({ body: { email: 'test@example.com' } });
const res = mockResponse();
const next = mockNext();

// Wait for async operations
await wait(1000);
```

---

## 📝 Writing New Tests

### Example: Testing a new controller method

```typescript
import { Request, Response } from 'express';
import * as myController from '../../controllers/my.controller';
import { mockRequest, mockResponse } from '../helpers/test-helpers';

// Mock dependencies
jest.mock('../../models/my.model');

describe('My Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something successfully', async () => {
    const req = mockRequest({
      body: { data: 'test' },
    }) as Request;
    const res = mockResponse() as unknown as Response;

    await myController.myMethod(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('should return 400 on validation error', async () => {
    const req = mockRequest({
      body: {},
    }) as Request;
    const res = mockResponse() as unknown as Response;

    await myController.myMethod(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: expect.any(String),
    });
  });
});
```

---

## 🐛 Debugging Tests

### Run single test with debugging
```bash
node --inspect-brk node_modules/.bin/jest --runInBand auth.controller.test
```

### Use console.log in tests
```typescript
it('should debug something', () => {
  console.log('Debug info:', someVariable);
  expect(someVariable).toBe(expected);
});
```

### Use Jest debugger
```typescript
it('should debug with breakpoint', () => {
  debugger; // Add breakpoint
  expect(true).toBe(true);
});
```

---

## ⚙️ Configuration

### Jest Config (`jest.config.js`)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/app.ts',
    '!src/db.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

### Environment Variables (`setup.ts`)

Test environment variables are set in `setup.ts`:
- `JWT_SECRET`: test_jwt_secret
- `REFRESH_TOKEN_SECRET`: test_refresh_secret
- Database config: test values

---

## 🎯 Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to reset state
- Clear all mocks between tests

### 2. Descriptive Names
```typescript
// ✅ Good
it('should return 401 if token is expired')

// ❌ Bad
it('test token')
```

### 3. Arrange-Act-Assert Pattern
```typescript
it('should create user', async () => {
  // Arrange
  const userData = { name: 'John', email: 'john@example.com' };

  // Act
  const result = await UserModel.create(userData);

  // Assert
  expect(result.id).toBeDefined();
});
```

### 4. Test Edge Cases
- Empty inputs
- Null/undefined values
- Invalid data types
- Database errors
- Network failures

### 5. Mock External Dependencies
```typescript
// Mock database
jest.mock('../../db');

// Mock external API
jest.mock('axios');
```

---

## 📈 Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

---

## 🔍 Common Issues

### Issue: Tests failing with "Cannot find module"
**Solution:** Make sure all imports use correct relative paths

### Issue: "Database connection error"
**Solution:** Database is mocked, check that `jest.mock('../../db')` is present

### Issue: Tests timeout
**Solution:** Increase timeout in `jest.config.js` or specific test:
```typescript
jest.setTimeout(10000);
```

### Issue: Coverage not showing
**Solution:** Run `npm run test:coverage` and check `coverage/` folder

---

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

---

## ✅ Checklist for New Features

When adding new features, ensure:
- [ ] Unit tests written for new code
- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Edge cases tested
- [ ] Mocks properly configured
- [ ] Coverage > 80%
- [ ] All tests pass
- [ ] Documentation updated

---

## 🎉 Quick Commands

```bash
# Run all tests
npm test

# Watch mode (recommended during development)
npm run test:watch

# Coverage report
npm run test:coverage

# Verbose output (see all test names)
npm run test:verbose

# Run specific file
npm test auth.controller

# Run tests matching pattern
npm test -- --testNamePattern="login"

# Update snapshots (if using snapshot testing)
npm test -- -u

# Type checking
npm run type-check
```

---

**Happy Testing! 🚀**
