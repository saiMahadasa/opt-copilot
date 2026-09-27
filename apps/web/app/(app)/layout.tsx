import BottomNav from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[420px] mx-auto">
      {children}
      <BottomNav />
    </div>
  );
}
