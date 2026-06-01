import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, ArrowRight } from "lucide-react";

export interface CompanyInfo {
  name: string;
}

interface Props {
  initial?: CompanyInfo;
  onContinue: (info: CompanyInfo) => void;
}

export function CompanyInfoForm({ initial, onContinue }: Props) {
  const [name, setName] = useState(initial?.name ?? "");

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative bg-card/40 backdrop-blur-xl border border-border/60 rounded-3xl p-8 md:p-10 shadow-elegant">
        {/* top accent line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/4 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        <div className="flex items-start gap-5 mb-8">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">Company Name</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Whose Tally data are you consolidating?
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-muted-foreground ml-1">
              Company Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ABC Enterprises Pvt. Ltd."
              autoFocus
              className="h-14 rounded-xl bg-background/60 border-border px-5 text-base focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => onContinue({ name: name.trim() })}
              disabled={!name.trim()}
              className="h-12 px-8 rounded-xl bg-gradient-primary hover:opacity-90 shadow-elegant transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
