import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export const metadata = {
  title: 'Admin — SUPERMISSION',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-[#f8fafc] text-[#1a1a1a]">
        <AdminSidebar />
        <main className="flex-1 overflow-x-auto pt-12 md:pt-0">{children}</main>
      </div>
    </AdminGuard>
  );
}
