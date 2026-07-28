// components/dashboard/activity/exportCsv.ts
import type { UnifiedTrade } from '@/lib/types/trading-activity';

export function exportTradesToCsv(trades: UnifiedTrade[]) {
  const headers = ['Date', 'Source', 'Side', 'Title', 'Subtitle', 'Amount (USD)', 'Price', 'Size', 'P&L', 'Agent', 'Tx Hash'];

  const rows = trades.map((t) => [
    t.timestamp ? new Date(t.timestamp).toISOString() : '',
    t.source,
    t.side,
    t.title,
    t.subtitle,
    Math.abs(t.amount).toFixed(2),
    t.price?.toString() ?? '',
    t.size?.toString() ?? '',
    t.pnl?.toFixed(2) ?? '',
    t.agentName ?? '',
    t.txHash ?? '',
  ]);

  const csv = [headers, ...rows].map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trading-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
