import React, { useState, useEffect, useMemo } from 'react';
import { Group, Expense, SplitDetail, Transaction } from './types';
import { calculateBalances, calculateMinimalTransactions, getDetailedRawDebts } from './utils/algorithm';
import { generateHistoryArtifact, explainSettlementLogic } from './services/geminiService';
import { HistoryTimeline } from './components/HistoryTimeline';
import { 
  Plus, Users, Calculator, CheckCircle, ArrowRight, Wallet, 
  CreditCard, PieChart, ChevronLeft, LogOut, Loader2, Archive, Smartphone, Lightbulb, Trash2, X, UserMinus
} from 'lucide-react';

const STORAGE_KEY = 'smartsplit_data_v2';
const DEVICE_ID_KEY = 'smartsplit_device_id';

const App: React.FC = () => {
  // --- Device Identity System ---
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    setDeviceId(id);
  }, []);

  // --- Data State ---
  const [groups, setGroups] = useState<Group[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Data load error", e);
      return [];
    }
  });

  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [view, setView] = useState<'DASHBOARD' | 'ADD_EXPENSE' | 'SETTLEMENT' | 'IDENTITY_SETUP'>('DASHBOARD');
  
  // Modals & Inputs
  const [newGroupName, setNewGroupName] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [identitySelection, setIdentitySelection] = useState<string>('');
  
  // UI State for Delete Mode
  const [isDeleteMemberMode, setIsDeleteMemberMode] = useState(false);
  
  // Expense List State
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  // Add/Edit Expense State
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 16));
  const [expPayers, setExpPayers] = useState<Record<string, number>>({});
  const [expSplitters, setExpSplitters] = useState<Record<string, number>>({});
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');

  // Settlement State
  const [settlementResult, setSettlementResult] = useState<{
    rawDebts: string[];
    transactions: (Transaction & { fromName: string; toName: string })[];
    balances: Record<string, number>;
    explanation: string;
    myTransactions: (Transaction & { fromName: string; toName: string })[]; // Transactions relevant to the current user
  } | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isProcessingHistory, setIsProcessingHistory] = useState(false);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }, [groups]);

  // --- Derived State ---
  const currentGroup = useMemo(() => groups.find(g => g.id === currentGroupId), [groups, currentGroupId]);
  
  const currentMemberMap = useMemo(() => {
      const map = new Map<string, string>();
      currentGroup?.members.forEach(m => map.set(m.id, m.name));
      return map;
  }, [currentGroup]);

  // The member ID bound to this device in the current group
  const myMemberId = useMemo(() => {
    if (!currentGroup || !deviceId) return null;
    return currentGroup.deviceBindings?.[deviceId] || null;
  }, [currentGroup, deviceId]);

  // Have I cleared my debt for the current active session?
  const isMyDebtCleared = useMemo(() => {
    if (!currentGroup || !myMemberId) return false;
    return currentGroup.clearedMemberIds?.includes(myMemberId) || false;
  }, [currentGroup, myMemberId]);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // --- Identity Check Logic ---
  const handleGroupSelect = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    // Check if device is bound
    const boundMemberId = group.deviceBindings?.[deviceId];
    
    if (boundMemberId) {
        // Already bound, proceed
        setCurrentGroupId(groupId);
        setView('DASHBOARD');
    } else {
        // Not bound, force selection
        setCurrentGroupId(groupId);
        setView('IDENTITY_SETUP');
    }
  };

  const handleBindIdentity = () => {
    if (!currentGroup || !identitySelection) return;

    // Check if this member is already bound to ANOTHER device
    const existingDeviceId = Object.keys(currentGroup.deviceBindings || {}).find(
        key => currentGroup.deviceBindings[key] === identitySelection
    );

    if (existingDeviceId && existingDeviceId !== deviceId) {
        alert("該角色已被其他裝置選擇！請選擇正確角色或建立新角色。");
        return;
    }

    const updatedGroups = groups.map(g => {
        if (g.id === currentGroup.id) {
            return {
                ...g,
                deviceBindings: {
                    ...(g.deviceBindings || {}),
                    [deviceId]: identitySelection
                }
            };
        }
        return g;
    });
    setGroups(updatedGroups);
    setView('DASHBOARD');
  };

  // --- Handlers: Group Management ---
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: Group = {
      id: generateId(),
      name: newGroupName,
      members: [],
      expenses: [],
      history: [],
      deviceBindings: {},
      clearedMemberIds: []
    };
    setGroups([...groups, newGroup]);
    setNewGroupName('');
  };

  const handleDeleteGroup = () => {
      if (!currentGroup) return;
      if (!window.confirm(`確定要刪除群組 "${currentGroup.name}" 嗎？\n此動作無法復原，所有紀錄將會消失。`)) return;

      const updatedGroups = groups.filter(g => g.id !== currentGroup.id);
      setGroups(updatedGroups);
      setCurrentGroupId(null);
      setView('DASHBOARD');
  };

  const handleAddMember = () => {
    if (!currentGroupId || !newMemberName.trim()) return;
    const newId = generateId();
    const updatedGroups = groups.map(g => {
      if (g.id === currentGroupId) {
        return {
          ...g,
          members: [...g.members, { id: newId, name: newMemberName }]
        };
      }
      return g;
    });
    setGroups(updatedGroups);
    setNewMemberName('');
    
    // If in identity setup, allow selecting this new member immediately
    if (view === 'IDENTITY_SETUP') {
        setIdentitySelection(newId);
    }
  };

  const handleDeleteMember = (memberId: string) => {
      if (!currentGroup) return;
      const memberName = currentMemberMap.get(memberId);
      
      // 1. Check if member is a PAYER in any active expense
      const isPayer = currentGroup.expenses.some(e => e.paidBy.some(p => p.memberId === memberId));
      if (isPayer) {
          alert(`無法刪除 "${memberName}"！\n\n原因：該成員在目前的帳務中有「先墊付」的款項。\n\n請先編輯或刪除相關花費，確認該成員沒有代墊款項後才能刪除。`);
          return;
      }

      if (!window.confirm(`確定要刪除成員 "${memberName}" 嗎？\n\n注意：\n1. 該成員將從群組中移除。\n2. 該成員在所有未結算花費中的分攤金額，將自動平均重新分配給剩下的成員。`)) return;

      const updatedGroups = groups.map(g => {
          if (g.id !== currentGroupId) return g;

          // A. Remove from members list
          const newMembers = g.members.filter(m => m.id !== memberId);
          
          // B. Remove from device bindings
          const newBindings = { ...g.deviceBindings };
          Object.keys(newBindings).forEach(key => {
              if (newBindings[key] === memberId) delete newBindings[key];
          });

          // C. Update Expenses (Redistribute logic)
          const newExpenses = g.expenses.map(e => {
              // Is the deleted person involved in the split?
              const wasSplitter = e.splitAmong.some(s => s.memberId === memberId);
              
              if (!wasSplitter) return e; // Not involved, no change needed

              // Filter out the deleted member
              const newSplitAmongIds = e.splitAmong
                  .filter(s => s.memberId !== memberId)
                  .map(s => s.memberId);
              
              if (newSplitAmongIds.length === 0) {
                  // If no one is left to split, this expense is invalid. 
                  return null; 
              }

              // Redistribute total amount equally among remaining members
              // We assume 'EQUAL' distribution for simplicity when force-deleting a member
              const newShare = e.totalAmount / newSplitAmongIds.length;
              const newSplitDetails = newSplitAmongIds.map(id => ({
                  memberId: id,
                  amount: newShare
              }));

              return {
                  ...e,
                  splitAmong: newSplitDetails
              };
          }).filter(Boolean) as Expense[];

          return {
              ...g,
              members: newMembers,
              deviceBindings: newBindings,
              expenses: newExpenses
          };
      });

      setGroups(updatedGroups);
      setIsDeleteMemberMode(false); // Exit delete mode
  };

  // --- Handlers: Expense ---
  const resetExpenseForm = () => {
    setEditingExpenseId(null);
    setExpTitle('');
    setExpAmount('');
    setExpDate(new Date().toISOString().slice(0, 16)); 
    setExpPayers({});
    setExpSplitters({}); 
    setSplitMode('EQUAL');
  };

  const openAddExpense = (expenseToEdit?: Expense) => {
    if (!currentGroup) return;

    if (expenseToEdit) {
      // EDIT MODE
      setEditingExpenseId(expenseToEdit.id);
      setExpTitle(expenseToEdit.title);
      setExpAmount(expenseToEdit.totalAmount.toString());
      setExpDate(expenseToEdit.date);
      
      const payersMap: Record<string, number> = {};
      expenseToEdit.paidBy.forEach(p => payersMap[p.memberId] = p.amount);
      setExpPayers(payersMap);

      const splittersMap: Record<string, number> = {};
      expenseToEdit.splitAmong.forEach(p => splittersMap[p.memberId] = p.amount);
      setExpSplitters(splittersMap);

      const amounts = expenseToEdit.splitAmong.map(s => s.amount);
      const allEqual = amounts.length > 0 && amounts.every(v => Math.abs(v - amounts[0]) < 0.1);
      setSplitMode(allEqual ? 'EQUAL' : 'CUSTOM');

    } else {
      // CREATE MODE
      resetExpenseForm();
      
      // Smart Default: Set Payer to Current Device User
      if (myMemberId) {
        setExpPayers({ [myMemberId]: 0 }); // 0 implies auto-fill full amount
      } else if (currentGroup.members.length > 0) {
        setExpPayers({ [currentGroup.members[0].id]: 0 });
      }

      // Default Splitters: Everyone
      const allSplit: Record<string,number> = {};
      currentGroup.members.forEach(m => allSplit[m.id] = 0);
      setExpSplitters(allSplit);
    }
    setView('ADD_EXPENSE');
  };

  const handleSaveExpense = () => {
    if (!currentGroup) return;
    const total = parseFloat(expAmount);
    
    if (isNaN(total) || total <= 0) { alert("請輸入有效總金額"); return; }
    if (!expTitle.trim()) { alert("請輸入項目名稱"); return; }

    // Validate and process Payers
    let finalPayers: SplitDetail[] = [];
    const payerIds = Object.keys(expPayers);
    const currentPayerSum = (Object.values(expPayers) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
    
    if (payerIds.length === 1 && (Math.abs(currentPayerSum - total) > 0.1 || currentPayerSum === 0)) {
       finalPayers = [{ memberId: payerIds[0], amount: total }];
    } else {
       if (Math.abs(currentPayerSum - total) > 0.1) {
           alert(`付款人總金額 (${currentPayerSum}) 與 帳單總金額 (${total}) 不符！\n請調整付款金額。`);
           return;
       }
       finalPayers = payerIds.map(id => ({ memberId: id, amount: expPayers[id] }));
    }

    // Validate and process Splitters
    let finalSplitters: SplitDetail[] = [];
    const splitterIds = Object.keys(expSplitters);

    if (splitMode === 'EQUAL') {
      if (splitterIds.length === 0) { alert("請至少選擇一位分帳成員"); return; }
      const share = total / splitterIds.length;
      finalSplitters = splitterIds.map(id => ({ memberId: id, amount: share }));
    } else {
       const currentSplitSum = (Object.values(expSplitters) as number[]).reduce((sum: number, val: number) => sum + (val || 0), 0);
       if (Math.abs(currentSplitSum - total) > 0.1) {
           alert(`分帳成員總金額 (${currentSplitSum}) 與 帳單總金額 (${total}) 不符！\n請調整各成員分攤金額。`);
           return;
       }
       finalSplitters = splitterIds.map(id => ({ memberId: id, amount: expSplitters[id] }));
    }

    const expensePayload: Expense = {
      id: editingExpenseId || generateId(),
      title: expTitle,
      date: expDate,
      totalAmount: total,
      paidBy: finalPayers,
      splitAmong: finalSplitters,
      timestamp: editingExpenseId ? (currentGroup.expenses.find(e => e.id === editingExpenseId)?.timestamp || Date.now()) : Date.now()
    };

    const updatedGroups = groups.map(g => {
      if (g.id === currentGroupId) {
        let newExpenses = [...g.expenses];
        if (editingExpenseId) {
            newExpenses = newExpenses.map(e => e.id === editingExpenseId ? expensePayload : e);
        } else {
            newExpenses.push(expensePayload);
        }
        return { ...g, expenses: newExpenses };
      }
      return g;
    });
    setGroups(updatedGroups);
    setView('DASHBOARD');
  };

  // --- Handlers: Settlement ---
  const handleCalculateSettlement = async () => {
    if (!currentGroup) return;
    setIsExplaining(true);
    setView('SETTLEMENT');

    const balances = calculateBalances(currentGroup.expenses, currentGroup.members);
    const transactions = calculateMinimalTransactions(balances);
    const rawDebts = getDetailedRawDebts(currentGroup.expenses, currentGroup.members);
    
    const memberMap = new Map<string, string>();
    currentGroup.members.forEach(m => memberMap.set(m.id, m.name));

    const namedTransactions = transactions.map(t => ({
      ...t,
      fromName: memberMap.get(t.from) || t.from,
      toName: memberMap.get(t.to) || t.to
    }));

    // Identify my transactions
    const myTransactions = namedTransactions.filter(t => t.from === myMemberId || t.to === myMemberId);

    const aiExplanation = await explainSettlementLogic(memberMap, balances, transactions);

    setSettlementResult({
      rawDebts,
      transactions: namedTransactions,
      balances,
      explanation: aiExplanation,
      myTransactions
    });
    setIsExplaining(false);
  };

  const handleClearAllDebt = async () => {
    if (!currentGroup || !settlementResult) return;
    if (!window.confirm("確定要結清所有款項並歸檔嗎？\n\n這將會：\n1. 清空目前的消費列表\n2. 產生歷史紀錄與圖表\n3. 讓您開始新一輪的記帳")) return;

    setIsProcessingHistory(true);
    const targetGroupId = currentGroupId;
    const currentExpenses = currentGroup.expenses;
    const settlementPlan = settlementResult.transactions;

    try {
        // 1. Generate History Artifacts (Summary + SVG) using AI
        const { summary, svg } = await generateHistoryArtifact(currentGroup, currentExpenses);

        // 2. Create the complete History Record
        const totalSpent = currentExpenses.reduce((acc, curr) => acc + curr.totalAmount, 0);
        
        // Calculate date range
        const dates = currentExpenses.map(e => new Date(e.date).getTime());
        const startDate = new Date(Math.min(...dates)).toISOString();
        const endDate = new Date(Math.max(...dates)).toISOString();

        const newHistoryRecord = {
            id: generateId(),
            startDate,
            endDate,
            summary,
            visualGraph: svg,
            expenses: currentExpenses,
            settlementPlan: settlementPlan,
            totalSpent,
            isPartial: false // It's fully cleared
        };

        // 3. Update Group: Add History, Clear Active Expenses
        setGroups(prevGroups => prevGroups.map(g => {
            if (g.id !== targetGroupId) return g;
            
            return {
                ...g,
                expenses: [], // Clear active expenses
                history: [newHistoryRecord, ...g.history], // Add to history
                clearedMemberIds: [], // Reset cleared status
                activeSettlementId: undefined // Reset settlement session
            };
        }));

        setSettlementResult(null);
        
        // Use timeout to ensure state updates before navigating
        setTimeout(() => {
            setView('DASHBOARD');
            window.scrollTo(0, 0);
        }, 100);

    } catch (e) {
        console.error(e);
        alert("歸檔過程發生錯誤，請重試。");
    } finally {
        setIsProcessingHistory(false);
    }
  };

  const handleClearMyDebt = async () => {
      // Compatibility function if called, redirects to Clear All (Admin Mode)
      // But mainly we use handleClearAllDebt now.
      handleClearAllDebt();
  };

  // --- Render 1: Identity Setup ---
  if (view === 'IDENTITY_SETUP' && currentGroup) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
             <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md">
                 <div className="text-center mb-6">
                     <Smartphone className="w-12 h-12 text-indigo-600 mx-auto mb-2" />
                     <h2 className="text-xl font-bold text-gray-800">您是哪一位？</h2>
                     <p className="text-sm text-gray-500">請將此裝置連結至群組成員</p>
                 </div>
                 
                 <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
                     {currentGroup.members.map(m => {
                         const isBound = Object.values(currentGroup.deviceBindings || {}).includes(m.id);
                         return (
                             <button 
                                key={m.id}
                                onClick={() => !isBound && setIdentitySelection(m.id)}
                                className={`w-full p-3 rounded-xl border flex items-center justify-between
                                    ${identitySelection === m.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200'}
                                    ${isBound ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:border-indigo-300'}
                                `}
                             >
                                 <span className="font-bold text-gray-700">{m.name}</span>
                                 {isBound && <span className="text-xs text-gray-500">(已連結)</span>}
                                 {identitySelection === m.id && <CheckCircle className="w-5 h-5 text-indigo-600"/>}
                             </button>
                         )
                     })}
                 </div>

                 <div className="mb-4">
                     <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="或建立新成員..." 
                            value={newMemberName}
                            onChange={e => setNewMemberName(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        />
                        <button onClick={handleAddMember} className="bg-gray-200 px-3 py-2 rounded-lg hover:bg-gray-300">
                            <Plus className="w-5 h-5"/>
                        </button>
                     </div>
                 </div>

                 <button 
                    onClick={handleBindIdentity}
                    disabled={!identitySelection}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
                 >
                     確認連結
                 </button>
             </div>
        </div>
      );
  }

  // --- Render 2: Group Selection ---
  if (!currentGroupId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-indigo-600 tracking-tight">SmartSplit</h1>
            <p className="mt-2 text-gray-600">輕鬆分帳，智慧結算</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xl space-y-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5" /> 選擇群組
            </h2>
            <div className="space-y-3">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleGroupSelect(g.id)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-100 rounded-xl transition-all group"
                >
                  <span className="font-semibold text-gray-700 group-hover:text-indigo-700">{g.name}</span>
                  <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500" />
                </button>
              ))}
              {groups.length === 0 && (
                <div className="text-center text-gray-400 py-4">尚無群組</div>
              )}
            </div>
            
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">建立新群組</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="例如: 日本旅遊, 大學同學"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  onClick={handleCreateGroup}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Render 3: Add Expense ---
  if (view === 'ADD_EXPENSE' && currentGroup) {
      // (Expense Form Code - Mostly same as before, simplified for brevity)
      return (
        <div className="min-h-screen bg-gray-50 p-4">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-indigo-600 p-4 text-white flex items-center gap-3">
              <button onClick={() => setView('DASHBOARD')} className="p-1 hover:bg-indigo-500 rounded-full">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-lg font-bold">{editingExpenseId ? '編輯消費' : '新增消費'}</h2>
            </div>
            <div className="p-6 space-y-6">
                {/* Inputs: Date, Amount, Title */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500 font-medium">日期</label>
                    <input type="datetime-local" value={expDate} onChange={e => setExpDate(e.target.value)} className="w-full mt-1 p-2 border rounded-lg"/>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium">金額</label>
                    <input type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)} className="w-full mt-1 p-2 border rounded-lg"/>
                  </div>
                </div>
                <div>
                   <label className="text-sm text-gray-500 font-medium">項目</label>
                   <input type="text" value={expTitle} onChange={e => setExpTitle(e.target.value)} className="w-full mt-1 p-2 border rounded-lg"/>
                </div>

                {/* Payers Section */}
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                   <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2"><Wallet className="w-4 h-4"/> 付款人</h3>
                   <div className="space-y-2">
                       {currentGroup.members.map(m => (
                           <div key={m.id} className="flex justify-between items-center">
                               <label className="flex items-center gap-2 text-gray-700">
                                   <input type="checkbox" checked={expPayers[m.id] !== undefined} 
                                      onChange={e => {
                                          const next = {...expPayers};
                                          if(e.target.checked) next[m.id] = 0; else delete next[m.id];
                                          setExpPayers(next);
                                      }}
                                   />
                                   {m.name} {m.id === myMemberId && <span className="text-xs text-blue-500">(我)</span>}
                               </label>
                               {expPayers[m.id] !== undefined && (
                                   <input type="number" value={expPayers[m.id] || ''} onChange={e => setExpPayers({...expPayers, [m.id]: parseFloat(e.target.value)||0})} className="w-20 p-1 border rounded text-right"/>
                               )}
                           </div>
                       ))}
                   </div>
                </div>

                {/* Splitters Section */}
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                   <div className="flex justify-between items-center mb-2">
                       <h3 className="font-bold text-green-800 flex items-center gap-2"><PieChart className="w-4 h-4"/> 分帳人</h3>
                       <div className="flex bg-white rounded-lg p-1 border border-green-200">
                           <button onClick={()=>setSplitMode('EQUAL')} className={`px-2 py-1 text-xs rounded ${splitMode==='EQUAL'?'bg-green-100 text-green-700 font-bold':''}`}>平分</button>
                           <button onClick={()=>setSplitMode('CUSTOM')} className={`px-2 py-1 text-xs rounded ${splitMode==='CUSTOM'?'bg-green-100 text-green-700 font-bold':''}`}>自訂</button>
                       </div>
                   </div>
                   <div className="space-y-2">
                       {currentGroup.members.map(m => (
                           <div key={m.id} className="flex justify-between items-center">
                               <label className="flex items-center gap-2 text-gray-700">
                                   <input type="checkbox" checked={expSplitters[m.id] !== undefined} 
                                      onChange={e => {
                                          const next = {...expSplitters};
                                          if(e.target.checked) next[m.id] = 0; else delete next[m.id];
                                          setExpSplitters(next);
                                      }}
                                   />
                                   {m.name}
                               </label>
                               {splitMode === 'CUSTOM' && expSplitters[m.id] !== undefined && (
                                   <input type="number" value={expSplitters[m.id] || ''} onChange={e => setExpSplitters({...expSplitters, [m.id]: parseFloat(e.target.value)||0})} className="w-20 p-1 border rounded text-right"/>
                               )}
                           </div>
                       ))}
                   </div>
                </div>

                <button onClick={handleSaveExpense} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">確認儲存</button>
            </div>
          </div>
        </div>
      );
  }

  // --- Render 4: Settlement ---
  if (view === 'SETTLEMENT' && currentGroup) {
      return (
        <div className="min-h-screen bg-gray-50 p-4">
          <div className="max-w-3xl mx-auto space-y-6">
             <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('DASHBOARD')} className="bg-white p-2 rounded-full shadow hover:bg-gray-50">
                    <ChevronLeft className="w-6 h-6 text-gray-600"/>
                </button>
                <h1 className="text-2xl font-bold text-gray-800">結算明細</h1>
            </div>
            
            {isExplaining ? (
                <div className="text-center py-20 bg-white rounded-xl shadow"><Loader2 className="animate-spin w-8 h-8 mx-auto text-indigo-500 mb-2"/> AI 計算中...</div>
            ) : settlementResult ? (
                <>
                    {/* NEW: Calculation Logic & Raw Debts */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                             <Lightbulb className="w-5 h-5 text-amber-500"/> AI 智慧算帳詳情
                        </h3>
                        
                        <div className="space-y-4 text-sm">
                            <div className="bg-gray-50 p-4 rounded-xl">
                                <h4 className="font-bold text-gray-500 mb-2 text-xs uppercase tracking-wide">原始帳務 (未抵銷前)</h4>
                                <ul className="space-y-1 text-gray-700">
                                    {settlementResult.rawDebts.map((debt, i) => (
                                        <li key={i}>{debt}</li>
                                    ))}
                                    {settlementResult.rawDebts.length === 0 && <li>無原始債務</li>}
                                </ul>
                            </div>
                            
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                <h4 className="font-bold text-indigo-800 mb-2 text-xs uppercase tracking-wide">AI 優化邏輯</h4>
                                <p className="text-indigo-700 leading-relaxed">
                                    {settlementResult.explanation}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* All Transactions (The Solution) */}
                    <div className="bg-white p-6 rounded-2xl border-l-4 border-green-500 shadow-md">
                        <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                             <CheckCircle className="w-5 h-5 text-green-600"/> 最終還款方案
                        </h3>
                        <div className="space-y-3">
                            {settlementResult.transactions.length > 0 ? (
                                settlementResult.transactions.map((t, i) => (
                                    <div key={i} className="flex items-center justify-between bg-green-50 p-4 rounded-xl border border-green-100">
                                        <div className="flex items-center gap-3 text-lg">
                                            <span className="font-bold text-gray-700">{t.fromName}</span>
                                            <ArrowRight className="text-green-300 w-5 h-5" />
                                            <span className="font-bold text-gray-700">{t.toName}</span>
                                        </div>
                                        <div className="text-xl font-mono font-bold text-green-700">
                                            ${t.amount}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">無須還款（帳務已平衡）</div>
                            )}
                        </div>

                        {/* Admin Action: Clear ALL */}
                        <button 
                            onClick={handleClearAllDebt}
                            disabled={isProcessingHistory}
                            className={`mt-6 w-full py-4 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all
                                ${isProcessingHistory
                                    ? 'bg-gray-400 cursor-not-allowed shadow-none' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
                            `}
                        >
                            {isProcessingHistory ? <Loader2 className="animate-spin"/> : <Archive/>}
                            {isProcessingHistory ? "歸檔處理中..." : "清償所有欠款 (歸檔本次活動)"}
                        </button>
                        <p className="text-xs text-center text-gray-400 mt-2">
                            按下歸檔後，系統將清空所有消費，生成歷史圖表，讓您開始新一輪記帳。
                        </p>
                    </div>
                </>
            ) : null}
          </div>
        </div>
      );
  }

  // --- Render 5: Dashboard (Main) ---
  const activeExpenses = currentGroup?.expenses || [];
  const historyCount = (currentGroup?.history?.length || 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
       {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <button onClick={() => setCurrentGroupId(null)} className="text-gray-400 hover:text-gray-600">
                    <LogOut className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {currentGroup?.name}
                        {/* Delete Group Button */}
                        <button onClick={handleDeleteGroup} className="text-gray-300 hover:text-red-500 p-1">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                         <span>{currentGroup?.members.length} 位成員</span>
                         <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                             我: {currentMemberMap.get(myMemberId!) || '未連結'}
                         </span>
                    </div>
                </div>
            </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-4 pb-24">
         {/* Member Status Bar */}
         <div className="mb-6 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2">
                {currentGroup?.members.map(m => (
                    <div key={m.id} className="relative group flex-shrink-0">
                         {/* Member Chip */}
                        <div className={`px-3 py-1.5 rounded-full border text-sm font-medium flex items-center gap-1 bg-white border-gray-200 text-gray-700 ${isDeleteMemberMode ? 'ring-2 ring-red-200' : ''}`}>
                            {m.name}
                            {/* Delete Mode Trigger */}
                            {isDeleteMemberMode && (
                                <button 
                                    onClick={() => handleDeleteMember(m.id)}
                                    className="ml-1 bg-red-100 text-red-600 rounded-full p-0.5 hover:bg-red-200"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                
                {/* Member Controls (Add & Delete Mode Toggle) */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    {!isDeleteMemberMode ? (
                        <>
                            <div className="flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                                <input type="text" placeholder="新成員..." value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} className="bg-transparent w-20 text-sm outline-none"/>
                                <button onClick={handleAddMember} className="bg-indigo-600 text-white rounded-full p-0.5"><Plus className="w-3 h-3"/></button>
                            </div>
                            <button onClick={() => setIsDeleteMemberMode(true)} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors">
                                <UserMinus className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsDeleteMemberMode(false)} className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-full text-sm font-bold hover:bg-gray-300">
                            完成編輯
                        </button>
                    )}
                </div>
            </div>
         </div>

         {/* Active Expenses Area */}
         <div className="space-y-4">
             {activeExpenses.length === 0 ? (
                 <div className="text-center py-10">
                     <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-indigo-50">
                         <CreditCard className="w-8 h-8 text-indigo-400"/>
                     </div>
                     <h3 className="text-gray-900 font-medium">
                         還沒有消費紀錄
                     </h3>
                     <p className="text-gray-500 text-sm">
                         點擊下方按鈕新增第一筆支出
                     </p>
                 </div>
             ) : (
                // Group Expenses by Date
                [...new Set(activeExpenses.map(e => e.date.split('T')[0]))].sort().reverse().map((dateStr: string) => (
                    <div key={dateStr}>
                        <h3 className="text-xs font-bold text-gray-400 uppercase sticky top-20 bg-gray-50 py-1">{new Date(dateStr).toLocaleDateString()}</h3>
                        <div className="space-y-3">
                            {activeExpenses.filter(e => e.date.startsWith(dateStr)).sort((a,b)=>b.timestamp-a.timestamp).map(expense => (
                                <div key={expense.id} onClick={()=>setExpandedExpenseId(expandedExpenseId===expense.id?null:expense.id)} 
                                     className={`bg-white rounded-xl border transition-all overflow-hidden cursor-pointer ${expandedExpenseId===expense.id?'border-indigo-200 shadow-md':'border-gray-100 shadow-sm'}`}>
                                    <div className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-gray-100 p-2 rounded-lg text-gray-500"><Wallet className="w-5 h-5"/></div>
                                            <div>
                                                <h4 className="font-bold text-gray-800">{expense.title}</h4>
                                                <p className="text-xs text-gray-500">{currentMemberMap.get(expense.paidBy[0]?.memberId) || '多人'} 先付</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold text-gray-900">${expense.totalAmount}</span>
                                        </div>
                                    </div>
                                    {/* Expanded Details */}
                                    {expandedExpenseId===expense.id && (
                                        <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 text-sm">
                                            {/* (Details omitted for brevity, logic same as before) */}
                                            <button onClick={(e)=>{e.stopPropagation(); openAddExpense(expense)}} className="mt-2 w-full py-2 bg-white border border-gray-300 rounded text-xs font-bold text-gray-600">編輯</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))
             )}
         </div>

         {/* History Separator */}
         {historyCount > 0 && (
             <div className="relative py-10 mt-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-dashed border-gray-300"></div></div>
                <div className="relative flex justify-center"><span className="px-4 bg-gray-50 text-sm font-bold text-gray-500 uppercase flex items-center gap-2"><Archive className="w-4 h-4"/> 歷史紀錄與結算</span></div>
             </div>
         )}

         {/* History List */}
         <div className="space-y-8">
             {currentGroup?.history.map(record => (
                 <div key={record.id} className={record.isPartial ? "opacity-100" : "opacity-80 grayscale-[0.3] hover:grayscale-0 transition-all"}>
                    {record.isPartial && (
                        <div className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-t-lg inline-block transform translate-y-1 ml-4">
                            進行中 (尚有成員未結算)
                        </div>
                    )}
                    <HistoryTimeline history={record} />
                 </div>
             ))}
         </div>
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50">
        <button onClick={() => openAddExpense()} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-indigo-700 font-bold text-lg"><Plus className="w-6 h-6"/> 記一筆</button>
        {activeExpenses.length > 0 && (
            <button onClick={handleCalculateSettlement} className="flex items-center gap-2 bg-white text-gray-800 px-6 py-3 rounded-full shadow-lg border border-gray-100 font-bold"><Calculator className="w-5 h-5 text-green-500"/> 結算</button>
        )}
      </div>
    </div>
  );
};

export default App;
