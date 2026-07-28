// Shared transaction progress bar for inline execution cards
'use client';

interface StepDef {
  key: string;
  label: string;
  /** Short one-liner explaining what this step does. Rendered under the bar when the step is active. */
  hint?: string;
}

interface TxProgressBarProps {
  steps: StepDef[];
  currentStep: string;
  failed: boolean;
  statusMessage: string;
}

export function TxProgressBar({ steps, currentStep, failed, statusMessage }: TxProgressBarProps) {
  const activeIdx = steps.findIndex(s => s.key === currentStep);
  const activeStep = activeIdx >= 0 ? steps[activeIdx] : null;

  return (
    <div className="px-4 py-2.5 bg-[#f7f7f7] border-t border-[#e5e7eb]">
      {/* Segmented bar */}
      <div className="flex gap-1">
        {steps.map((step, i) => {
          const isComplete = activeIdx > i || currentStep === 'completed';
          const isActive = activeIdx === i && currentStep !== 'completed' && !failed;
          const isError = failed && activeIdx === i;

          return (
            <div
              key={step.key}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                isComplete ? 'bg-green-500' :
                isActive ? 'bg-[#1a1a1a] animate-pulse' :
                isError ? 'bg-red-500' :
                'bg-[#e0e0e0]'
              }`}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex mt-1">
        {steps.map((step, i) => {
          const isComplete = activeIdx > i || currentStep === 'completed';
          const isActive = activeIdx === i && currentStep !== 'completed' && !failed;
          const isError = failed && activeIdx === i;

          return (
            <span
              key={step.key}
              className={`flex-1 text-center text-[9px] font-semibold uppercase tracking-wider ${
                isComplete ? 'text-green-600' :
                isActive ? 'text-[#1a1a1a]' :
                isError ? 'text-red-500' :
                'text-[#b0b0b0]'
              }`}
            >
              {step.label}
            </span>
          );
        })}
      </div>

      {/* Step hint — contextual explainer for the active step */}
      {!failed && activeStep?.hint && (
        <p className="text-[10px] text-[#9ca3af] mt-1.5 text-center leading-snug">
          {activeStep.hint}
        </p>
      )}

      {/* Status message */}
      {statusMessage && (
        <p className="text-[11px] text-[#6b7280] mt-1.5 text-center">{statusMessage}</p>
      )}
    </div>
  );
}
