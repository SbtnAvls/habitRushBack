// Setup file for tests
// This runs before all tests

// Mock environment variables
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.REFRESH_TOKEN_SECRET = 'test_refresh_secret';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'test_db';

// Set test timeout
jest.setTimeout(10000);

// Mock uuid module to avoid ESM import issues
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-' + Math.random().toString(36).substring(7)),
}));
