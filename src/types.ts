export interface Member {
  id: string;
  name: string;
}

export interface SplitDetail {
  memberId: string;
  amount: number;
}

export interface Expense {
  id: string;
  title: string;
  date: string; // ISO string
  totalAmount: number;
  paidBy: SplitDetail[]; // Who paid how much
  splitAmong: SplitDetail[]; // Who needs to pay how much
  timestamp: number;
}

export interface Transaction {
  from: string; // Member ID
  to: string;   // Member ID
  amount: number;
  explanation?: string; // For step-by-step logic
}

export interface HistoryRecord {
  id: string;
  startDate: string;
  endDate: string;
  summary: string; // Text summary
  visualGraph?: string; // AI Generated SVG Timeline
  expenses: Expense[];
  settlementPlan: Transaction[]; // Accumulated transactions from cleared members
  totalSpent: number;
  isPartial: boolean; // True if settlement is still ongoing (not everyone cleared)
}

export interface Group {
  id: string;
  name: string;
  members: Member[];
  expenses: Expense[]; // Active expenses
  history: HistoryRecord[];
  
  // New features
  deviceBindings: Record<string, string>; // deviceId -> memberId
  clearedMemberIds: string[]; // List of members who have cleared their debt for current session
  activeSettlementId?: string; // ID of the history record currently being built
}

export interface BalanceSheet {
  [memberId: string]: number; // Positive = Owed to them, Negative = They owe
}
