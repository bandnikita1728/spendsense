export interface Expense {
  id: number;
  client_id: string;
  amount: number; // Stored as paise/cents (integer)
  category: string;
  description: string;
  date: string;
  created_at: string;
}

export interface ExpensesResponse {
  expenses: Expense[];
  total: number; // Total paise/cents in current view
  count: number;
}

export type ExpenseCategory = string;

export const DEFAULT_CATEGORIES: string[] = ["Food", "Transport", "Housing", "Entertainment", "Healthcare", "Shopping", "Other"];
