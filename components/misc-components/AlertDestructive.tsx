import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AlertCircle } from "lucide-react";

type DestructiveProps = {
  title: string;
  text: string;
  className: string;
};

export function AlertDestructive({ title, text, className }: DestructiveProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-6 w-6" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
