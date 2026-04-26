import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, db } from '../server';

describe('Expense Tracker API', () => {
  beforeEach(() => {
    // Clear the in-memory database before each test
    db.prepare('DELETE FROM expenses').run();
  });

  describe('POST /api/expenses', () => {
    it('creates a new expense and returns 201', async () => {
      const payload = {
        amount: "150.50",
        category: "Food",
        description: "Dinner",
        date: "2026-04-26",
        client_id: "test-uuid-1"
      };

      const res = await request(app)
        .post('/api/expenses')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(15050); // Stored as paise
      expect(res.body.category).toBe("Food");
      expect(res.body.client_id).toBe("test-uuid-1");
    });

    it('idempotency: same client_id returns 200 with existing data', async () => {
      const payload = {
        amount: "100",
        category: "Transport",
        description: "Taxi",
        date: "2026-04-26",
        client_id: "idempotency-test"
      };

      // First request
      const res1 = await request(app).post('/api/expenses').send(payload);
      expect(res1.status).toBe(201);
      const firstId = res1.body.id;

      // Second request with same client_id
      const res2 = await request(app).post('/api/expenses').send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.id).toBe(firstId);
      expect(res2.body.isDuplicate).toBe(true);

      // Verify no duplicate in DB
      const count = db.prepare('SELECT COUNT(*) as count FROM expenses').get() as { count: number };
      expect(count.count).toBe(1);
    });

    it('returns 400 for invalid amount', async () => {
      const payload = {
        amount: "-10",
        category: "Food",
        description: "Invalid",
        date: "2026-04-26",
        client_id: "test-uuid-fail"
      };

      const res = await request(app).post('/api/expenses').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid positive amount/);
    });
  });

  describe('GET /api/expenses', () => {
    beforeEach(() => {
      // Seed some data
      const stmt = db.prepare('INSERT INTO expenses (client_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)');
      stmt.run('uuid-1', 1000, 'Food', 'Lunch', '2026-04-25');
      stmt.run('uuid-2', 2000, 'Transport', 'Bus', '2026-04-26');
      stmt.run('uuid-3', 3000, 'Food', 'Dinner', '2026-04-26');
    });

    it('filters by category and calculates correct total', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .query({ category: 'Food' });

      expect(res.status).toBe(200);
      expect(res.body.expenses).toHaveLength(2);
      expect(res.body.total).toBe(4000); // 1000 + 3000
    });

    it('sorts by date desc by default', async () => {
      const res = await request(app).get('/api/expenses');
      expect(res.status).toBe(200);
      expect(new Date(res.body.expenses[0].date).getTime()).toBeGreaterThanOrEqual(new Date(res.body.expenses[2].date).getTime());
    });
  });
});
