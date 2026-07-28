export function DashboardHeader() {
  return (
    <div className="border border-black bg-[#f5f5f5]">
      <div className="border-b border-black p-3 bg-black text-white">
        <h1 className="font-black text-xl uppercase">MY MISSIONS</h1>
      </div>
      <div className="p-4">
        <p className="font-mono text-xs opacity-60">
          View and manage all your missions - executing and completed
        </p>
      </div>
    </div>
  );
}