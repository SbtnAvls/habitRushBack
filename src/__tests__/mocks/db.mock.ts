/**
 * Mock database pool for testing
 * This prevents actual database connections during tests
 */

export const mockPool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn(),
};

// Mock the db module
jest.mock('../../db', () => mockPool);

export default mockPool;
