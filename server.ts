import express from "express";
import path from "path";
import Database from "better-sqlite3";

const __dirname = process.cwd();

// Export for testing: Use in-memory DB during tests to ensure isolation
export const db = new Database(process.env.NODE_ENV === "test" ? ":memory:" : path.resolve(__dirname, "expenses.db"));

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT UNIQUE,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export const app = express();
app.use(express.json());

// --- API Routes ---

// Get all unique categories currently in use
app.get("/api/expenses/categories", (req, res) => {
  try {
    const categories = db.prepare("SELECT DISTINCT category FROM expenses ORDER BY category ASC").all() as { category: string }[];
    res.json(categories.map(c => c.category));
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create an expense
app.post("/api/expenses", (req, res) => {
  const { amount, category, description, date, client_id } = req.body;

  const parsedAmount = parseFloat(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "A valid positive amount is required" });
  }
  
  if (parsedAmount > 10000000) {
    return res.status(400).json({ error: "Amount exceeds maximum limit" });
  }

  // Whitelist prevents arbitrary category pollution in the database
  const VALID_CATEGORIES = ["Food", "Transport", "Housing", "Entertainment", "Healthcare", "Shopping", "Other"];
  if (!category || typeof category !== "string" || category.trim().length === 0) {
    return res.status(400).json({ error: "Category is required" });
  }
  
  if (!VALID_CATEGORIES.includes(category.trim())) {
    return res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
  }
  
  if (!description || typeof description !== "string" || description.trim().length === 0) {
    return res.status(400).json({ error: "Non-empty description is required" });
  }

  if (!date || isNaN(Date.parse(date))) {
    return res.status(400).json({ error: "Valid date is required (YYYY-MM-DD)" });
  }

  if (!client_id || typeof client_id !== "string") {
    return res.status(400).json({ error: "client_id is required for idempotency" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO expenses (client_id, amount, category, description, date)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const amountInPaise = Math.round(parsedAmount * 100);
    const info = stmt.run(client_id, amountInPaise, category.trim(), description.trim(), date);
    
    const newExpense = db.prepare("SELECT * FROM expenses WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(newExpense);
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const existing = db.prepare("SELECT * FROM expenses WHERE client_id = ?").get(client_id) as any;
      return res.status(200).json({ ...existing, isDuplicate: true });
    }
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get expenses with stats
app.get("/api/expenses", (req, res) => {
  const { category, sort } = req.query;
  
  let whereClause = "";
  const params: any[] = [];

  if (category) {
    whereClause = " WHERE category = ? COLLATE NOCASE";
    params.push(category);
  }

  const sortOrder = sort === "date_asc" ? "ASC" : "DESC";
  const orderClause = ` ORDER BY date ${sortOrder}, created_at ${sortOrder}`;

  try {
    const expenses = db.prepare(`SELECT * FROM expenses${whereClause}${orderClause}`).all(...params);
    const stats = db.prepare(`SELECT SUM(amount) as total, COUNT(*) as count FROM expenses${whereClause}`).get(...params) as { total: number | null, count: number };
    
    res.json({
      expenses,
      total: stats.total || 0,
      count: stats.count
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Summary per category
app.get("/api/expenses/summary", (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT category, SUM(amount) as total
      FROM expenses
      GROUP BY category
    `).all();
    res.json(summary);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export async function startServer() {
  // Vite / Static logic
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer, loadEnv } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const tailwindcss = (await import("@tailwindcss/vite")).default;

    const env = loadEnv("development", process.cwd(), "");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      configFile: false, // Bypass external config file to avoid Windows tsx/Vite load issues
      plugins: [react(), tailwindcss()],
      define: {
        "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      },
      resolve: {
        alias: {
          "@": process.cwd(),
        },
      },
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only run server if not in test mode
if (process.env.NODE_ENV !== "test") {
  startServer();
}
