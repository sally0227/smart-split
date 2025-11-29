import { BalanceSheet, Expense, Member, Transaction } from "../types";

// Calculate Net Balances for each member
export const calculateBalances = (expenses: Expense[], members: Member[]): BalanceSheet => {
  const balances: BalanceSheet = {};
  
  // Initialize
  members.forEach(m => balances[m.id] = 0);

  expenses.forEach(expense => {
    // Who paid (Creditors)
    expense.paidBy.forEach(payer => {
      balances[payer.memberId] = (balances[payer.memberId] || 0) + payer.amount;
    });

    // Who owes (Debtors)
    expense.splitAmong.forEach(debtor => {
      balances[debtor.memberId] = (balances[debtor.memberId] || 0) - debtor.amount;
    });
  });

  return balances;
};

// Minimize Transactions (Greedy Algorithm / Min-Cash-Flow)
export const calculateMinimalTransactions = (balances: BalanceSheet): Transaction[] => {
  const debtors: { id: string, amount: number }[] = [];
  const creditors: { id: string, amount: number }[] = [];

  // Floating point precision fix helper
  const round = (num: number) => Math.round(num * 100) / 100;

  Object.entries(balances).forEach(([id, amount]) => {
    const val = round(amount);
    if (val < -0.01) debtors.push({ id, amount: val }); // Negative means they owe
    if (val > 0.01) creditors.push({ id, amount: val }); // Positive means they receive
  });

  // Sort by magnitude (optional but helps greedy match)
  debtors.sort((a, b) => a.amount - b.amount); // Most negative first
  creditors.sort((a, b) => b.amount - a.amount); // Most positive first

  const transactions: Transaction[] = [];
  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    // The amount to settle is the minimum of what debtor owes and creditor is owed
    const amount = round(Math.min(Math.abs(debtor.amount), creditor.amount));

    // Requirement: Final displayed transactions should be integers (no decimals)
    const roundedAmount = Math.round(amount);

    if (roundedAmount > 0) {
      transactions.push({
        from: debtor.id,
        to: creditor.id,
        amount: roundedAmount
      });
    }

    // Update remaining amounts (keep precise logic for calculation, but output rounded)
    debtor.amount = round(debtor.amount + amount);
    creditor.amount = round(creditor.amount - amount);

    // Move indices if settled
    if (Math.abs(debtor.amount) < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
};

// Generate a textual description of the raw pairwise debts before simplification
// This mimics the prompt's request: "A owes B 30, A owes C 100..."
export const getDetailedRawDebts = (expenses: Expense[], members: Member[]): string[] => {
  // This is conceptually O(N^2) tracking every pairwise debt
  // We use a matrix: debt[from][to] = amount
  const debtMatrix: Record<string, Record<string, number>> = {};
  
  members.forEach(m => {
    debtMatrix[m.id] = {};
    members.forEach(target => {
      debtMatrix[m.id][target.id] = 0;
    });
  });

  expenses.forEach(exp => {
    // For each expense, we need to distribute the payment load
    // Simple logic: total paid P, total split S. 
    // Usually P = S.
    // If multiple payers/splitters, it's complex. 
    // We treat it as: Each splitter owes Each payer a fraction proportional to payer's contribution.
    
    const totalPaid = exp.paidBy.reduce((sum, p) => sum + p.amount, 0);
    
    if (totalPaid === 0) return;

    exp.splitAmong.forEach(splitter => {
      exp.paidBy.forEach(payer => {
        // How much of this splitter's debt is owed to this payer?
        // Ratio: payer.amount / totalPaid
        const debtChunk = splitter.amount * (payer.amount / totalPaid);
        
        // If payer is same as splitter, they owe themselves (cancel out)
        if (splitter.memberId !== payer.memberId) {
             debtMatrix[splitter.memberId][payer.memberId] += debtChunk;
        }
      });
    });
  });

  // Now consolidate reverse debts (If A owes B 100 and B owes A 30, simplify to A owes B 70)
  const results: string[] = [];
  const processed = new Set<string>();

  members.forEach(a => {
    members.forEach(b => {
      if (a.id === b.id) return;
      const key = [a.id, b.id].sort().join('-');
      if (processed.has(key)) return;

      const aOwesB = debtMatrix[a.id][b.id];
      const bOwesA = debtMatrix[b.id][a.id];

      const net = aOwesB - bOwesA;
      if (net > 0.01) {
        results.push(`${a.name} 欠 ${b.name} $${Math.round(net)}`);
      } else if (net < -0.01) {
        results.push(`${b.name} 欠 ${a.name} $${Math.round(Math.abs(net))}`);
      }
      processed.add(key);
    });
  });

  return results;
};
