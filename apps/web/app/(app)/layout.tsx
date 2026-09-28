import { AppHeader } from "@/components/app-header";
import BottomNav from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />
      <main className="flex-1 w-full max-w-[960px] mx-auto pb-20 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
