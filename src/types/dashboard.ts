export type DashboardMovementType =
  | "INCOME"
  | "EXPENSE"
  | "BOX_CONTRIBUTION";

export type DashboardSummary = {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  movementsCount: number;
  biggestExpense: number;
  biggestExpenseDescription: string | null;
};

export type DashboardCategory = {
  name: string;
  total: number;
  percentage: number;
};

export type DashboardMovement = {
  id: string;
  date: string;
  description: string;
  category: string | null;
  amount: number;
  type: DashboardMovementType;
  necessityLevel: string | null;
  source: string | null;
};

export type DashboardInvoice = {
  id: string;
  description: string;
  amount: number;
  dueDate: string | null;
  status: string | null;
  paidAt: string | null;
};

export type DashboardBox = {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number | null;
  progress: number;
};

export type DashboardAlert = {
  id: string;
  type: "info" | "warning" | "danger" | "success";
  title: string;
  message: string;
};

export type DashboardHistoryItem = {
  competence: string;
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
};

export type DashboardPayload = {
  competence: string;
  summary: DashboardSummary;
  categories: DashboardCategory[];
  movements: DashboardMovement[];
  invoices: DashboardInvoice[];
  boxes: DashboardBox[];
  alerts: DashboardAlert[];
  history: DashboardHistoryItem[];
};
