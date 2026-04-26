import React, { useState, useEffect, useMemo } from "react";
import { Plus, Filter, ArrowUpDown, Wallet, Calendar, Tag, ChevronDown, RefreshCw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { v4 as uuidv4 } from "uuid";
import type { Expense } from "./types";
import { DEFAULT_CATEGORIES } from "./types";

// Helper to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount / 100);
};

// Normalize date to YYYY-MM-DD regardless of OS/locale display format (e.g. DD-MM-YYYY on Windows India)
function normalizeDate(val: string): string {
  if (!val) return val;
  // Handle DD-MM-YYYY (Windows Indian locale)
  const ddmmyyyy = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // Handle DD/MM/YYYY
  const slash = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  return val; // Already YYYY-MM-DD or parseable
}

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalInView, setTotalInView] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null); // Dedicated info state for non-error notifications
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"date_desc" | "date_asc">("date_desc");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    amount?: string;
    description?: string;
    date?: string;
  }>({});

  // Form State
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Food");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Idempotency Key Persistence (survives page refresh during submission)
  const [draftId, setDraftId] = useState(() => {
    const saved = sessionStorage.getItem("spendSense_draftId");
    if (saved) return saved;
    const newId = uuidv4();
    sessionStorage.setItem("spendSense_draftId", newId);
    return newId;
  });

  const [categorySummary, setCategorySummary] = useState<{category: string, total: number}[]>([]);

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null); // Clear error on retry
    try {
      const query = new URLSearchParams({
        category: filterCategory,
        sort: sortOrder
      });
      const response = await fetch(`/api/expenses?${query}`);
      if (!response.ok) throw new Error("Failed to fetch expenses");
      const data = await response.json();
      setExpenses(data.expenses);
      setTotalInView(data.total);
      setError(null);
    } catch (err) {
      setError("Unable to load expenses. Please check your connection.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const resp = await fetch("/api/expenses/categories");
      if (resp.ok) {
        const cats = await resp.json();
        setDynamicCategories(cats);
      }
    } catch (e) {
      console.error("Failed to fetch categories");
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch("/api/expenses/summary");
      if (response.ok) {
        const data = await response.json();
        setCategorySummary(data);
      }
    } catch (err) {
      console.error("Summary fetch failed", err);
    }
  };

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [filterCategory, sortOrder]);

  useEffect(() => {
    fetchSummary();
  }, [expenses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Inline field validation
    const newFieldErrors: typeof fieldErrors = {};
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newFieldErrors.amount = "Enter a valid positive amount";
    }
    if (!description.trim()) {
      newFieldErrors.description = "Description cannot be empty";
    }
    const nd = normalizeDate(date);
    if (!nd || isNaN(Date.parse(nd))) {
      newFieldErrors.date = "Please select a valid date";
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      // We don't return here yet, we need to ensure isSubmitting isn't flipped yet
      // but in the provided snippet it says:
      // setFieldErrors(newFieldErrors);
      // setIsSubmitting(false);
      // return;
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    setError(null);
    setInfo(null);
    
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount, // Send as string to avoid float precision issues in JS
          category: category.trim(),
          description: description.trim(),
          date: normalizeDate(date), // Normalize to YYYY-MM-DD for backend compatibility across OS/locales
          client_id: draftId
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Submission failed");
      }
      
      const newExpense = await response.json();
      
      if (newExpense.isDuplicate) {
        setInfo("This transaction was already recorded — no duplicate created.");
        setError(null);
      } else {
        setInfo(null);
        setError(null);
      }
      
      // Update local state
      setExpenses(prev => {
        const exists = prev.some(e => e.client_id === newExpense.client_id);
        if (exists) return prev;
        return sortOrder === "date_desc" ? [newExpense, ...prev] : [...prev, newExpense];
      });
      
      // Reset form on success
      setAmount("");
      setDescription("");
      
      // Successfully processed: cycle the draftId for next entry
      const nextId = uuidv4();
      setDraftId(nextId);
      sessionStorage.setItem("spendSense_draftId", nextId);

      // Refresh categories list in case a new one was added
      fetchCategories();
    } catch (err: any) {
      setError(err.message || "Failed to record expense. Please retry.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalOverallAmount = useMemo(() => {
    return categorySummary.reduce((sum, item) => sum + item.total, 0);
  }, [categorySummary]);

  const allCategories = useMemo(() => {
    const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...dynamicCategories]));
    return combined.sort();
  }, [dynamicCategories]);

  const getCategoryBadgeColor = (cat: string) => {
    switch (cat) {
      case "Food": return "bg-amber-100 text-amber-800";
      case "Transport": return "bg-blue-100 text-blue-800";
      case "Housing": return "bg-purple-100 text-purple-800";
      case "Entertainment": return "bg-pink-100 text-pink-800";
      case "Healthcare": return "bg-green-100 text-green-800";
      case "Shopping": return "bg-indigo-100 text-indigo-800";
      default: return "bg-slate-100 text-slate-800";
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Wallet className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">LedgerPro</h1>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6">New Transaction</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-1">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setFieldErrors(f => ({...f, amount: undefined}));
                }}
                disabled={isSubmitting}
                className={`w-full px-4 py-2.5 bg-slate-50 border ${fieldErrors.amount ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200'} rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all`}
                required
              />
              {fieldErrors.amount && (
                <p className="text-xs text-red-500 mt-1 ml-1">{fieldErrors.amount}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-1">Category</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none"
                >
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setFieldErrors(f => ({...f, date: undefined}));
                }}
                disabled={isSubmitting}
                className={`w-full px-4 py-2.5 bg-slate-50 border ${fieldErrors.date ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200'} rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all`}
                required
              />
              {fieldErrors.date && (
                <p className="text-xs text-red-500 mt-1 ml-1">{fieldErrors.date}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 ml-1">Description</label>
              <textarea
                rows={3}
                placeholder="e.g. Weekly groceries"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setFieldErrors(f => ({...f, description: undefined}));
                }}
                disabled={isSubmitting}
                className={`w-full px-4 py-2.5 bg-slate-50 border ${fieldErrors.description ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200'} rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all`}
                required
              />
              {fieldErrors.description && (
                <p className="text-xs text-red-500 mt-1 ml-1">{fieldErrors.description}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-md shadow-sm transition-all flex items-center justify-center gap-2 ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'
              }`}
            >
              {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {isSubmitting ? "Processing..." : "Add Expense"}
            </button>
          </form>

          {categorySummary.length > 0 && (
            <div className="mt-10 pt-10 border-t border-slate-100">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Allocation</h2>
              <div className="space-y-4">
                {categorySummary.sort((a, b) => b.total - a.total).slice(0, 4).map(item => (
                  <div key={item.category} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-600">{item.category}</span>
                      <span className="text-slate-400 font-medium">{Math.round((item.total / (totalOverallAmount || 1)) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.total / (totalOverallAmount || 1)) * 100}%` }}
                        className="bg-indigo-500 h-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>Ledger Encrypted & Live</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header / Stats */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <div className="flex gap-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Net Expenditure</span>
              <span className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(totalOverallAmount)}</span>
            </div>
            <div className="flex flex-col border-l border-slate-100 pl-10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Active View Total</span>
              <span className="text-2xl font-bold text-indigo-600 tracking-tight">{formatCurrency(totalInView)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="pl-9 pr-8 py-2 border border-slate-200 rounded-md text-sm font-medium bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Categories</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <button
              onClick={() => setSortOrder(prev => prev === "date_desc" ? "date_asc" : "date_desc")}
              className="px-4 py-2 border border-slate-200 rounded-md text-sm font-medium bg-white hover:bg-slate-50 flex items-center gap-2 transition-all active:bg-slate-100"
            >
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
              {sortOrder === "date_desc" ? "Sort: Newest" : "Sort: Oldest"}
            </button>
          </div>
        </header>

        {/* List Section */}
        <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-100 p-4 rounded-lg flex items-center gap-3 text-red-700 text-sm font-medium mb-6"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}

          {info && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex items-center gap-3 text-indigo-700 text-sm font-medium mb-6"
            >
              <AlertCircle className="w-4 h-4" />
              {info}
            </motion.div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-40">Date</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-40">Category</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right w-40">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence mode="popLayout" initial={false}>
                  {loading && expenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
                        <span className="text-sm font-medium">Synchronizing records...</span>
                      </td>
                    </tr>
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center text-slate-400">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Tag className="w-6 h-6 opacity-30" />
                        </div>
                        <span className="text-sm font-medium">No transactions found for the selection.</span>
                      </td>
                    </tr>
                  ) : (
                    expenses.map((expense) => (
                      <motion.tr
                        key={expense.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        layout
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                          {new Date(expense.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider ${getCategoryBadgeColor(expense.category)}`}>
                            {expense.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 max-w-md truncate">
                          {expense.description}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right tabular-nums whitespace-nowrap">
                          {formatCurrency(expense.amount)}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
              <p className="text-xs text-slate-500 font-medium italic">
                Showing {expenses.length} transaction{expenses.length !== 1 ? 's' : ''} in the current view.
              </p>
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Audit Ready
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
