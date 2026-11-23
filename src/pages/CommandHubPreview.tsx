import { CommandHub } from '@/components/ui/command-hub';

/** Logged-out preview of the Command Hub with sample numbers. */
export default function CommandHubPreview() {
  return (
    <div className="min-h-svh bg-slate-50 p-6 sm:p-10">
      <CommandHub
        userName="Sourav Vaswani"
        designation="Partner"
        department="Audit"
        counts={{ r1Pending: 482, gstr3bPending: 451, monthlyAuditPending: 1 }}
        onNavigate={(route) => console.info('navigate', route)}
        onOpenDrill={(drill) => console.info('drill', drill)}
      />
    </div>
  );
}
