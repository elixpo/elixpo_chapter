
import { Loader2 } from "lucide-react";


interface LoadingStepProps {
  currentStep: number;
  step: number;
  label: string;
}
export const LoadingStep: React.FC<LoadingStepProps> = ({
  currentStep,
  step,
  label,
}) => (
  <div className="flex items-center gap-2 mb-2 justify-center h-screen">
    <div
      className={`rounded-full p-1 ${
        currentStep === step
          ? "bg-red-100"
          : currentStep > step
          ? "bg-green-100"
          : "bg-gray-100"
      }`}
    >
      {currentStep > step ? (
        <svg
          className="h-4 w-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : currentStep === step ? (
        <Loader2 className="h-4 w-4 text-red-500 animate-spin" />
      ) : (
        <div className="h-4 w-4 rounded-full bg-gray-300" />
      )}
    </div>
    <span
      className={`text-sm ${
        currentStep === step
          ? "text-red-600 font-medium"
          : currentStep > step
          ? "text-green-600"
          : "text-gray-500"
      }`}
    >
      {label}
    </span>
  </div>
);
