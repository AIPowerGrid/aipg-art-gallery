import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

const ToolTipComponent = ({ tooltipText }: any) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger type="button">
          <Info className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ToolTipComponent;
