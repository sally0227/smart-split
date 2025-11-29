import React from 'react';
import { HistoryRecord } from '../types';

interface HistoryTimelineProps {
  history: HistoryRecord;
}

export const HistoryTimeline: React.FC<HistoryTimelineProps> = ({ history }) => {
  // Fallback: If no SVG, sort expenses manually
  const sortedExpenses = [...history.expenses].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-800 mb-2">
          {new Date(history.startDate).toLocaleDateString()} - {new Date(history.endDate).toLocaleDateString()}
        </h3>
        <div className="p-4 bg-indigo-50 rounded-xl text-indigo-800 text-sm leading-relaxed border-l-4 border-indigo-500">
           {history.summary}
        </div>
      </div>

      {/* AI Generated Visualization (The "Canvas") */}
      {history.visualGraph ? (
        <div className="w-full overflow-x-auto bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
             <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">Gemini Canvas Timeline</div>
             <div 
                className="w-full flex justify-center"
                dangerouslySetInnerHTML={{ __html: history.visualGraph }} 
             />
        </div>
      ) : (
        /* Fallback List View */
        <div className="relative border-l-2 border-gray-200 ml-3 space-y-8 pb-4">
          {sortedExpenses.map((exp) => (
            <div key={exp.id} className="mb-8 relative pl-8">
              <span className="absolute -left-[9px] top-1 h-5 w-5 rounded-full border-4 border-white bg-indigo-500 ring-2 ring-indigo-100"></span>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition-colors">
                <div>
                   <span className="text-xs text-gray-500 font-mono block mb-1">
                    {new Date(exp.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <h4 className="font-semibold text-gray-800 text-md">{exp.title}</h4>
                </div>
                <div className="mt-2 sm:mt-0 text-right">
                  <span className="block font-bold text-indigo-600 text-lg">
                    ${exp.totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Settlement Summary Footer */}
      <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="bg-green-50 p-4 rounded-lg border border-green-100">
            <h4 className="font-bold text-green-800 mb-2 text-sm">結算方案存檔</h4>
            <div className="space-y-1 text-sm text-green-700">
              {history.settlementPlan.map((t, i) => (
                <div key={i} className="flex justify-between border-b border-green-200/50 last:border-0 py-1">
                   <span>{t.from} <span className="text-green-500">➔</span> {t.to}</span>
                   <span className="font-mono font-bold">${t.amount}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-green-200 text-right font-bold text-green-900">
              總消費: ${history.totalSpent.toLocaleString()}
            </div>
          </div>
      </div>
    </div>
  );
};
