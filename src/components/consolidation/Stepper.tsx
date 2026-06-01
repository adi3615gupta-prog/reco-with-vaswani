import { Check, Upload, Settings, Table, Building2 } from "lucide-react";

const steps = [
  { label: "Company Info", icon: Building2 },
  { label: "Upload File", icon: Upload },
  { label: "Map Ledgers", icon: Settings },
  { label: "View & Export", icon: Table },
];

interface StepperProps {
  currentStep: number;
}

export function Stepper({ currentStep }: StepperProps) {
  return (
    <nav className="w-full max-w-3xl mx-auto mb-12">
      <div className="flex items-center justify-between relative">
        {/* progress line background */}
        <div className="absolute top-5 left-0 w-full h-px bg-border -z-10" />
        {/* progress line active */}
        <div
          className="absolute top-5 left-0 h-px bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] -z-10 transition-all duration-500"
          style={{
            width: `${steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 0}%`,
            boxShadow: "0 0 8px hsl(var(--primary) / 0.6)",
          }}
        />
        {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const Icon = done ? Check : step.icon;

        return (
          <div key={step.label} className="flex flex-col items-center gap-3 group">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                done
                  ? "bg-gradient-primary text-primary-foreground border border-primary/30 shadow-glow"
                  : active
                  ? "bg-primary text-primary-foreground border border-primary/30 shadow-glow"
                  : "bg-card border border-border text-muted-foreground group-hover:border-muted-foreground/40"
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                active || done ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
      </div>
    </nav>
  );
}
