import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-secondary/30">
      <AdminSidebar />
      <main className="flex-1 p-4 pt-20 lg:p-8 lg:pt-8 overflow-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
